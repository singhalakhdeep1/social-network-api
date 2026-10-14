/**
 * gRPC server (HLD: gRPC services). Handlers are thin adapters over the shared service layer,
 * with JWT auth from call metadata, domain-error → gRPC-status mapping and two server streams.
 */
import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { env } from '../config/env';
import { AuthUser, authenticate, extractBearer } from '../middleware/auth';
import { AppError, ErrorCode, unauthenticated } from '../utils/errors';
import * as auth from '../services/auth.service';
import * as users from '../services/user.service';
import * as posts from '../services/post.service';
import * as comments from '../services/comment.service';
import * as follows from '../services/follow.service';
import * as feed from '../services/feed.service';
import * as search from '../services/search.service';
import * as notifications from '../services/notification.service';
import { graph } from '../services/graph/graph.service';
import { mediaFromUrl } from '../utils/uploads';
import { commentDTO, postDTO, userDTO } from '../services/dto';
import { pubsub, TOPICS } from '../events/pubsub';
import Notification from '../models/Notification';
import Post from '../models/Post';
import User from '../models/User';
import logger from '../utils/logger';

const STATUS: Record<ErrorCode, grpc.status> = {
  UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
  FORBIDDEN: grpc.status.PERMISSION_DENIED,
  NOT_FOUND: grpc.status.NOT_FOUND,
  BAD_USER_INPUT: grpc.status.INVALID_ARGUMENT,
  CONFLICT: grpc.status.ALREADY_EXISTS,
  RATE_LIMITED: grpc.status.RESOURCE_EXHAUSTED,
  TWO_FACTOR_REQUIRED: grpc.status.UNAUTHENTICATED,
  ACCOUNT_LOCKED: grpc.status.PERMISSION_DENIED,
  INTERNAL_SERVER_ERROR: grpc.status.INTERNAL
};

const toGrpcError = (err: unknown): grpc.ServiceError => {
  if (err instanceof AppError) return { code: STATUS[err.code], message: err.message, details: err.message, name: 'Error', metadata: new grpc.Metadata() };
  logger.error(`gRPC internal error: ${(err as Error).stack ?? err}`);
  return { code: grpc.status.INTERNAL, message: 'Internal error', details: 'Internal error', name: 'Error', metadata: new grpc.Metadata() };
};

type Call<Req> = grpc.ServerUnaryCall<Req, unknown>;
type Handler<Req, Res> = (req: Req, user: AuthUser | null, call: Call<Req>) => Promise<Res>;

const callerOf = async (call: { metadata: grpc.Metadata }): Promise<AuthUser | null> => authenticate(extractBearer(String(call.metadata.get('authorization')[0] ?? '')));
const need = (u: AuthUser | null): AuthUser => {
  if (!u) throw unauthenticated();
  return u;
};
const num = (n: number | undefined, fallback: number) => (n && n > 0 ? n : fallback);
const str = (s: string | undefined) => (s ? s : undefined);

/** Wraps an async handler into a grpc-js unary handler. */
const unary =
  <Req, Res>(fn: Handler<Req, Res>): grpc.handleUnaryCall<Req, Res> =>
  (call, callback) => {
    callerOf(call)
      .then((user) => fn(call.request, user, call as unknown as Call<Req>))
      .then((res) => callback(null, res))
      .catch((err) => callback(toGrpcError(err)));
  };

const session = (r: auth.AuthResult) => ({ access_token: r.accessToken, refresh_token: r.refreshToken, user: snakeUser(userDTO(r.user)) });

// proto field names are snake_case; the DTOs are camelCase
const snakeUser = (u: ReturnType<typeof userDTO>) => ({
  id: u.id,
  username: u.username,
  display_name: u.displayName,
  bio: u.bio,
  avatar: u.avatar,
  is_verified: u.isVerified,
  is_private: u.isPrivate,
  follower_count: u.followerCount,
  following_count: u.followingCount,
  post_count: u.postCount,
  created_at: u.createdAt
});
const snakePost = (p: ReturnType<typeof postDTO>) => ({
  id: p.id,
  author_id: p.authorId,
  content: p.content,
  media: p.media,
  hashtags: p.hashtags,
  like_count: p.likeCount,
  comment_count: p.commentCount,
  shares_count: p.sharesCount,
  reaction_count: p.reactionCount,
  created_at: p.createdAt,
  updated_at: p.updatedAt
});
const snakeComment = (c: ReturnType<typeof commentDTO>) => ({
  id: c.id,
  post_id: c.postId,
  author_id: c.authorId,
  parent_id: c.parentId,
  content: c.content,
  like_count: c.likeCount,
  reply_count: c.replyCount,
  created_at: c.createdAt
});
const userList = (docs: Parameters<typeof userDTO>[0][], extra: { total?: number; next_cursor?: string } = {}) => ({ users: docs.map((d) => snakeUser(userDTO(d))), total: extra.total ?? docs.length, next_cursor: extra.next_cursor ?? '' });

const protoPath = path.join(__dirname, 'service.proto');

let server: grpc.Server | null = null;

export const startGrpcServer = async (): Promise<void> => {
  const definition = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = (grpc.loadPackageDefinition(definition) as any).socialnetwork;

  server = new grpc.Server({ 'grpc.max_receive_message_length': 4 * 1024 * 1024 });

  server.addService(pkg.AuthService.service, {
    Register: unary(async (r: { username: string; email: string; password: string; display_name?: string }, _u, call) =>
      session(await auth.register({ username: r.username, email: r.email, password: r.password, displayName: str(r.display_name) }, String(call.metadata.get('user-agent')[0] ?? '')))
    ),
    Login: unary(async (r: { email: string; password: string; two_factor_code?: string }, _u, call) =>
      session(await auth.login({ email: r.email, password: r.password, twoFactorCode: str(r.two_factor_code) }, String(call.metadata.get('user-agent')[0] ?? '')))
    ),
    Refresh: unary(async (r: { refresh_token: string }) => session(await auth.refresh(r.refresh_token)))
  });

  server.addService(pkg.UserService.service, {
    GetUser: unary(async (r: { id: string }) => snakeUser(userDTO(await users.getUser(r.id)))),
    GetUserByUsername: unary(async (r: { username: string }) => snakeUser(userDTO(await users.getUserByUsername(r.username)))),
    UpdateProfile: unary(async (r: { display_name?: string; bio?: string; website?: string; location?: string }, u) =>
      snakeUser(userDTO(await users.updateProfile(need(u).id, { displayName: str(r.display_name), bio: r.bio || undefined, website: str(r.website), location: str(r.location) })))
    ),
    ListUsers: unary(async (r: { limit?: number; offset?: number }) => {
      const [docs, total] = await Promise.all([User.find().sort({ followerCount: -1, _id: 1 }).skip(r.offset ?? 0).limit(Math.min(num(r.limit, 20), 100)), User.countDocuments()]);
      return userList(docs, { total });
    }),
    SearchUsers: unary(async (r: { query: string; limit?: number }) => userList(await search.searchUsers(r.query, Math.min(num(r.limit, 20), 50))))
  });

  server.addService(pkg.PostService.service, {
    GetPost: unary(async (r: { id: string }, u) => snakePost(postDTO(await posts.getVisiblePost(u?.id, r.id)))),
    CreatePost: unary(async (r: { content?: string; media_urls?: string[] }, u) =>
      snakePost(postDTO(await posts.createPost(need(u).id, { content: str(r.content), media: (r.media_urls ?? []).map(mediaFromUrl) })))
    ),
    UpdatePost: unary(async (r: { id: string; content: string }, u) => snakePost(postDTO(await posts.updatePost(need(u).id, r.id, r.content)))),
    DeletePost: unary(async (r: { id: string }, u) => ({ success: await posts.deletePost(need(u), r.id) })),
    ListUserPosts: unary(async (r: { user_id: string; limit?: number; cursor?: string }, u) => {
      const page = await posts.userPosts(u?.id, r.user_id, { limit: num(r.limit, 20), cursor: str(r.cursor) });
      return { posts: page.nodes.map((p) => snakePost(postDTO(p))), next_cursor: page.nextCursor ?? '', has_more: page.hasMore };
    }),
    GetFeed: unary(async (r: { limit?: number; cursor?: string; refresh?: boolean }, u) => {
      const page = await feed.getFeed(need(u).id, { limit: num(r.limit, 20), cursor: str(r.cursor), refresh: r.refresh });
      return { items: page.items.map((i) => ({ post: snakePost(postDTO(i.post)), score: i.score, reason: i.reason })), next_cursor: page.nextCursor ?? '', has_more: page.hasMore };
    }),
    StreamNewPosts: (call: grpc.ServerWritableStream<unknown, unknown>) => {
      void streamFrom(call, async (viewer) => {
        const following = new Set(await follows.followingIds(viewer.id));
        return {
          iterator: pubsub.asyncIterator<{ id: string; authorId: string }>(TOPICS.POST_CREATED),
          accept: (p: { authorId: string }) => p.authorId === viewer.id || following.has(p.authorId),
          map: async (p: { id: string }) => {
            const post = await Post.findById(p.id);
            return post ? snakePost(postDTO(post)) : null;
          }
        };
      });
    }
  });

  server.addService(pkg.FollowService.service, {
    Follow: unary(async (r: { user_id: string }, u) => snakeUser(userDTO(await follows.follow(need(u).id, r.user_id)))),
    Unfollow: unary(async (r: { user_id: string }, u) => snakeUser(userDTO(await follows.unfollow(need(u).id, r.user_id)))),
    GetFollowers: unary(async (r: { user_id: string; limit?: number; cursor?: string }) => {
      const page = await follows.followers(r.user_id, num(r.limit, 20), str(r.cursor));
      return userList(page.nodes, { next_cursor: page.nextCursor ?? '' });
    }),
    GetFollowing: unary(async (r: { user_id: string; limit?: number; cursor?: string }) => {
      const page = await follows.following(r.user_id, num(r.limit, 20), str(r.cursor));
      return userList(page.nodes, { next_cursor: page.nextCursor ?? '' });
    })
  });

  server.addService(pkg.LikeService.service, {
    Like: unary(async (r: { post_id: string }, u) => snakePost(postDTO(await posts.likePost(need(u).id, r.post_id)))),
    Unlike: unary(async (r: { post_id: string }, u) => snakePost(postDTO(await posts.unlikePost(need(u).id, r.post_id)))),
    GetLikes: unary(async (r: { post_id: string; limit?: number }, u) => {
      await posts.getVisiblePost(u?.id, r.post_id);
      return userList(await posts.postLikers(r.post_id, num(r.limit, 20)));
    })
  });

  server.addService(pkg.CommentService.service, {
    CreateComment: unary(async (r: { post_id: string; content: string; parent_id?: string }, u) => snakeComment(commentDTO(await comments.addComment(need(u).id, r.post_id, r.content, str(r.parent_id))))),
    GetComments: unary(async (r: { post_id: string; limit?: number; cursor?: string }, u) => {
      const page = await comments.listComments(u?.id, r.post_id, { limit: num(r.limit, 20), cursor: str(r.cursor) });
      return { comments: page.nodes.map((c) => snakeComment(commentDTO(c))), next_cursor: page.nextCursor ?? '', has_more: page.hasMore };
    })
  });

  server.addService(pkg.GraphService.service, {
    GetShortestPath: unary(async (r: { to_user_id: string }, u) => {
      const path = await graph.shortestPath(need(u).id, r.to_user_id);
      return path ? { user_ids: path.userIds, distance: path.distance, found: true } : { user_ids: [], distance: 0, found: false };
    }),
    GetMutualFriends: unary(async (r: { user_id: string }, u) => {
      const ids = await graph.mutualConnections(need(u).id, r.user_id);
      return userList(await User.find({ _id: { $in: ids } }));
    }),
    GetRecommendations: unary(async (r: { limit?: number }, u) => {
      const recs = await follows.suggestions(need(u).id, Math.min(num(r.limit, 10), 30));
      return { recommendations: recs.map((x) => ({ user: snakeUser(userDTO(x.user)), mutual_count: x.mutualCount })) };
    })
  });

  server.addService(pkg.NotificationService.service, {
    GetUnreadCount: unary(async (_r: unknown, u) => ({ count: await notifications.unreadCount(need(u).id) })),
    StreamNotifications: (call: grpc.ServerWritableStream<unknown, unknown>) => {
      void streamFrom(call, async (viewer) => ({
        iterator: pubsub.asyncIterator<{ id: string }>(TOPICS.NOTIFICATION(viewer.id)),
        accept: () => true,
        map: async (p: { id: string }) => {
          const n = await Notification.findById(p.id);
          return n ? { id: n.id, type: n.type, message: n.message, read: n.read, sender_id: n.sender?.toString() ?? '', post_id: n.post?.toString() ?? '', created_at: n.createdAt.toISOString() } : null;
        }
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.bindAsync(`0.0.0.0:${env.grpcPort}`, grpc.ServerCredentials.createInsecure(), (err) => (err ? reject(err) : resolve()));
  });
  logger.info(`gRPC server listening on :${env.grpcPort}`);
};

interface StreamSource<T> {
  iterator: AsyncIterator<T>;
  accept: (payload: T) => boolean;
  map: (payload: T) => Promise<unknown | null>;
}

/** Authenticates the call, then pumps pub/sub events into a server-streaming response until the client goes away. */
async function streamFrom<T>(call: grpc.ServerWritableStream<unknown, unknown>, setup: (viewer: AuthUser) => Promise<StreamSource<T>>): Promise<void> {
  try {
    const viewer = need(await callerOf(call));
    const { iterator, accept, map } = await setup(viewer);
    let open = true;
    call.on('cancelled', () => {
      open = false;
      void iterator.return?.();
    });
    call.on('close', () => {
      open = false;
      void iterator.return?.();
    });
    while (open) {
      const { value, done } = await iterator.next();
      if (done) break;
      if (!accept(value)) continue;
      const message = await map(value);
      if (message && open) call.write(message);
    }
    if (open) call.end();
  } catch (err) {
    call.destroy(toGrpcError(err) as unknown as Error);
  }
}

export const stopGrpcServer = async (): Promise<void> => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.tryShutdown(() => resolve()));
  server = null;
};
