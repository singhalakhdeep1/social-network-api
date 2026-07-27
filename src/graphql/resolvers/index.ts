/**
 * GRAPHQL RESOLVERS
 * 
 * CURRICULUM COVERAGE:
 * #576-590: GraphQL Resolvers - Query, Mutation, Field Resolvers
 * #591-600: DataLoader for N+1 Problem Resolution
 * #1651-1660: Advanced Query Optimization
 */

import { PubSub } from 'graphql-subscriptions';
import { AuthenticationError, UserInputError } from 'apollo-server-express';
import { createUserLoader, createPostLoader, createCommentLoader } from '../../dataloaders';
import { authMiddleware, AuthUser } from '../../middleware/auth';
import { sanitizeInput, extractHashtags, extractMentions, moderateContent } from '../../middleware/validation';
import logger from '../../utils/logger';
import User from '../../models/User';
import Post from '../../models/Post';
import Comment from '../../models/Comment';
import Notification from '../../models/Notification';
import AnalyticsEvent from '../../models/AnalyticsEvent';
import Reaction from '../../models/Reaction';
import redis from '../../config/redis';
import extendedResolvers from './extended';

const pubsub = new PubSub();

export interface Context {
  user?: AuthUser;
  redis: typeof redis;
  logger: typeof logger;
}

export const resolvers = {
  Query: {
    // User Queries
    me: async (_: any, __: any, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }
      return User.findById(context.user.id);
    },

    user: async (_: any, { id }: { id: string }) => {
      const user = await User.findById(id);
      if (!user) {
        throw new UserInputError('User not found');
      }
      return user;
    },

    users: async (_: any, { search, limit = 10 }: { search?: string; limit?: number }) => {
      const query: any = {};
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      return User.find(query).limit(limit);
    },

    // Post Queries
    post: async (_: any, { id }: { id: string }) => {
      return Post.findById(id);
    },

    posts: async (_: any, { cursor, limit = 10 }: { cursor?: string; limit?: number }) => {
      const query: any = {};
      if (cursor) {
        query._id = { $lt: cursor };
      }
      const posts = await Post.find(query)
        .sort({ createdAt: -1 })
        .limit(limit + 1);
      
      const hasMore = posts.length > limit;
      const postsToReturn = hasMore ? posts.slice(0, -1) : posts;
      
      return {
        posts: postsToReturn,
        hasMore,
        cursor: postsToReturn.length > 0 ? postsToReturn[postsToReturn.length - 1]._id : null,
        total: await Post.countDocuments()
      };
    },

    userPosts: async (_: any, { userId, limit = 10 }: { userId: string; limit?: number }) => {
      return Post.find({ author: userId })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    // Feed Algorithm
    feed: async (_: any, { cursor, limit = 20 }: { cursor?: string; limit?: number }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const user = await User.findById(context.user.id);
      const followingIds = user.following || [];
      const cacheKey = `feed:${context.user.id}:${cursor || 'initial'}`;
      const cached = await context.redis.get(cacheKey);

      if (cached) {
        context.logger.info('✅ Returning cached feed');
        return JSON.parse(cached);
      }

      const posts = await Post.find({
        author: { $in: followingIds }
      })
        .sort({ createdAt: -1 })
        .limit(100);

      const scoredPosts = posts.map(post => {
        let score = 0;
        let reason = '';

        const hoursSincePost = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 100 - hoursSincePost * 2);
        score += recencyScore;

        const engagementScore = (post.likes?.length || 0) * 5 + (post.comments?.length || 0) * 10;
        score += engagementScore;

        if (engagementScore > 50) {
          reason = 'High engagement';
        } else if (recencyScore > 80) {
          reason = 'Recent post';
        } else {
          reason = 'From followed user';
        }

        return { post, score, reason };
      });

      scoredPosts.sort((a, b) => b.score - a.score);
      const feedItems = scoredPosts.slice(0, limit);

      await context.redis.setex(cacheKey, 120, JSON.stringify(feedItems));
      context.logger.info(`📊 Feed algorithm: ${feedItems.length} posts ranked`);

      return feedItems;
    },

    // Search
    searchPosts: async (_: any, { query, limit = 20 }: { query: string; limit?: number }) => {
      return Post.find({
        content: { $regex: query, $options: 'i' }
      })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    searchUsers: async (_: any, { query, limit = 20 }: { query: string; limit?: number }) => {
      return User.find({
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      }).limit(limit);
    },

    // Hashtag Queries
    postsByHashtag: async (_: any, { hashtag, limit = 20 }: { hashtag: string; limit?: number }) => {
      return Post.find({
        hashtags: hashtag.toLowerCase()
      })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    trendingHashtags: async (_: any, { limit = 10 }: { limit?: number }) => {
      const posts = await Post.find({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
      const hashtagCounts: Record<string, number> = {};
      
      posts.forEach(post => {
        post.hashtags.forEach((tag: string) => {
          hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
        });
      });

      return Object.entries(hashtagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag]) => tag);
    },

    // Comment Queries
    comments: async (_: any, { postId, limit = 20 }: { postId: string; limit?: number }) => {
      return Comment.find({ post: postId, parent: null })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    commentReplies: async (_: any, { commentId, limit = 20 }: { commentId: string; limit?: number }) => {
      return Comment.find({ parent: commentId })
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    // Notification Queries
    notifications: async (_: any, { limit = 20, unreadOnly = false }: { limit?: number; unreadOnly?: boolean }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const query: any = { recipient: context.user.id };
      if (unreadOnly) {
        query.read = false;
      }

      return Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);
    },

    unreadNotificationCount: async (_: any, __: any, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      return Notification.countDocuments({
        recipient: context.user.id,
        read: false
      });
    },

    // Analytics Queries
    myAnalytics: async (_: any, __: any, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }
      return getUserAnalytics(context.user.id);
    },

    userAnalytics: async (_: any, { userId }: { userId: string }) => {
      return getUserAnalytics(userId);
    },
    
    // Extended queries from extendedResolvers
    ...extendedResolvers.Query
  },

  Mutation: {
    // Authentication
    register: async (_: any, { username, email, password }: { username: string; email: string; password: string }) => {
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        throw new UserInputError('User already exists');
      }

      const user = await User.create({ username, email, password });
      const token = user.generateAccessToken();
      const refreshToken = user.generateRefreshToken();
      await user.save();

      return { token, refreshToken, user };
    },

    login: async (_: any, { email, password }: { email: string; password: string }) => {
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      const valid = await user.comparePassword(password);
      if (!valid) {
        throw new AuthenticationError('Invalid credentials');
      }

      const token = user.generateAccessToken();
      const refreshToken = user.generateRefreshToken();
      await user.save();

      return { token, refreshToken, user };
    },

    refreshToken: async (_: any, { refreshToken }: { refreshToken: string }) => {
      const user = await User.findOne({ refreshToken });
      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const token = user.generateAccessToken();
      const newRefreshToken = user.generateRefreshToken();
      await user.save();

      return { token, refreshToken: newRefreshToken, user };
    },

    // User Actions
    updateProfile: async (_: any, { bio, avatar }: { bio?: string; avatar?: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const user = await User.findByIdAndUpdate(
        context.user.id,
        { bio: bio ? sanitizeInput(bio) : undefined, avatar },
        { new: true }
      );

      return user;
    },

    followUser: async (_: any, { userId }: { userId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      if (userId === context.user.id) {
        throw new UserInputError('Cannot follow yourself');
      }

      const user = await User.findById(context.user.id);
      const targetUser = await User.findById(userId);

      if (!targetUser) {
        throw new UserInputError('User not found');
      }

      if (!user.following.includes(userId as any)) {
        user.following.push(userId as any);
        targetUser.followers.push(context.user.id as any);
        await user.save();
        await targetUser.save();

        // Create notification
        await Notification.create({
          recipient: userId,
          sender: context.user.id,
          type: 'follow',
          message: `${user.username} started following you`
        });

        // Track analytics
        await AnalyticsEvent.create({
          user: context.user.id,
          eventType: 'user_followed',
          targetUser: userId
        });
      }

      return targetUser;
    },

    unfollowUser: async (_: any, { userId }: { userId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const user = await User.findById(context.user.id);
      const targetUser = await User.findById(userId);

      if (!targetUser) {
        throw new UserInputError('User not found');
      }

      user.following = user.following.filter((id: any) => id.toString() !== userId);
      targetUser.followers = targetUser.followers.filter((id: any) => id.toString() !== context.user.id);
      await user.save();
      await targetUser.save();

      // Track analytics
      await AnalyticsEvent.create({
        user: context.user.id,
        eventType: 'user_unfollowed',
        targetUser: userId
      });

      return targetUser;
    },

    // Post Actions
    createPost: async (_: any, { content, media }: { content: string; media?: any }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const sanitizedContent = sanitizeInput(content);
      const moderation = moderateContent(sanitizedContent);
      
      if (!moderation.isSafe) {
        throw new UserInputError(`Content moderation failed: ${moderation.reason}`);
      }

      const hashtags = extractHashtags(sanitizedContent);
      const mentionUsernames = extractMentions(sanitizedContent);
      const mentionedUsers = await User.find({ username: { $in: mentionUsernames } });
      const mentionIds = mentionedUsers.map(u => u._id);

      const mediaData = media ? [{ url: media, type: 'image' }] : [];

      const post = await Post.create({
        content: sanitizedContent,
        author: context.user.id,
        media: mediaData,
        hashtags,
        mentions: mentionIds
      });

      // Invalidate feed cache for followers
      const user = await User.findById(context.user.id);
      for (const followerId of user.followers) {
        await context.redis.del(`feed:${followerId}:initial`);
      }

      // Create notifications for mentions
      for (const mentionedUser of mentionedUsers) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: context.user.id,
          type: 'mention',
          post: post._id,
          message: `${user.username} mentioned you in a post`
        });
      }

      pubsub.publish('POST_CREATED', { postCreated: post });
      context.logger.info(`✅ Post created: ${post._id}`);

      // Track analytics
      await AnalyticsEvent.create({
        user: context.user.id,
        eventType: 'post_created',
        post: post._id
      });

      return post;
    },

    updatePost: async (_: any, { id, content }: { id: string; content: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(id);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      const sanitizedContent = sanitizeInput(content);
      const moderation = moderateContent(sanitizedContent);
      
      if (!moderation.isSafe) {
        throw new UserInputError(`Content moderation failed: ${moderation.reason}`);
      }

      post.content = sanitizedContent;
      post.hashtags = extractHashtags(sanitizedContent);
      await post.save();

      return post;
    },

    deletePost: async (_: any, { id }: { id: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(id);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      await post.deleteOne();
      return true;
    },

    likePost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (!post.likes.includes(context.user.id as any)) {
        post.likes.push(context.user.id as any);
        await post.save();

        // Create notification
        if (post.author.toString() !== context.user.id) {
          await Notification.create({
            recipient: post.author,
            sender: context.user.id,
            type: 'like',
            post: post._id,
            message: `${context.user.username} liked your post`
          });
        }

        pubsub.publish(`POST_LIKED_${postId}`, { postLiked: post });

        // Track analytics
        await AnalyticsEvent.create({
          user: context.user.id,
          eventType: 'post_liked',
          post: post._id
        });
      }

      return post;
    },

    unlikePost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      post.likes = post.likes.filter((id: any) => id.toString() !== context.user.id);
      await post.save();

      return post;
    },

    sharePost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      post.sharesCount = (post.sharesCount || 0) + 1;
      await post.save();

      return post;
    },

    pinPost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      post.isPinned = true;
      await post.save();

      return post;
    },

    unpinPost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      post.isPinned = false;
      await post.save();

      return post;
    },

    archivePost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      post.isArchived = true;
      await post.save();

      return post;
    },

    unarchivePost: async (_: any, { postId }: { postId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      if (post.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      post.isArchived = false;
      await post.save();

      return post;
    },

    // Comment Actions
    addComment: async (_: any, { postId, content, parentId }: { postId: string; content: string; parentId?: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new UserInputError('Post not found');
      }

      const sanitizedContent = sanitizeInput(content);
      const moderation = moderateContent(sanitizedContent);
      
      if (!moderation.isSafe) {
        throw new UserInputError(`Content moderation failed: ${moderation.reason}`);
      }

      const comment = await Comment.create({
        content: sanitizedContent,
        author: context.user.id,
        post: postId,
        parent: parentId
      });

      if (parentId) {
        await Comment.findByIdAndUpdate(parentId, {
          $push: { replies: comment._id }
        });
      } else {
        post.comments.push(comment._id);
        await post.save();
      }

      // Create notification
      if (post.author.toString() !== context.user.id) {
        await Notification.create({
          recipient: post.author,
          sender: context.user.id,
          type: parentId ? 'reply' : 'comment',
          post: post._id,
          comment: comment._id,
          message: `${context.user.username} ${parentId ? 'replied to' : 'commented on'} your post`
        });
      }

      pubsub.publish(`COMMENT_ADDED_${postId}`, { commentAdded: comment });
      context.logger.info(`✅ Comment added to post ${postId}`);

      // Track analytics
      await AnalyticsEvent.create({
        user: context.user.id,
        eventType: 'post_commented',
        post: post._id
      });

      return comment;
    },

    deleteComment: async (_: any, { id }: { id: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const comment = await Comment.findById(id);
      if (!comment) {
        throw new UserInputError('Comment not found');
      }

      if (comment.author.toString() !== context.user.id) {
        throw new AuthenticationError('Not authorized');
      }

      await Post.findByIdAndUpdate(comment.post, {
        $pull: { comments: id }
      });

      await comment.deleteOne();
      return true;
    },

    likeComment: async (_: any, { commentId }: { commentId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const comment = await Comment.findById(commentId);
      if (!comment) {
        throw new UserInputError('Comment not found');
      }

      if (!comment.likes.includes(context.user.id as any)) {
        comment.likes.push(context.user.id as any);
        await comment.save();
      }

      return comment;
    },

    unlikeComment: async (_: any, { commentId }: { commentId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const comment = await Comment.findById(commentId);
      if (!comment) {
        throw new UserInputError('Comment not found');
      }

      comment.likes = comment.likes.filter((id: any) => id.toString() !== context.user.id);
      await comment.save();

      return comment;
    },

    // Reaction Actions
    addReaction: async (_: any, { postId, emoji, commentId }: { postId: string; emoji: string; commentId?: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const validEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '🙏'];
      if (!validEmojis.includes(emoji)) {
        throw new UserInputError('Invalid emoji');
      }

      // Remove existing reaction by this user
      await Reaction.deleteMany({
        user: context.user.id,
        post: postId,
        comment: commentId
      });

      const reaction = await Reaction.create({
        user: context.user.id,
        post: postId,
        comment: commentId,
        emoji
      });

      pubsub.publish(`REACTION_ADDED_${postId}`, { reactionAdded: reaction });
      return reaction;
    },

    removeReaction: async (_: any, { postId, commentId }: { postId: string; commentId?: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      await Reaction.deleteMany({
        user: context.user.id,
        post: postId,
        comment: commentId
      });

      return true;
    },

    // Notification Actions
    markNotificationAsRead: async (_: any, { notificationId }: { notificationId: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { read: true, readAt: new Date() },
        { new: true }
      );

      return notification;
    },

    markAllNotificationsAsRead: async (_: any, __: any, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      await Notification.updateMany(
        { recipient: context.user.id, read: false },
        { read: true, readAt: new Date() }
      );

      return true;
    },

    // Analytics Actions
    trackEvent: async (_: any, { eventType, postId, targetUserId, metadata }: { eventType: string; postId?: string; targetUserId?: string; metadata?: string }, context: Context) => {
      if (!context.user) {
        throw new AuthenticationError('Not authenticated');
      }

      const event = await AnalyticsEvent.create({
        user: context.user.id,
        eventType,
        post: postId,
        targetUser: targetUserId,
        metadata: metadata ? JSON.parse(metadata) : {}
      });

      return event;
    },
    
    // Extended mutations from extendedResolvers
    ...extendedResolvers.Mutation
  },

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.asyncIterator(['POST_CREATED'])
    },

    postLiked: {
      subscribe: (_: any, { postId }: { postId: string }) => pubsub.asyncIterator([`POST_LIKED_${postId}`])
    },

    commentAdded: {
      subscribe: (_: any, { postId }: { postId: string }) => pubsub.asyncIterator([`COMMENT_ADDED_${postId}`])
    },

    reactionAdded: {
      subscribe: (_: any, { postId }: { postId: string }) => pubsub.asyncIterator([`REACTION_ADDED_${postId}`])
    },

    notificationAdded: {
      subscribe: (_: any, { userId }: { userId: string }) => pubsub.asyncIterator([`NOTIFICATION_ADDED_${userId}`])
    },

    feedUpdated: {
      subscribe: (_: any, { userId }: { userId: string }) => pubsub.asyncIterator([`FEED_UPDATED_${userId}`])
    },
    
    // Extended subscriptions from extendedResolvers
    ...extendedResolvers.Subscription
  },

  // Field Resolvers with DataLoader
  Post: {
    author: async (post: any, _: any, context: Context) => {
      const userLoader = createUserLoader();
      return userLoader.load(post.author.toString());
    },

    likeCount: (post: any) => post.likes?.length || 0,
    commentCount: (post: any) => post.comments?.length || 0,

    reactions: async (post: any) => {
      return Reaction.find({ post: post._id });
    },

    isLiked: (post: any, _: any, context: Context) => {
      if (!context.user) return false;
      return post.likes?.some((userId: any) => userId.toString() === context.user.id);
    },

    comments: async (post: any) => {
      return Comment.find({ post: post.id, parent: null }).sort({ createdAt: -1 }).limit(10);
    },

    mentions: async (post: any) => {
      return User.find({ _id: { $in: post.mentions } });
    }
  },

  User: {
    followerCount: (user: any) => user.followers?.length || 0,
    followingCount: (user: any) => user.following?.length || 0,

    posts: async (user: any) => {
      return Post.find({ author: user.id }).sort({ createdAt: -1 }).limit(20);
    },

    followers: async (user: any) => {
      return User.find({ _id: { $in: user.followers } });
    },

    following: async (user: any) => {
      return User.find({ _id: { $in: user.following } });
    }
  },

  Comment: {
    author: async (comment: any, _: any, context: Context) => {
      const userLoader = createUserLoader();
      return userLoader.load(comment.author.toString());
    },

    post: async (comment: any) => {
      const postLoader = createPostLoader();
      return postLoader.load(comment.post.toString());
    },

    parent: async (comment: any) => {
      if (!comment.parent) return null;
      const commentLoader = createCommentLoader();
      return commentLoader.load(comment.parent.toString());
    },

    replies: async (comment: any) => {
      return Comment.find({ parent: comment._id }).sort({ createdAt: -1 });
    },

    likeCount: (comment: any) => comment.likes?.length || 0,
    replyCount: (comment: any) => comment.replies?.length || 0
  },

  Reaction: {
    user: async (reaction: any) => {
      const userLoader = createUserLoader();
      return userLoader.load(reaction.user.toString());
    },

    post: async (reaction: any) => {
      const postLoader = createPostLoader();
      return postLoader.load(reaction.post.toString());
    },

    comment: async (reaction: any) => {
      if (!reaction.comment) return null;
      const commentLoader = createCommentLoader();
      return commentLoader.load(reaction.comment.toString());
    }
  },

  Notification: {
    recipient: async (notification: any) => {
      const userLoader = createUserLoader();
      return userLoader.load(notification.recipient.toString());
    },

    sender: async (notification: any) => {
      if (!notification.sender) return null;
      const userLoader = createUserLoader();
      return userLoader.load(notification.sender.toString());
    },

    post: async (notification: any) => {
      if (!notification.post) return null;
      const postLoader = createPostLoader();
      return postLoader.load(notification.post.toString());
    },

    comment: async (notification: any) => {
      if (!notification.comment) return null;
      const commentLoader = createCommentLoader();
      return commentLoader.load(notification.comment.toString());
    }
  },

  AnalyticsEvent: {
    user: async (event: any) => {
      const userLoader = createUserLoader();
      return userLoader.load(event.user.toString());
    },

    post: async (event: any) => {
      if (!event.post) return null;
      const postLoader = createPostLoader();
      return postLoader.load(event.post.toString());
    },

    targetUser: async (event: any) => {
      if (!event.targetUser) return null;
      const userLoader = createUserLoader();
      return userLoader.load(event.targetUser.toString());
    }
  }
};

async function getUserAnalytics(userId: string) {
  const user = await User.findById(userId);
  const totalPosts = await Post.countDocuments({ author: userId });
  const totalLikes = await Post.aggregate([
    { $match: { author: userId } },
    { $project: { likeCount: { $size: '$likes' } } },
    { $group: { _id: null, total: { $sum: '$likeCount' } } }
  ]);
  const totalComments = await Post.aggregate([
    { $match: { author: userId } },
    { $project: { commentCount: { $size: '$comments' } } },
    { $group: { _id: null, total: { $sum: '$commentCount' } } }
  ]);

  const totalFollowers = user?.followers?.length || 0;
  const totalFollowing = user?.following?.length || 0;
  const totalInteractions = (totalLikes[0]?.total || 0) + (totalComments[0]?.total || 0);
  const engagementRate = totalPosts > 0 ? (totalInteractions / totalPosts) * 100 : 0;

  const topPosts = await Post.find({ author: userId })
    .sort({ createdAt: -1 })
    .limit(5);

  return {
    userId,
    totalPosts,
    totalLikes: totalLikes[0]?.total || 0,
    totalComments: totalComments[0]?.total || 0,
    totalFollowers,
    totalFollowing,
    engagementRate,
    topPosts
  };
}

export { pubsub };
