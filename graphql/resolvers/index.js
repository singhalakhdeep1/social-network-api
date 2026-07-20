/**
 * GRAPHQL RESOLVERS
 * 
 * CURRICULUM COVERAGE:
 * #576-590: GraphQL Resolvers - Query, Mutation, Field Resolvers
 * #591-600: DataLoader for N+1 Problem Resolution
 * #1651-1660: Advanced Query Optimization
 */

const { PubSub } = require('graphql-subscriptions');
const userResolvers = require('./userResolvers');
const postResolvers = require('./postResolvers');
const commentResolvers = require('./commentResolvers');
const { createUserLoader, createPostLoader } = require('../dataloaders');

// #561-570: PubSub for Subscriptions
const pubsub = new PubSub();

const resolvers = {
    Query: {
        ...userResolvers.Query,
        ...postResolvers.Query,
    },

    Mutation: {
        ...userResolvers.Mutation,
        ...postResolvers.Mutation,
        ...commentResolvers.Mutation,
    },

    Subscription: {
        // #561-570: Real-time subscription for new posts
        postCreated: {
            subscribe: () => pubsub.asyncIterator(['POST_CREATED'])
        },

        postLiked: {
            subscribe: (_, { postId }) => pubsub.asyncIterator([`POST_LIKED_${postId}`])
        },

        commentAdded: {
            subscribe: (_, { postId }) => pubsub.asyncIterator([`COMMENT_ADDED_${postId}`])
        }
    },

    // #591-600: Field Resolvers with DataLoader to solve N+1 problem
    Post: {
        author: async (post, _, context) => {
            // Use DataLoader to batch user requests
            const userLoader = createUserLoader();
            return userLoader.load(post.author);
        },

        likeCount: (post) => post.likes?.length || 0,
        commentCount: (post) => post.comments?.length || 0,

        isLiked: (post, _, context) => {
            if (!context.user) return false;
            return post.likes?.some(userId => userId.toString() === context.user.id);
        },

        comments: async (post) => {
            const Comment = require('../../models/Comment');
            return Comment.find({ post: post.id }).sort({ createdAt: -1 }).limit(10);
        }
    },

    User: {
        followerCount: (user) => user.followers?.length || 0,
        followingCount: (user) => user.following?.length || 0,

        posts: async (user) => {
            const Post = require('../../models/Post');
            return Post.find({ author: user.id }).sort({ createdAt: -1 }).limit(20);
        }
    },

    Comment: {
        author: async (comment, _, context) => {
            const userLoader = createUserLoader();
            return userLoader.load(comment.author);
        }
    }
};

module.exports = { resolvers, pubsub };
