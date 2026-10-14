/**
 * Monetization: tips, creator subscriptions, advertising and the creator dashboard.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { ITip } from '../../models/Tip';
import { ISubscription } from '../../models/Subscription';
import { IAd } from '../../models/Ad';
import * as money from '../../services/monetization.service';
import { resolveMedia, UploadedFile } from '../../utils/uploads';
import { paymentMode } from '../../services/payment.service';

type TipDoc = HydratedDocument<ITip>;
type SubDoc = HydratedDocument<ISubscription>;
type AdDoc = HydratedDocument<IAd>;
type MaybeUpload = Promise<UploadedFile>;

export const typeDefs = /* GraphQL */ `
  "How a charge was handled. With Stripe configured the client must confirm clientSecret with Stripe.js."
  type PaymentInfo {
    mode: String!
    status: String!
    clientSecret: String
  }

  type Tip {
    id: ID!
    sender: User
    recipient: User!
    amount: Float!
    currency: String!
    message: String
    isAnonymous: Boolean!
    paymentStatus: String!
    createdAt: DateTime!
  }

  type TipPayment {
    tip: Tip!
    payment: PaymentInfo!
  }

  type SubscriptionTier {
    key: String!
    name: String!
    price: Float!
    benefits: [String!]!
  }

  type CreatorSubscription {
    id: ID!
    creator: User!
    subscriber: User!
    tier: String!
    price: Float!
    currency: String!
    benefits: [String!]!
    startDate: DateTime!
    endDate: DateTime!
    isActive: Boolean!
    "False once cancelled: access continues until endDate"
    autoRenew: Boolean!
    createdAt: DateTime!
  }

  type SubscriptionPayment {
    subscription: CreatorSubscription!
    payment: PaymentInfo!
  }

  type AgeRange {
    min: Int!
    max: Int!
  }

  type AdTargetAudience {
    interests: [String!]!
    ageRange: AgeRange
    locations: [String!]!
  }

  type Ad {
    id: ID!
    advertiser: User!
    title: String!
    description: String!
    media: [Media!]!
    targetUrl: String!
    targetAudience: AdTargetAudience!
    budget: Float!
    spent: Float!
    impressions: Int!
    clicks: Int!
    ctr: Float!
    "draft (awaiting payment) | active | paused | completed"
    status: String!
    startDate: DateTime!
    endDate: DateTime!
    createdAt: DateTime!
  }

  type AdPayment {
    ad: Ad!
    payment: PaymentInfo!
  }

  type MonthlyAmount {
    month: String!
    total: Float!
  }

  type CreatorDashboard {
    totalEarnings: Float!
    totalTips: Float!
    "Monthly recurring revenue from active subscribers"
    totalSubscriptions: Float!
    subscriberCount: Int!
    activeAds: [Ad!]!
    recentTips: [Tip!]!
    tipsByMonth: [MonthlyAmount!]!
  }

  input AgeRangeInput {
    min: Int!
    max: Int!
  }

  input AdTargetAudienceInput {
    interests: [String!]!
    ageRange: AgeRangeInput
    locations: [String!]!
  }

  extend type Query {
    paymentMode: String!
    subscriptionTiers: [SubscriptionTier!]!
    myTips: [Tip!]!
    receivedTips: [Tip!]!
    mySubscriptions: [CreatorSubscription!]!
    "Your active subscribers"
    mySubscribers: [CreatorSubscription!]!
    myAds: [Ad!]!
    ad(id: ID!): Ad!
    "Ads eligible for you, matched on location / interests / age"
    adsForYou(limit: Int): [Ad!]!
    creatorDashboard: CreatorDashboard!
  }

  extend type Mutation {
    sendTip(recipientId: ID!, amount: Float!, message: String, isAnonymous: Boolean): TipPayment!
    createSubscription(creatorId: ID!, tier: String!): SubscriptionPayment!
    updateSubscription(subscriptionId: ID!, tier: String!): SubscriptionPayment!
    cancelSubscription(subscriptionId: ID!): Boolean!

    createAd(
      title: String!
      description: String!
      media: [Upload!]
      mediaUrls: [String!]
      targetUrl: String!
      targetAudience: AdTargetAudienceInput!
      budget: Float!
      startDate: String!
      endDate: String!
    ): AdPayment!
    updateAd(adId: ID!, title: String, description: String, status: String): Ad!
    pauseAd(adId: ID!): Ad!
    resumeAd(adId: ID!): Ad!
    deleteAd(adId: ID!): Boolean!
    "Billable once per viewer per hour; call when the ad is shown"
    recordAdImpression(adId: ID!): Boolean!
    "Returns the destination URL"
    recordAdClick(adId: ID!): String!
  }
`;

export const resolvers = {
  Query: {
    paymentMode: () => paymentMode(),
    subscriptionTiers: () => money.subscriptionTiers(),
    myTips: (_: unknown, __: unknown, ctx: Context) => money.myTips(authed(ctx).id),
    receivedTips: (_: unknown, __: unknown, ctx: Context) => money.receivedTips(authed(ctx).id),
    mySubscriptions: (_: unknown, __: unknown, ctx: Context) => money.mySubscriptions(authed(ctx).id),
    mySubscribers: (_: unknown, __: unknown, ctx: Context) => money.subscribersOf(authed(ctx).id),
    myAds: (_: unknown, __: unknown, ctx: Context) => money.myAds(authed(ctx).id),
    ad: (_: unknown, { id }: { id: string }, ctx: Context) => money.getAd(authed(ctx).id, id),
    adsForYou: (_: unknown, { limit }: { limit?: number }, ctx: Context) => money.adsForViewer(ctx.user?.id, limit ?? 2),
    creatorDashboard: (_: unknown, __: unknown, ctx: Context) => money.creatorDashboard(authed(ctx).id)
  },

  Mutation: {
    sendTip: (_: unknown, a: { recipientId: string; amount: number; message?: string; isAnonymous?: boolean }, ctx: Context) => money.sendTip(authed(ctx).id, a.recipientId, a.amount, a.message, a.isAnonymous),
    createSubscription: (_: unknown, a: { creatorId: string; tier: string }, ctx: Context) => money.subscribe(authed(ctx).id, a.creatorId, a.tier),
    updateSubscription: (_: unknown, a: { subscriptionId: string; tier: string }, ctx: Context) => money.changeTier(authed(ctx).id, a.subscriptionId, a.tier),
    cancelSubscription: (_: unknown, a: { subscriptionId: string }, ctx: Context) => money.cancelSubscription(authed(ctx).id, a.subscriptionId),

    createAd: async (_: unknown, a: Omit<money.AdInput, 'media'> & { media?: MaybeUpload[]; mediaUrls?: string[] }, ctx: Context) => {
      const user = authed(ctx);
      const media = await resolveMedia(a.media, a.mediaUrls);
      return money.createAd(user.id, { ...a, media });
    },
    updateAd: (_: unknown, { adId, ...patch }: { adId: string; title?: string; description?: string; status?: string }, ctx: Context) => money.updateAd(authed(ctx).id, adId, patch),
    pauseAd: (_: unknown, { adId }: { adId: string }, ctx: Context) => money.setAdStatus(authed(ctx).id, adId, 'paused'),
    resumeAd: (_: unknown, { adId }: { adId: string }, ctx: Context) => money.setAdStatus(authed(ctx).id, adId, 'active'),
    deleteAd: (_: unknown, { adId }: { adId: string }, ctx: Context) => money.deleteAd(authed(ctx).id, adId),
    recordAdImpression: (_: unknown, { adId }: { adId: string }, ctx: Context) => money.recordImpression(authed(ctx).id, adId),
    recordAdClick: (_: unknown, { adId }: { adId: string }, ctx: Context) => money.recordClick(authed(ctx).id, adId)
  },

  Tip: {
    // anonymous tips hide the sender from the recipient (the sender still sees their own)
    sender: (t: TipDoc, _: unknown, ctx: Context) => (t.isAnonymous && ctx.user?.id !== t.sender.toString() ? null : ctx.loaders.user.load(t.sender.toString())),
    recipient: (t: TipDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(t.recipient.toString())
  },

  CreatorSubscription: {
    creator: (s: SubDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(s.creator.toString()),
    subscriber: (s: SubDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(s.subscriber.toString())
  },

  Ad: {
    advertiser: (a: AdDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(a.advertiser.toString()),
    ctr: (a: AdDoc) => money.adCtr(a),
    spent: (a: AdDoc) => Math.round(a.spent * 10000) / 10000,
    targetAudience: (a: AdDoc) => ({
      interests: a.targetAudience?.interests ?? [],
      ageRange: a.targetAudience?.ageRange?.min !== undefined ? a.targetAudience.ageRange : null,
      locations: a.targetAudience?.locations ?? []
    })
  }
};
