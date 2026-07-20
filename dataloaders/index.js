/**
 * DATALOADER FOR N+1 QUERY PROBLEM
 * 
 * CURRICULUM COVERAGE:
 * #591-600: DataLoader - Batching and Caching Database Queries
 * #1651-1660: Query Optimization - Solving N+1 Problem
 * 
 * PROBLEM: Without DataLoader
 * - Fetching 100 posts = 1 query for posts + 100 queries for authors = 101 queries
 * 
 * SOLUTION: With DataLoader
 * - Fetching 100 posts = 1 query for posts + 1 batched query for unique authors = 2 queries
 */

const DataLoader = require('dataloader');
const User = require('../models/User');
const Post = require('../models/Post');

/**
 * Create User DataLoader
 * Batches and caches user requests
 */
const createUserLoader = () => {
    return new DataLoader(async (userIds) => {
        // Batch load all users in one query
        const users = await User.find({ _id: { $in: userIds } });

        // Create a map for O(1) lookup
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = user;
        });

        // Return users in the same order as requested
        return userIds.map(id => userMap[id.toString()] || null);
    }, {
        // Cache for the duration of the request
        cache: true
    });
};

/**
 * Create Post DataLoader
 * Batches and caches post requests
 */
const createPostLoader = () => {
    return new DataLoader(async (postIds) => {
        const posts = await Post.find({ _id: { $in: postIds } });

        const postMap = {};
        posts.forEach(post => {
            postMap[post._id.toString()] = post;
        });

        return postIds.map(id => postMap[id.toString()] || null);
    }, {
        cache: true
    });
};

/**
 * Example Usage in Resolvers:
 * 
 * Post: {
 *   author: async (post, _, context) => {
 *     // Instead of: await User.findById(post.author) <- N+1 problem
 *     // Use DataLoader: context.userLoader.load(post.author) <- Batched!
 *     return context.userLoader.load(post.author);
 *   }
 * }
 * 
 * This batches all author requests into a single database query
 */

module.exports = {
    createUserLoader,
    createPostLoader
};
