/**
 * Monetization: tips, creator subscriptions, advertising and the creator dashboard.
 * Every payment goes through payment.service; `applyPayment` finalises the business object
 * (instantly in demo mode, from the Stripe webhook otherwise).
 */
import { HydratedDocument, Types } from 'mongoose';
import Tip, { ITip } from '../models/Tip';
import Subscription, { ISubscription, SUBSCRIPTION_TIERS, TierKey } from '../models/Subscription';
import Ad, { IAd } from '../models/Ad';
import User, { IUser } from '../models/User';
import AnalyticsEvent from '../models/AnalyticsEvent';
import { IMedia } from '../models/Post';
import { assertUrl, sanitizeInput } from '../middleware/validation';
import { badInput, conflict, forbidden, notFound } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import { charge, ChargeResult, PaymentEvent } from './payment.service';
import { notify } from './notification.service';
import { cache } from './cache/cache.service';
import logger from '../utils/logger';

export type TipDoc = HydratedDocument<ITip>;
export type SubscriptionDoc = HydratedDocument<ISubscription>;
export type AdDoc = HydratedDocument<IAd>;

const PERIOD_MS = 30 * 24 * 3600 * 1000;
const AD_COST_PER_IMPRESSION = 0.002; // $2 CPM
const AD_COST_PER_CLICK = 0.25;

export interface PaymentSummary {
  mode: 'stripe' | 'demo';
  status: 'succeeded' | 'pending';
  clientSecret?: string;
}
const summary = (c: ChargeResult): PaymentSummary => ({ mode: c.mode, status: c.status, clientSecret: c.clientSecret });

// ---------------------------------------------------------------- tips

export const sendTip = async (senderId: string, recipientId: string, amount: number, message?: string | null, isAnonymous?: boolean | null): Promise<{ tip: TipDoc; payment: PaymentSummary }> => {
  if (senderId === recipientId) throw badInput('You cannot tip yourself');
  if (!Number.isFinite(amount) || amount < 0.5 || amount > 1000) throw badInput('Tip must be between 0.50 and 1000.00');
  const recipient = await User.findById(toObjectId(recipientId)).select('username');
  if (!recipient) throw notFound('User');
  const rounded = Math.round(amount * 100) / 100;

  const tip = await Tip.create({ sender: senderId, recipient: recipientId, amount: rounded, message: message ? sanitizeInput(message).slice(0, 500) : undefined, isAnonymous: !!isAnonymous });
  const result = await charge({ amount: rounded, currency: 'USD', description: `Tip to @${recipient.username}`, kind: 'tip', refId: tip.id });
  tip.paymentId = result.paymentId;
  tip.paymentMode = result.mode;
  await tip.save();
  if (result.status === 'succeeded') await applyPayment({ paymentId: result.paymentId, status: 'succeeded', metadata: { kind: 'tip', refId: tip.id } });
  return { tip: (await Tip.findById(tip._id)) as TipDoc, payment: summary(result) };
};

export const myTips = (userId: string): Promise<TipDoc[]> => Tip.find({ sender: userId }).sort({ createdAt: -1 }).limit(100);
export const receivedTips = (userId: string): Promise<TipDoc[]> => Tip.find({ recipient: userId, paymentStatus: 'completed' }).sort({ createdAt: -1 }).limit(100);

// ---------------------------------------------------------------- subscriptions

export const subscriptionTiers = () => Object.entries(SUBSCRIPTION_TIERS).map(([key, t]) => ({ key, name: t.name, price: t.price, benefits: [...t.benefits] }));

const tierOf = (tier: string): (typeof SUBSCRIPTION_TIERS)[TierKey] => {
  const t = SUBSCRIPTION_TIERS[tier.toLowerCase() as TierKey];
  if (!t) throw badInput(`Unknown tier. Choose one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}`);
  return t;
};

export const subscribe = async (subscriberId: string, creatorId: string, tierKey: string): Promise<{ subscription: SubscriptionDoc; payment: PaymentSummary }> => {
  if (subscriberId === creatorId) throw badInput('You cannot subscribe to yourself');
  if (!(await User.exists({ _id: toObjectId(creatorId) }))) throw notFound('Creator');
  const tier = tierOf(tierKey);
  const key = tierKey.toLowerCase() as TierKey;

  let sub = await Subscription.findOne({ creator: creatorId, subscriber: subscriberId });
  if (sub?.isActive && sub.endDate.getTime() > Date.now()) throw conflict('Already subscribed; use updateSubscription to change tier');
  const now = new Date();
  if (!sub) sub = new Subscription({ creator: creatorId, subscriber: subscriberId });
  sub.tier = key;
  sub.price = tier.price;
  sub.benefits = [...tier.benefits];
  sub.startDate = now;
  sub.endDate = new Date(now.getTime() + PERIOD_MS);
  sub.autoRenew = true;
  sub.isActive = false;
  await sub.save();

  const result = await charge({ amount: tier.price, currency: 'USD', description: `${tier.name} subscription`, kind: 'subscription', refId: sub.id, extra: { tier: key } });
  sub.paymentId = result.paymentId;
  sub.paymentMode = result.mode;
  await sub.save();
  if (result.status === 'succeeded') await applyPayment({ paymentId: result.paymentId, status: 'succeeded', metadata: { kind: 'subscription', refId: sub.id, tier: key } });
  return { subscription: (await Subscription.findById(sub._id)) as SubscriptionDoc, payment: summary(result) };
};

/** Switching tier charges the new tier's price and restarts the 30-day period. */
export const changeTier = async (subscriberId: string, subscriptionId: string, tierKey: string): Promise<{ subscription: SubscriptionDoc; payment: PaymentSummary }> => {
  const sub = await Subscription.findById(toObjectId(subscriptionId));
  if (!sub) throw notFound('Subscription');
  if (sub.subscriber.toString() !== subscriberId) throw forbidden();
  if (!sub.isActive) throw badInput('Subscription is not active');
  const tier = tierOf(tierKey);
  const key = tierKey.toLowerCase() as TierKey;
  if (key === sub.tier) throw badInput('Already on that tier');
  const result = await charge({ amount: tier.price, currency: 'USD', description: `Switch to ${tier.name}`, kind: 'subscription', refId: sub.id, extra: { tier: key } });
  sub.paymentId = result.paymentId;
  sub.paymentMode = result.mode;
  await sub.save();
  if (result.status === 'succeeded') await applyPayment({ paymentId: result.paymentId, status: 'succeeded', metadata: { kind: 'subscription', refId: sub.id, tier: key } });
  return { subscription: (await Subscription.findById(sub._id)) as SubscriptionDoc, payment: summary(result) };
};

/** Cancelling stops renewal; the subscriber keeps access until the paid period ends. */
export const cancelSubscription = async (subscriberId: string, subscriptionId: string): Promise<boolean> => {
  const sub = await Subscription.findById(toObjectId(subscriptionId));
  if (!sub) throw notFound('Subscription');
  if (sub.subscriber.toString() !== subscriberId) throw forbidden();
  sub.autoRenew = false;
  await sub.save();
  return true;
};

export const mySubscriptions = (userId: string): Promise<SubscriptionDoc[]> => Subscription.find({ subscriber: userId, isActive: true, endDate: { $gt: new Date() } }).sort({ endDate: 1 });
export const subscribersOf = (creatorId: string): Promise<SubscriptionDoc[]> => Subscription.find({ creator: creatorId, isActive: true, endDate: { $gt: new Date() } }).sort({ createdAt: -1 });

/** Daily job: renew (demo) or lapse (stripe, which has no stored payment method) expired subscriptions. */
export const processSubscriptionRenewals = async (): Promise<{ renewed: number; lapsed: number }> => {
  const due = await Subscription.find({ isActive: true, endDate: { $lte: new Date() } }).limit(500);
  let renewed = 0;
  let lapsed = 0;
  for (const sub of due) {
    if (sub.autoRenew && sub.paymentMode === 'demo') {
      sub.startDate = new Date();
      sub.endDate = new Date(Date.now() + PERIOD_MS);
      await sub.save();
      renewed++;
    } else {
      sub.isActive = false;
      await sub.save();
      lapsed++;
      void notify({ recipient: sub.subscriber, sender: sub.creator, type: 'subscription', message: 'Your subscription has ended. Subscribe again to keep your benefits.' });
    }
  }
  return { renewed, lapsed };
};

// ---------------------------------------------------------------- payments finalisation

export const applyPayment = async (event: PaymentEvent): Promise<void> => {
  const { kind, refId, tier } = event.metadata;
  const ok = event.status === 'succeeded';
  switch (kind) {
    case 'tip': {
      const tip = await Tip.findOneAndUpdate({ _id: refId, paymentStatus: 'pending' }, { paymentStatus: ok ? 'completed' : 'failed' }, { new: true });
      if (tip && ok) {
        const sender = await User.findById(tip.sender).select('username');
        void notify({ recipient: tip.recipient, sender: tip.isAnonymous ? undefined : tip.sender, type: 'tip', message: `${tip.isAnonymous ? 'Someone' : sender?.username ?? 'Someone'} sent you a $${tip.amount.toFixed(2)} tip` });
      }
      break;
    }
    case 'subscription': {
      const sub = await Subscription.findById(refId);
      if (!sub || !ok) break;
      if (sub.paymentId !== event.paymentId && !event.paymentId.startsWith('demo_')) break; // stale event for a superseded charge
      const key = (tier as TierKey) ?? sub.tier;
      const def = SUBSCRIPTION_TIERS[key];
      const wasActive = sub.isActive;
      sub.tier = key;
      sub.price = def.price;
      sub.benefits = [...def.benefits];
      sub.isActive = true;
      sub.startDate = new Date();
      sub.endDate = new Date(Date.now() + PERIOD_MS);
      await sub.save();
      const subscriber = await User.findById(sub.subscriber).select('username');
      void notify({ recipient: sub.creator, sender: sub.subscriber, type: 'subscription', message: `${subscriber?.username ?? 'Someone'} ${wasActive ? 'switched to' : 'subscribed to'} ${def.name}` });
      break;
    }
    case 'ad': {
      const ad = await Ad.findById(refId);
      if (ad && ad.status === 'draft' && ok) {
        ad.status = 'active';
        await ad.save();
      }
      break;
    }
    default:
      logger.warn(`applyPayment: unknown kind "${kind}" for ${event.paymentId}`);
  }
};

// ---------------------------------------------------------------- ads

export interface AdInput {
  title: string;
  description: string;
  media: IMedia[];
  targetUrl: string;
  targetAudience: { interests: string[]; ageRange?: { min: number; max: number } | null; locations: string[] };
  budget: number;
  startDate: string;
  endDate: string;
}

export const createAd = async (advertiserId: string, input: AdInput): Promise<{ ad: AdDoc; payment: PaymentSummary }> => {
  assertUrl(input.targetUrl, 'Target URL');
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badInput('Invalid ad dates');
  if (end <= start) throw badInput('Ad must end after it starts');
  if (end.getTime() < Date.now()) throw badInput('Ad end date is in the past');
  if (!Number.isFinite(input.budget) || input.budget < 5 || input.budget > 100000) throw badInput('Budget must be between 5 and 100000');
  if (input.targetAudience.ageRange && input.targetAudience.ageRange.min > input.targetAudience.ageRange.max) throw badInput('Invalid age range');

  const ad = await Ad.create({
    advertiser: advertiserId,
    title: sanitizeInput(input.title).slice(0, 100),
    description: sanitizeInput(input.description).slice(0, 500),
    media: input.media,
    targetUrl: input.targetUrl,
    targetAudience: {
      interests: input.targetAudience.interests.map((i) => sanitizeInput(i).toLowerCase()).filter(Boolean),
      ageRange: input.targetAudience.ageRange ?? undefined,
      locations: input.targetAudience.locations.map((l) => sanitizeInput(l).toLowerCase()).filter(Boolean)
    },
    budget: Math.round(input.budget * 100) / 100,
    startDate: start,
    endDate: end
  });
  const result = await charge({ amount: ad.budget, currency: 'USD', description: `Ad budget: ${ad.title}`, kind: 'ad', refId: ad.id });
  ad.paymentId = result.paymentId;
  ad.paymentMode = result.mode;
  await ad.save();
  if (result.status === 'succeeded') await applyPayment({ paymentId: result.paymentId, status: 'succeeded', metadata: { kind: 'ad', refId: ad.id } });
  return { ad: (await Ad.findById(ad._id)) as AdDoc, payment: summary(result) };
};

const ownedAd = async (userId: string, id: string): Promise<AdDoc> => {
  const ad = await Ad.findById(toObjectId(id));
  if (!ad) throw notFound('Ad');
  if (ad.advertiser.toString() !== userId) throw forbidden();
  return ad;
};

export const getAd = ownedAd;
export const myAds = (userId: string): Promise<AdDoc[]> => Ad.find({ advertiser: userId }).sort({ createdAt: -1 });

export const updateAd = async (userId: string, id: string, patch: { title?: string | null; description?: string | null; status?: string | null }): Promise<AdDoc> => {
  const ad = await ownedAd(userId, id);
  if (patch.title) ad.title = sanitizeInput(patch.title).slice(0, 100);
  if (patch.description) ad.description = sanitizeInput(patch.description).slice(0, 500);
  if (patch.status) {
    if (!['active', 'paused'].includes(patch.status)) throw badInput('Status can only be set to active or paused');
    return setAdStatus(userId, id, patch.status as 'active' | 'paused', ad);
  }
  return ad.save();
};

export const setAdStatus = async (userId: string, id: string, status: 'active' | 'paused', loaded?: AdDoc): Promise<AdDoc> => {
  const ad = loaded ?? (await ownedAd(userId, id));
  if (ad.status === 'draft') throw badInput('This ad is awaiting payment');
  if (ad.status === 'completed') throw badInput('This ad has finished');
  if (status === 'active' && ad.spent >= ad.budget) throw badInput('Ad budget is exhausted');
  ad.status = status;
  return ad.save();
};

export const deleteAd = async (userId: string, id: string): Promise<boolean> => {
  const ad = await ownedAd(userId, id);
  await ad.deleteOne();
  return true;
};

const ageOf = (user: IUser): number | undefined => (user.birthYear ? new Date().getFullYear() - user.birthYear : undefined);

/** Ads eligible for this viewer: running, funded, within dates, matching targeting, not their own. */
export const adsForViewer = async (viewerId: string | undefined, limit = 2): Promise<AdDoc[]> => {
  const now = new Date();
  const candidates = await Ad.find({ status: 'active', startDate: { $lte: now }, endDate: { $gte: now }, $expr: { $lt: ['$spent', '$budget'] }, ...(viewerId ? { advertiser: { $ne: new Types.ObjectId(viewerId) } } : {}) }).limit(100);
  const viewer = viewerId ? await User.findById(viewerId).select('interests location birthYear') : null;
  const eligible = candidates.filter((ad) => {
    const t = ad.targetAudience;
    if (t.locations.length && !(viewer?.location && t.locations.some((l) => viewer.location!.toLowerCase().includes(l)))) return false;
    if (t.interests.length && !(viewer && viewer.interests.some((i) => t.interests.includes(i)))) return false;
    if (t.ageRange?.min !== undefined) {
      const age = viewer ? ageOf(viewer) : undefined;
      if (age === undefined || age < t.ageRange.min || age > t.ageRange.max) return false;
    }
    return true;
  });
  // weight by remaining budget so well-funded campaigns get proportionally more reach
  const weighted = eligible.map((ad) => ({ ad, w: (ad.budget - ad.spent) * Math.random() })).sort((a, b) => b.w - a.w);
  return weighted.slice(0, Math.min(limit, 5)).map((x) => x.ad);
};

const charged = async (ad: AdDoc, cost: number, inc: Partial<Record<'impressions' | 'clicks', number>>): Promise<void> => {
  const updated = await Ad.findOneAndUpdate({ _id: ad._id, status: 'active', $expr: { $lt: ['$spent', '$budget'] } }, { $inc: { spent: cost, ...inc } }, { new: true });
  if (updated && updated.spent >= updated.budget) await Ad.updateOne({ _id: ad._id }, { status: 'completed', spent: updated.budget });
};

export const recordImpression = async (viewerId: string, adId: string): Promise<boolean> => {
  const ad = await Ad.findById(toObjectId(adId));
  if (!ad || ad.status !== 'active') return false;
  const key = `ad:imp:${adId}:${viewerId}`;
  if (await cache.get(key)) return false; // one billable impression per viewer per hour
  await cache.set(key, '1', 3600);
  await charged(ad, AD_COST_PER_IMPRESSION, { impressions: 1 });
  void AnalyticsEvent.create({ user: viewerId, eventType: 'ad_impression', targetUser: ad.advertiser, metadata: { adId } });
  return true;
};

export const recordClick = async (viewerId: string, adId: string): Promise<string> => {
  const ad = await Ad.findById(toObjectId(adId));
  if (!ad) throw notFound('Ad');
  const key = `ad:click:${adId}:${viewerId}`;
  if (ad.status === 'active' && !(await cache.get(key))) {
    await cache.set(key, '1', 3600);
    await charged(ad, AD_COST_PER_CLICK, { clicks: 1 });
    void AnalyticsEvent.create({ user: viewerId, eventType: 'ad_click', targetUser: ad.advertiser, metadata: { adId } });
  }
  return ad.targetUrl;
};

export const completeFinishedAds = async (): Promise<number> => {
  const res = await Ad.updateMany({ status: { $in: ['active', 'paused'] }, endDate: { $lt: new Date() } }, { status: 'completed' });
  return res.modifiedCount;
};

export const adCtr = (ad: IAd): number => (ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 100 : 0);

// ---------------------------------------------------------------- dashboard

export const creatorDashboard = async (userId: string) => {
  const oid = new Types.ObjectId(userId);
  const [tips, subs, ads, byMonth] = await Promise.all([
    Tip.find({ recipient: userId, paymentStatus: 'completed' }).sort({ createdAt: -1 }),
    subscribersOf(userId),
    Ad.find({ advertiser: userId, status: 'active' }),
    Tip.aggregate<{ _id: string; total: number }>([
      { $match: { recipient: oid, paymentStatus: 'completed', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 3600 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  const totalTips = Math.round(tips.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const monthlySubscriptionRevenue = Math.round(subs.reduce((s, x) => s + x.price, 0) * 100) / 100;
  return {
    totalEarnings: Math.round((totalTips + monthlySubscriptionRevenue) * 100) / 100,
    totalTips,
    totalSubscriptions: monthlySubscriptionRevenue,
    subscriberCount: subs.length,
    activeAds: ads,
    recentTips: tips.slice(0, 10),
    tipsByMonth: byMonth.map((m) => ({ month: m._id, total: Math.round(m.total * 100) / 100 }))
  };
};
