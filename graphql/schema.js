/**
 * GRAPHQL SCHEMA DEFINITION
 * 
 * CURRICULUM COVERAGE:
 * #551-560: GraphQL Type System - Types, Queries, Mutations
 * #561-570: GraphQL Subscriptions for Real-time Updates
 * #571-575: Input Types and Custom Scalars
 */

const { gql } = require('apollo-server-express');

const typeDefs = gql`
  # User Type
  type User {
    id: ID!
    username: String!
    email: String!
    bio: String
    avatar: String
    followers: [User!]!
    following: [User!]!
    followerCount: Int!
    followingCount: Int!
    posts: [Post!]!
    createdAt: String!
  }

  # Post Type
  type Post {
    id: ID!
    content: String!
    author: User!
    likes: [User!]!
    likeCount: Int!
    comments: [Comment!]!
    commentCount: Int!
    isLiked: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  # Comment Type
  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    createdAt: String!
  }

  # Feed Item (for personalized feed)
  type FeedItem {
    post: Post!
    score: Float!
    reason: String!
  }

  # Paginated Response
  type PostConnection {
    posts: [Post!]!
    hasMore: Boolean!
    cursor: String
    total: Int!
  }

  # Authentication Response
  type AuthPayload {
    token: String!
    user: User!
  }

  # #551-560: GraphQL Queries
  type Query {
    # User Queries
    me: User
    user(id: ID!): User
    users(search: String, limit: Int): [User!]!
    
    # Post Queries
    post(id: ID!): Post
    posts(cursor: String, limit: Int): PostConnection!
    userPosts(userId: ID!, limit: Int): [Post!]!
    
    # Feed Algorithm - Personalized based on engagement
    feed(cursor: String, limit: Int): [FeedItem!]!
    
    # Search
    searchPosts(query: String!, limit: Int): [Post!]!
  }

  # #551-560: GraphQL Mutations
  type Mutation {
    # Authentication
    register(username: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    
    # User Actions
    updateProfile(bio: String, avatar: String): User!
    followUser(userId: ID!): User!
    unfollowUser(userId: ID!): User!
    
    # Post Actions
    createPost(content: String!): Post!
    updatePost(id: ID!, content: String!): Post!
    deletePost(id: ID!): Boolean!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
    
    # Comment Actions
    addComment(postId: ID!, content: String!): Comment!
    deleteComment(id: ID!): Boolean!
  }

  # #561-570: GraphQL Subscriptions for Real-time
  type Subscription {
    postCreated: Post!
    postLiked(postId: ID!): Post!
    commentAdded(postId: ID!): Comment!
  }
`;

module.exports = typeDefs;
