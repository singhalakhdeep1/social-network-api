// tRPC router for social-network-api

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const router = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.userAPI.getUserById(input.id);
      }),
    
    create: t.procedure
      .input(z.object({
        username: z.string(),
        email: z.string().email(),
        displayName: z.string(),
        bio: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.userAPI.createUser(input);
      }),
    
    update: t.procedure
      .input(z.object({
        id: z.string(),
        displayName: z.string().optional(),
        bio: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.userAPI.updateUser(input.id, input);
      }),
    
    list: t.procedure
      .input(z.object({
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0)
      }))
      .query(async ({ input, ctx }) => {
        return ctx.userAPI.listUsers(input.limit, input.offset);
      })
  }),

  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.postAPI.getPostById(input.id);
      }),
    
    create: t.procedure
      .input(z.object({
        authorId: z.string(),
        content: z.string(),
        images: z.array(z.string()).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.postAPI.createPost(input);
      }),
    
    update: t.procedure
      .input(z.object({
        id: z.string(),
        content: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.postAPI.updatePost(input.id, input);
      }),
    
    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        return ctx.postAPI.deletePost(input.id);
      }),
    
    feed: t.procedure
      .input(z.object({
        userId: z.string(),
        limit: z.number().optional().default(20)
      }))
      .query(async ({ input, ctx }) => {
        return ctx.postAPI.getFeed(input.userId, input.limit);
      })
  }),

  follow: t.router({
    follow: t.procedure
      .input(z.object({
        followerId: z.string(),
        followingId: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.followAPI.follow(input.followerId, input.followingId);
      }),
    
    unfollow: t.procedure
      .input(z.object({
        followerId: z.string(),
        followingId: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.followAPI.unfollow(input.followerId, input.followingId);
      }),
    
    followers: t.procedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.followAPI.getFollowers(input.userId);
      }),
    
    following: t.procedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.followAPI.getFollowing(input.userId);
      })
  }),

  like: t.router({
    like: t.procedure
      .input(z.object({
        userId: z.string(),
        postId: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.likeAPI.like(input.userId, input.postId);
      }),
    
    unlike: t.procedure
      .input(z.object({
        userId: z.string(),
        postId: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.likeAPI.unlike(input.userId, input.postId);
      }),
    
    likes: t.procedure
      .input(z.object({ postId: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.likeAPI.getLikes(input.postId);
      })
  }),

  comment: t.router({
    create: t.procedure
      .input(z.object({
        postId: z.string(),
        authorId: z.string(),
        content: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.commentAPI.createComment(input);
      }),
    
    list: t.procedure
      .input(z.object({ postId: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.commentAPI.getComments(input.postId);
      })
  }),

  graph: t.router({
    shortestPath: t.procedure
      .input(z.object({
        fromUserId: z.string(),
        toUserId: z.string()
      }))
      .query(async ({ input, ctx }) => {
        return ctx.graphAPI.getShortestPath(input.fromUserId, input.toUserId);
      }),
    
    mutualFriends: t.procedure
      .input(z.object({
        userId1: z.string(),
        userId2: z.string()
      }))
      .query(async ({ input, ctx }) => {
        return ctx.graphAPI.getMutualFriends(input.userId1, input.userId2);
      }),
    
    recommendations: t.procedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input, ctx }) => {
        return ctx.graphAPI.getRecommendations(input.userId);
      })
  })
});

export type AppRouter = typeof router;
