/**
 * Authentication, profiles and the follow graph.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { IUser } from '../../models/User';
import { canSeePrivateFields, requireAdmin } from '../../middleware/auth';
import * as auth from '../../services/auth.service';
import * as users from '../../services/user.service';
import * as follows from '../../services/follow.service';
import * as posts from '../../services/post.service';
import * as stories from '../../services/story.service';
import { graph } from '../../services/graph/graph.service';
import { saveUpload } from '../../utils/uploads';
import { canViewUserContent } from '../../services/visibility.service';
import { badInput } from '../../utils/errors';

type UserDoc = HydratedDocument<IUser>;
type PageArgs = { limit?: number | null; cursor?: string | null };

export const typeDefs = /* GraphQL */ `
  type NotificationPreferences {
    email: Boolean!
    push: Boolean!
    mentions: Boolean!
    follows: Boolean!
    likes: Boolean!
    comments: Boolean!
    messages: Boolean!
  }

  type User {
    id: ID!
    username: String!
    displayName: String
    "Visible to the account owner and admins only"
    email: String
    bio: String
    avatar: String
    website: String
    location: String
    interests: [String!]!
    role: String!
    isPrivate: Boolean!
    "Blue check granted by an admin"
    isVerified: Boolean!
    emailVerified: Boolean!
    twoFactorEnabled: Boolean
    notificationPreferences: NotificationPreferences
    followerCount: Int!
    followingCount: Int!
    postCount: Int!
    isFollowing: Boolean!
    isFollowedBy: Boolean!
    isMe: Boolean!
    createdAt: DateTime!
    posts(limit: Int, cursor: String): PostPage!
    followers(limit: Int, cursor: String): UserPage!
    following(limit: Int, cursor: String): UserPage!
    stories: [Story!]!
    highlights: [StoryHighlight!]!
  }

  type UserPage {
    nodes: [User!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type UserSuggestion {
    user: User!
    mutualCount: Int!
  }

  type ConnectionPath {
    distance: Int!
    users: [User!]!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type TwoFactorSetup {
    secret: String!
    otpauthUrl: String!
  }

  input ProfileInput {
    displayName: String
    bio: String
    avatar: String
    website: String
    location: String
    isPrivate: Boolean
    interests: [String!]
    birthYear: Int
  }

  input NotificationPreferencesInput {
    email: Boolean
    push: Boolean
    mentions: Boolean
    follows: Boolean
    likes: Boolean
    comments: Boolean
    messages: Boolean
  }

  extend type Query {
    me: User
    user(id: ID!): User!
    userByUsername(username: String!): User!
    "People you may know: friends-of-friends ranked by shared connections (Neo4j / JanusGraph / Mongo)"
    suggestedUsers(limit: Int): [UserSuggestion!]!
    "Users followed by both you and another user"
    mutualConnections(userId: ID!, limit: Int): [User!]!
    "Shortest chain of follows from you to another user, or null if unreachable"
    connectionPath(userId: ID!): ConnectionPath
  }

  extend type Mutation {
    register(username: String!, email: String!, password: String!, displayName: String): AuthPayload!
    login(email: String!, password: String!, twoFactorCode: String): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    logout(refreshToken: String): Boolean!
    verifyEmail(token: String!): Boolean!
    resendVerificationEmail: Boolean!
    forgotPassword(email: String!): Boolean!
    resetPassword(token: String!, password: String!): Boolean!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    setupTwoFactor: TwoFactorSetup!
    enableTwoFactor(code: String!): Boolean!
    disableTwoFactor(password: String!, code: String): Boolean!

    updateProfile(input: ProfileInput!): User!
    uploadAvatar(file: Upload!): User!
    updateNotificationPreferences(input: NotificationPreferencesInput!): User!
    followUser(userId: ID!): User!
    unfollowUser(userId: ID!): User!
    "Admin only: grant or revoke the blue check"
    setUserVerified(userId: ID!, verified: Boolean!): User!
  }
`;

const hide = (ctx: Context, u: UserDoc) => canSeePrivateFields(ctx.user, u.id);

export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: Context) => (ctx.user ? users.getUser(ctx.user.id) : null),
    user: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const u = await users.getUser(id);
      if (ctx.user) void users.recordProfileView(ctx.user.id, u.id);
      return u;
    },
    userByUsername: async (_: unknown, { username }: { username: string }, ctx: Context) => {
      const u = await users.getUserByUsername(username);
      if (ctx.user) void users.recordProfileView(ctx.user.id, u.id);
      return u;
    },
    suggestedUsers: async (_: unknown, { limit }: { limit?: number }, ctx: Context) => follows.suggestions(authed(ctx).id, Math.min(limit ?? 10, 30)),
    mutualConnections: async (_: unknown, { userId, limit }: { userId: string; limit?: number }, ctx: Context) => {
      const ids = await graph.mutualConnections(authed(ctx).id, userId, Math.min(limit ?? 50, 100));
      return Promise.all(ids.map((id) => ctx.loaders.user.load(id))).then((l) => l.filter(Boolean));
    },
    connectionPath: async (_: unknown, { userId }: { userId: string }, ctx: Context) => {
      const path = await graph.shortestPath(authed(ctx).id, userId);
      if (!path) return null;
      const list = await Promise.all(path.userIds.map((id) => ctx.loaders.user.load(id)));
      return { distance: path.distance, users: list.filter(Boolean) };
    }
  },

  Mutation: {
    register: (_: unknown, args: { username: string; email: string; password: string; displayName?: string }, ctx: Context) => auth.register(args, ctx.userAgent),
    login: (_: unknown, args: { email: string; password: string; twoFactorCode?: string }, ctx: Context) => auth.login(args, ctx.userAgent),
    refreshToken: (_: unknown, { refreshToken }: { refreshToken: string }, ctx: Context) => auth.refresh(refreshToken, ctx.userAgent),
    logout: (_: unknown, { refreshToken }: { refreshToken?: string }, ctx: Context) => auth.logout(authed(ctx).id, refreshToken),
    verifyEmail: (_: unknown, { token }: { token: string }) => auth.verifyEmail(token),
    resendVerificationEmail: (_: unknown, __: unknown, ctx: Context) => auth.resendVerification(authed(ctx).id),
    forgotPassword: (_: unknown, { email }: { email: string }) => auth.forgotPassword(email),
    resetPassword: (_: unknown, { token, password }: { token: string; password: string }) => auth.resetPassword(token, password),
    changePassword: (_: unknown, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }, ctx: Context) =>
      auth.changePassword(authed(ctx).id, currentPassword, newPassword),

    setupTwoFactor: (_: unknown, __: unknown, ctx: Context) => auth.beginTwoFactorSetup(authed(ctx).id),
    enableTwoFactor: (_: unknown, { code }: { code: string }, ctx: Context) => auth.enableTwoFactor(authed(ctx).id, code),
    disableTwoFactor: (_: unknown, { password, code }: { password: string; code?: string }, ctx: Context) => auth.disableTwoFactor(authed(ctx).id, password, code ?? ''),

    updateProfile: (_: unknown, { input }: { input: users.ProfileInput }, ctx: Context) => users.updateProfile(authed(ctx).id, input),
    uploadAvatar: async (_: unknown, { file }: { file: Promise<never> }, ctx: Context) => {
      const media = await saveUpload(file);
      if (media.type !== 'image') throw badInput('Avatar must be an image');
      return users.updateProfile(authed(ctx).id, { avatar: media.url });
    },
    updateNotificationPreferences: (_: unknown, { input }: { input: Record<string, boolean | null> }, ctx: Context) =>
      users.updateNotificationPreferences(authed(ctx).id, Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'boolean'))),
    followUser: (_: unknown, { userId }: { userId: string }, ctx: Context) => follows.follow(authed(ctx).id, userId),
    unfollowUser: (_: unknown, { userId }: { userId: string }, ctx: Context) => follows.unfollow(authed(ctx).id, userId),
    setUserVerified: (_: unknown, { userId, verified }: { userId: string; verified: boolean }, ctx: Context) => {
      requireAdmin(ctx.user);
      return users.setVerified(userId, verified);
    }
  },

  User: {
    email: (u: UserDoc, _: unknown, ctx: Context) => (hide(ctx, u) ? u.email : null),
    twoFactorEnabled: (u: UserDoc, _: unknown, ctx: Context) => (hide(ctx, u) ? u.twoFactorEnabled : null),
    notificationPreferences: (u: UserDoc, _: unknown, ctx: Context) => (hide(ctx, u) ? u.notificationPreferences : null),
    interests: (u: UserDoc) => u.interests ?? [],
    isMe: (u: UserDoc, _: unknown, ctx: Context) => ctx.user?.id === u.id,
    isFollowing: (u: UserDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.isFollowing.load(u.id) : false),
    isFollowedBy: (u: UserDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.isFollowedBy.load(u.id) : false),
    posts: async (u: UserDoc, args: PageArgs, ctx: Context) => posts.userPosts(ctx.user?.id, u.id, args),
    followers: async (u: UserDoc, args: PageArgs, ctx: Context) => ((await canViewUserContent(ctx.user?.id, u.id)) ? follows.followers(u.id, args.limit, args.cursor) : { nodes: [], hasMore: false, nextCursor: null }),
    following: async (u: UserDoc, args: PageArgs, ctx: Context) => ((await canViewUserContent(ctx.user?.id, u.id)) ? follows.following(u.id, args.limit, args.cursor) : { nodes: [], hasMore: false, nextCursor: null }),
    stories: (u: UserDoc, _: unknown, ctx: Context) => stories.userStories(ctx.user?.id, u.id),
    highlights: (u: UserDoc, _: unknown, ctx: Context) => stories.userHighlights(ctx.user?.id, u.id)
  }
};
