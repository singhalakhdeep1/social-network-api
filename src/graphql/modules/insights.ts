/**
 * Analytics, integrations (webhooks) and social sharing.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { IWebhook, WEBHOOK_EVENTS } from '../../models/Webhook';
import AnalyticsEvent from '../../models/AnalyticsEvent';
import * as analytics from '../../services/analytics.service';
import * as webhooks from '../../services/webhook.service';
import * as postSvc from '../../services/post.service';
import Post from '../../models/Post';
import { env } from '../../config/env';
import { badInput, forbidden } from '../../utils/errors';

type WebhookDoc = HydratedDocument<IWebhook>;

const SHARE_TARGETS: Record<string, (url: string, text: string) => string> = {
  twitter: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  facebook: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  linkedin: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  whatsapp: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
  telegram: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  copy_link: (u) => u
};

export const typeDefs = /* GraphQL */ `
  type DailyActivity {
    date: String!
    events: Int!
  }

  type UserAnalytics {
    userId: ID!
    totalPosts: Int!
    totalLikes: Int!
    totalComments: Int!
    totalShares: Int!
    totalFollowers: Int!
    totalFollowing: Int!
    profileViews: Int!
    "Average interactions per post as a percentage of your follower count"
    engagementRate: Float!
    topPosts: [Post!]!
    dailyActivity: [DailyActivity!]!
  }

  type PostEngagement {
    postId: ID!
    likes: Int!
    comments: Int!
    shares: Int!
    reactions: Int!
    views: Int!
  }

  type AnalyticsEvent {
    id: ID!
    eventType: String!
    createdAt: DateTime!
  }

  type Webhook {
    id: ID!
    url: String!
    events: [String!]!
    "HMAC-SHA256 signing secret: verify X-Webhook-Signature = sha256(hmac(secret, timestamp + '.' + body))"
    secret: String!
    isActive: Boolean!
    lastTriggered: DateTime
    lastStatus: Int
    triggerCount: Int!
    failureCount: Int!
    createdAt: DateTime!
  }

  type SocialShare {
    platform: String!
    url: String!
    shareCount: Int!
  }

  extend type Query {
    myAnalytics: UserAnalytics!
    "Admins only (or yourself)"
    userAnalytics(userId: ID!): UserAnalytics!
    postEngagement(postId: ID!): PostEngagement!
    myWebhooks: [Webhook!]!
    webhook(id: ID!): Webhook!
    webhookEvents: [String!]!
  }

  extend type Mutation {
    trackEvent(eventType: String!, postId: ID, targetUserId: ID, metadata: String): AnalyticsEvent!
    createWebhook(url: String!, events: [String!]!): Webhook!
    updateWebhook(webhookId: ID!, url: String, events: [String!], isActive: Boolean): Webhook!
    deleteWebhook(webhookId: ID!): Boolean!
    "Returns a share link for the platform (twitter, facebook, linkedin, whatsapp, telegram, copy_link) and counts the share"
    shareToPlatform(postId: ID!, platform: String!): SocialShare!
  }
`;

const toAnalytics = async (userId: string, ctx: Context) => {
  const a = await analytics.getUserAnalytics(userId);
  const posts = await Promise.all(a.topPostIds.map((id) => ctx.loaders.post.load(id)));
  return { ...a, topPosts: posts.filter(Boolean) };
};

export const resolvers = {
  Query: {
    myAnalytics: (_: unknown, __: unknown, ctx: Context) => toAnalytics(authed(ctx).id, ctx),
    userAnalytics: (_: unknown, { userId }: { userId: string }, ctx: Context) => {
      const user = authed(ctx);
      if (user.id !== userId && user.role !== 'admin') throw forbidden('You can only view your own analytics');
      return toAnalytics(userId, ctx);
    },
    postEngagement: async (_: unknown, { postId }: { postId: string }, ctx: Context) => {
      const user = authed(ctx);
      const post = await Post.findById(postId).select('author');
      if (post && post.author.toString() !== user.id && user.role !== 'admin') throw forbidden('Only the author can view post engagement');
      return analytics.postEngagement(postId);
    },
    myWebhooks: (_: unknown, __: unknown, ctx: Context) => webhooks.listWebhooks(authed(ctx).id),
    webhook: (_: unknown, { id }: { id: string }, ctx: Context) => webhooks.getWebhook(authed(ctx).id, id),
    webhookEvents: () => [...WEBHOOK_EVENTS]
  },
  Mutation: {
    trackEvent: (_: unknown, a: { eventType: string; postId?: string; targetUserId?: string; metadata?: string }, ctx: Context) =>
      analytics.trackEvent(authed(ctx).id, a.eventType, a),
    createWebhook: (_: unknown, { url, events }: { url: string; events: string[] }, ctx: Context) => webhooks.createWebhook(authed(ctx).id, url, events),
    updateWebhook: (_: unknown, { webhookId, ...patch }: { webhookId: string; url?: string; events?: string[]; isActive?: boolean }, ctx: Context) => webhooks.updateWebhook(authed(ctx).id, webhookId, patch),
    deleteWebhook: (_: unknown, { webhookId }: { webhookId: string }, ctx: Context) => webhooks.deleteWebhook(authed(ctx).id, webhookId),
    shareToPlatform: async (_: unknown, { postId, platform }: { postId: string; platform: string }, ctx: Context) => {
      const user = authed(ctx);
      const builder = SHARE_TARGETS[platform.toLowerCase()];
      if (!builder) throw badInput(`Unsupported platform. Choose one of: ${Object.keys(SHARE_TARGETS).join(', ')}`);
      const post = await postSvc.getVisiblePost(user.id, postId);
      const permalink = `${env.frontendUrl}/post/${post.id}`;
      await AnalyticsEvent.create({ user: user.id, eventType: 'post_shared', post: post._id, targetUser: post.author, metadata: { platform: platform.toLowerCase() } });
      const shareCount = await AnalyticsEvent.countDocuments({ post: post._id, eventType: 'post_shared', 'metadata.platform': platform.toLowerCase() });
      return { platform: platform.toLowerCase(), url: builder(permalink, post.content.slice(0, 120)), shareCount };
    }
  },
  Webhook: {
    events: (w: WebhookDoc) => w.events
  }
};
