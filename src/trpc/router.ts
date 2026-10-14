/**
 * tRPC API (HLD: type-safe API). End-to-end typed procedures over the same service layer as
 * GraphQL and gRPC. Mutations always act as the authenticated user (never as a user id taken
 * from the input), inputs are validated with Zod.
 *
 * Client usage:  createTRPCProxyClient<AppRouter>({ links: [httpBatchLink({ url: '/trpc', headers }) ] })
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { AuthUser } from '../middleware/auth';
import { AppError, ErrorCode } from '../utils/errors';
import * as auth from '../services/auth.service';
import * as users from '../services/user.service';
import * as posts from '../services/post.service';
import * as comments from '../services/comment.service';
import * as follows from '../services/follow.service';
import * as feed from '../services/feed.service';
import * as search from '../services/search.service';
import * as notifications from '../services/notification.service';
import { graph } from '../services/graph/graph.service';
import User from '../models/User';
import { commentDTO, postDTO, userDTO } from '../services/dto';
import { mediaFromUrl } from '../utils/uploads';

export interface TrpcContext {
  user: AuthUser | null;
  ip: string;
  userAgent?: string;
}

const t = initTRPC.context<TrpcContext>().create();

const CODE_MAP: Record<ErrorCode, TRPCError['code']> = {
  UNAUTHENTICATED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_USER_INPUT: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
  TWO_FACTOR_REQUIRED: 'UNAUTHORIZED',
  ACCOUNT_LOCKED: 'FORBIDDEN',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
};

/** Maps domain errors to tRPC error codes. */
const domainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    throw new TRPCError({ code: CODE_MAP[result.error.cause.code], message: result.error.cause.message, cause: result.error.cause });
  }
  return result;
});

const publicProcedure = t.procedure.use(domainErrors);
const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be signed in' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const id = z.string().min(1);
const page = { limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() };

const session = (r: auth.AuthResult) => ({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: userDTO(r.user) });

export const router = t.router({
  auth: t.router({
    register: publicProcedure
      .input(z.object({ username: z.string().min(3).max(30), email: z.string().email(), password: z.string().min(8).max(128), displayName: z.string().max(60).optional() }))
      .mutation(async ({ input, ctx }) => session(await auth.register(input, ctx.userAgent))),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1), twoFactorCode: z.string().optional() }))
      .mutation(async ({ input, ctx }) => session(await auth.login(input, ctx.userAgent))),
    refresh: publicProcedure.input(z.object({ refreshToken: z.string() })).mutation(async ({ input, ctx }) => session(await auth.refresh(input.refreshToken, ctx.userAgent)))
  }),

  user: t.router({
    me: protectedProcedure.query(async ({ ctx }) => userDTO(await users.getUser(ctx.user.id))),
    byId: publicProcedure.input(z.object({ id })).query(async ({ input }) => userDTO(await users.getUser(input.id))),
    byUsername: publicProcedure.input(z.object({ username: z.string() })).query(async ({ input }) => userDTO(await users.getUserByUsername(input.username))),
    updateProfile: protectedProcedure
      .input(z.object({ displayName: z.string().max(60).optional(), bio: z.string().max(500).optional(), website: z.string().optional(), location: z.string().max(100).optional(), isPrivate: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => userDTO(await users.updateProfile(ctx.user.id, input))),
    list: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }))
      .query(async ({ input }) => (await User.find().sort({ followerCount: -1, _id: 1 }).skip(input.offset).limit(input.limit)).map(userDTO)),
    search: publicProcedure.input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) })).query(async ({ input }) => (await search.searchUsers(input.query, input.limit)).map(userDTO))
  }),

  post: t.router({
    byId: publicProcedure.input(z.object({ id })).query(async ({ input, ctx }) => postDTO(await posts.getVisiblePost(ctx.user?.id, input.id))),
    create: protectedProcedure
      .input(z.object({ content: z.string().max(5000).optional(), mediaUrls: z.array(z.string()).max(10).optional(), groupId: z.string().optional(), pageId: z.string().optional() }))
      .mutation(async ({ input, ctx }) => postDTO(await posts.createPost(ctx.user.id, { content: input.content, media: (input.mediaUrls ?? []).map(mediaFromUrl), groupId: input.groupId, pageId: input.pageId }))),
    update: protectedProcedure.input(z.object({ id, content: z.string().max(5000) })).mutation(async ({ input, ctx }) => postDTO(await posts.updatePost(ctx.user.id, input.id, input.content))),
    delete: protectedProcedure.input(z.object({ id })).mutation(({ input, ctx }) => posts.deletePost(ctx.user, input.id)),
    explore: publicProcedure.input(z.object(page)).query(async ({ input, ctx }) => {
      const r = await posts.explorePosts(ctx.user?.id, input);
      return { nodes: r.nodes.map(postDTO), nextCursor: r.nextCursor, hasMore: r.hasMore };
    }),
    byUser: publicProcedure.input(z.object({ userId: id, ...page })).query(async ({ input, ctx }) => {
      const r = await posts.userPosts(ctx.user?.id, input.userId, input);
      return { nodes: r.nodes.map(postDTO), nextCursor: r.nextCursor, hasMore: r.hasMore };
    }),
    feed: protectedProcedure.input(z.object({ ...page, refresh: z.boolean().optional() })).query(async ({ input, ctx }) => {
      const r = await feed.getFeed(ctx.user.id, input);
      return { items: r.items.map((i) => ({ post: postDTO(i.post), score: i.score, reason: i.reason })), nextCursor: r.nextCursor, hasMore: r.hasMore };
    }),
    trendingHashtags: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(10) })).query(({ input }) => posts.trendingHashtags(input.limit))
  }),

  follow: t.router({
    follow: protectedProcedure.input(z.object({ userId: id })).mutation(async ({ input, ctx }) => userDTO(await follows.follow(ctx.user.id, input.userId))),
    unfollow: protectedProcedure.input(z.object({ userId: id })).mutation(async ({ input, ctx }) => userDTO(await follows.unfollow(ctx.user.id, input.userId))),
    followers: publicProcedure.input(z.object({ userId: id, ...page })).query(async ({ input }) => {
      const r = await follows.followers(input.userId, input.limit, input.cursor);
      return { nodes: r.nodes.map(userDTO), nextCursor: r.nextCursor, hasMore: r.hasMore };
    }),
    following: publicProcedure.input(z.object({ userId: id, ...page })).query(async ({ input }) => {
      const r = await follows.following(input.userId, input.limit, input.cursor);
      return { nodes: r.nodes.map(userDTO), nextCursor: r.nextCursor, hasMore: r.hasMore };
    })
  }),

  like: t.router({
    like: protectedProcedure.input(z.object({ postId: id })).mutation(async ({ input, ctx }) => postDTO(await posts.likePost(ctx.user.id, input.postId))),
    unlike: protectedProcedure.input(z.object({ postId: id })).mutation(async ({ input, ctx }) => postDTO(await posts.unlikePost(ctx.user.id, input.postId))),
    likes: publicProcedure.input(z.object({ postId: id, limit: z.number().int().min(1).max(100).default(20) })).query(async ({ input }) => (await posts.postLikers(input.postId, input.limit)).map(userDTO))
  }),

  comment: t.router({
    create: protectedProcedure
      .input(z.object({ postId: id, content: z.string().min(1).max(1000), parentId: z.string().optional() }))
      .mutation(async ({ input, ctx }) => commentDTO(await comments.addComment(ctx.user.id, input.postId, input.content, input.parentId))),
    list: publicProcedure.input(z.object({ postId: id, ...page })).query(async ({ input, ctx }) => {
      const r = await comments.listComments(ctx.user?.id, input.postId, input);
      return { nodes: r.nodes.map(commentDTO), nextCursor: r.nextCursor, hasMore: r.hasMore };
    }),
    delete: protectedProcedure.input(z.object({ id })).mutation(({ input, ctx }) => comments.deleteComment(ctx.user, input.id))
  }),

  graph: t.router({
    shortestPath: protectedProcedure.input(z.object({ toUserId: id })).query(({ input, ctx }) => graph.shortestPath(ctx.user.id, input.toUserId)),
    mutualFriends: protectedProcedure.input(z.object({ userId: id })).query(async ({ input, ctx }) => {
      const ids = await graph.mutualConnections(ctx.user.id, input.userId);
      return (await User.find({ _id: { $in: ids } })).map(userDTO);
    }),
    recommendations: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(30).default(10) })).query(async ({ input, ctx }) => {
      const r = await follows.suggestions(ctx.user.id, input.limit);
      return r.map((x) => ({ user: userDTO(x.user), mutualCount: x.mutualCount }));
    })
  }),

  notification: t.router({
    list: protectedProcedure.input(z.object({ unreadOnly: z.boolean().optional(), ...page })).query(async ({ input, ctx }) => {
      const r = await notifications.listNotifications(ctx.user.id, input);
      return {
        nodes: r.nodes.map((n) => ({ id: n.id, type: n.type, message: n.message, read: n.read, senderId: n.sender?.toString() ?? null, postId: n.post?.toString() ?? null, createdAt: n.createdAt.toISOString() })),
        nextCursor: r.nextCursor,
        hasMore: r.hasMore
      };
    }),
    unreadCount: protectedProcedure.query(({ ctx }) => notifications.unreadCount(ctx.user.id)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => notifications.markAllRead(ctx.user.id))
  }),

  search: t.router({
    posts: publicProcedure.input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) })).query(async ({ input, ctx }) => (await search.searchPosts(input.query, null, ctx.user?.id, input.limit)).map(postDTO)),
    autocomplete: publicProcedure.input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(25).default(10) })).query(({ input }) => search.autocomplete(input.query, input.limit))
  })
});

export type AppRouter = typeof router;
