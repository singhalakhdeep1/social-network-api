/**
 * POST RESOLVERS WITH FEED ALGORITHM
 * 
 * CURRICULUM COVERAGE:
 * #576-590: CRUD Operations with GraphQL
 * #1651-1750: Advanced Queries - Pagination, Filtering, Feed Algorithm
 * #1136-1145: Redis Caching for Feed Optimization
 */

const Post = require('../../models/Post');
const User = require('../../models/User');
const { AuthenticationError, UserInputError } = require('apollo-server-express');
const { pubsub } = require('./index');

const postResolvers = {
    Query: {
        // Get single post
        post: async (_, { id }) => {
            const post = await Post.findById(id);
            if (!post) {
                throw new UserInputError('Post not found');
            }
            return post;
        },

        // #1651-1700: Paginated posts with cursor-based pagination
        posts: async (_, { cursor, limit = 20 }, context) => {
            const query = cursor ? { _id: { $lt: cursor } } : {};

            // Check Redis cache first
            const cacheKey = `posts:${cursor || 'initial'}:${limit}`;
            const cached = await context.redis.get(cacheKey);

            if (cached) {
                context.logger.info('✅ Returning cached posts');
                return JSON.parse(cached);
            }

            const posts = await Post.find(query)
                .sort({ createdAt: -1 })
                .limit(limit + 1);

            const hasMore = posts.length > limit;
            const finalPosts = hasMore ? posts.slice(0, -1) : posts;

            const result = {
                posts: finalPosts,
                hasMore,
                cursor: finalPosts.length > 0 ? finalPosts[finalPosts.length - 1]._id : null,
                total: await Post.countDocuments()
            };

            // Cache for 5 minutes
            await context.redis.setex(cacheKey, 300, JSON.stringify(result));

            return result;
        },

        // Get user's posts
        userPosts: async (_, { userId, limit = 20 }) => {
            return Post.find({ author: userId })
                .sort({ createdAt: -1 })
                .limit(limit);
        },

        // #1701-1750: FEED ALGORITHM - Personalized feed based on engagement
        feed: async (_, { cursor, limit = 20 }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            // Get user's following list
            const user = await User.findById(context.user.id);
            const followingIds = user.following || [];

            // Check Redis cache
            const cacheKey = `feed:${context.user.id}:${cursor || 'initial'}`;
            const cached = await context.redis.get(cacheKey);

            if (cached) {
                context.logger.info('✅ Returning cached feed');
                return JSON.parse(cached);
            }

            // Get posts from followed users
            const posts = await Post.find({
                author: { $in: followingIds }
            })
                .sort({ createdAt: -1 })
                .limit(100); // Get more posts for ranking

            // FEED ALGORITHM: Score-based ranking
            const scoredPosts = posts.map(post => {
                let score = 0;
                let reason = '';

                // Recency score (max 100 points)
                const hoursSincePost = (Date.now() - post.createdAt) / (1000 * 60 * 60);
                const recencyScore = Math.max(0, 100 - hoursSincePost * 2);
                score += recencyScore;

                // Engagement score (likes + comments)
                const engagementScore = (post.likes?.length || 0) * 5 + (post.comments?.length || 0) * 10;
                score += engagementScore;

                // Bonus for posts from close friends (users you interact with most)
                // This would require tracking interaction history

                if (engagementScore > 50) {
                    reason = 'High engagement';
                } else if (recencyScore > 80) {
                    reason = 'Recent post';
                } else {
                    reason = 'From followed user';
                }

                return {
                    post,
                    score,
                    reason
                };
            });

            // Sort by score (highest first)
            scoredPosts.sort((a, b) => b.score - a.score);

            // Apply pagination
            const feedItems = scoredPosts.slice(0, limit);

            // Cache for 2 minutes (feed updates frequently)
            await context.redis.setex(cacheKey, 120, JSON.stringify(feedItems));

            context.logger.info(`📊 Feed algorithm: ${feedItems.length} posts ranked`);

            return feedItems;
        },

        // Search posts
        searchPosts: async (_, { query, limit = 20 }) => {
            return Post.find({
                content: { $regex: query, $options: 'i' }
            })
                .sort({ createdAt: -1 })
                .limit(limit);
        }
    },

    Mutation: {
        // Create post
        createPost: async (_, { content }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const post = await Post.create({
                content,
                author: context.user.id
            });

            // Invalidate feed cache for all followers
            const user = await User.findById(context.user.id);
            for (const followerId of user.followers) {
                await context.redis.del(`feed:${followerId}:initial`);
            }

            // #561-570: Publish subscription event
            pubsub.publish('POST_CREATED', { postCreated: post });

            context.logger.info(`✅ Post created: ${post._id}`);

            return post;
        },

        // Update post
        updatePost: async (_, { id, content }, context) => {
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

            post.content = content;
            await post.save();

            return post;
        },

        // Delete post
        deletePost: async (_, { id }, context) => {
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

            await post.remove();

            return true;
        },

        // Like post
        likePost: async (_, { postId }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const post = await Post.findById(postId);
            if (!post) {
                throw new UserInputError('Post not found');
            }

            if (!post.likes.includes(context.user.id)) {
                post.likes.push(context.user.id);
                await post.save();

                // Publish subscription
                pubsub.publish(`POST_LIKED_${postId}`, { postLiked: post });
            }

            return post;
        },

        // Unlike post
        unlikePost: async (_, { postId }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const post = await Post.findById(postId);
            if (!post) {
                throw new UserInputError('Post not found');
            }

            post.likes = post.likes.filter(id => id.toString() !== context.user.id);
            await post.save();

            return post;
        }
    }
};

module.exports = postResolvers;
