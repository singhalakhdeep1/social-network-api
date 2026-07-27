/**
 * DATALOADER FOR N+1 QUERY PROBLEM
 * 
 * CURRICULUM COVERAGE:
 * #591-600: DataLoader - Batching and Caching Database Queries
 * #1651-1660: Query Optimization - Solving N+1 Problem
 */

import DataLoader from 'dataloader';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';

/**
 * Create User DataLoader
 * Batches and caches user requests
 */
export const createUserLoader = (): DataLoader<string, any> => {
  return new DataLoader(async (userIds: readonly string[]) => {
    const users = await User.find({ _id: { $in: userIds } });
    const userMap: Record<string, any> = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });
    return userIds.map(id => userMap[id] || null);
  }, {
    cache: true
  });
};

/**
 * Create Post DataLoader
 * Batches and caches post requests
 */
export const createPostLoader = (): DataLoader<string, any> => {
  return new DataLoader(async (postIds: readonly string[]) => {
    const posts = await Post.find({ _id: { $in: postIds } });
    const postMap: Record<string, any> = {};
    posts.forEach(post => {
      postMap[post._id.toString()] = post;
    });
    return postIds.map(id => postMap[id] || null);
  }, {
    cache: true
  });
};

/**
 * Create Comment DataLoader
 * Batches and caches comment requests
 */
export const createCommentLoader = (): DataLoader<string, any> => {
  return new DataLoader(async (commentIds: readonly string[]) => {
    const comments = await Comment.find({ _id: { $in: commentIds } });
    const commentMap: Record<string, any> = {};
    comments.forEach(comment => {
      commentMap[comment._id.toString()] = comment;
    });
    return commentIds.map(id => commentMap[id] || null);
  }, {
    cache: true
  });
};
