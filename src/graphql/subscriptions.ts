// GraphQL Subscriptions for social-network-api

import { PubSub } from 'apollo-server-express';

const pubsub = new PubSub();

export const subscriptionResolvers = {
  postCreated: {
    subscribe: () => pubsub.asyncIterator(['POST_CREATED'])
  },
  postUpdated: {
    subscribe: () => pubsub.asyncIterator(['POST_UPDATED'])
  },
  postDeleted: {
    subscribe: () => pubsub.asyncIterator(['POST_DELETED'])
  },
  userFollowed: {
    subscribe: () => pubsub.asyncIterator(['USER_FOLLOWED'])
  },
  userUnfollowed: {
    subscribe: () => pubsub.asyncIterator(['USER_UNFOLLOWED'])
  },
  likeAdded: {
    subscribe: () => pubsub.asyncIterator(['LIKE_ADDED'])
  },
  likeRemoved: {
    subscribe: () => pubsub.asyncIterator(['LIKE_REMOVED'])
  },
  commentAdded: {
    subscribe: () => pubsub.asyncIterator(['COMMENT_ADDED'])
  }
};

export const publishPostCreated = (post: any) => {
  pubsub.publish('POST_CREATED', { postCreated: post });
};

export const publishPostUpdated = (post: any) => {
  pubsub.publish('POST_UPDATED', { postUpdated: post });
};

export const publishPostDeleted = (postId: string) => {
  pubsub.publish('POST_DELETED', { postDeleted: { id: postId } });
};

export const publishUserFollowed = (followerId: string, followingId: string) => {
  pubsub.publish('USER_FOLLOWED', { userFollowed: { followerId, followingId } });
};

export const publishUserUnfollowed = (followerId: string, followingId: string) => {
  pubsub.publish('USER_UNFOLLOWED', { userUnfollowed: { followerId, followingId } });
};

export const publishLikeAdded = (userId: string, postId: string) => {
  pubsub.publish('LIKE_ADDED', { likeAdded: { userId, postId } });
};

export const publishLikeRemoved = (userId: string, postId: string) => {
  pubsub.publish('LIKE_REMOVED', { likeRemoved: { userId, postId } });
};

export const publishCommentAdded = (comment: any) => {
  pubsub.publish('COMMENT_ADDED', { commentAdded: comment });
};
