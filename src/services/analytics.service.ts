/**
 * Engagement analytics derived from the event stream and the denormalised counters.
 */
import { Types } from 'mongoose';
import Post from '../models/Post';
import User from '../models/User';
import AnalyticsEvent, { ANALYTICS_EVENT_TYPES, AnalyticsEventType } from '../models/AnalyticsEvent';
import { badInput } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import { cache } from './cache/cache.service';

export interface UserAnalytics {
  userId: string;
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalFollowers: number;
  totalFollowing: number;
  profileViews: number;
  engagementRate: number;
  topPostIds: string[];
  dailyActivity: { date: string; events: number }[];
}

export const trackEvent = async (userId: string, eventType: string, input: { postId?: string | null; targetUserId?: string | null; metadata?: string | null } = {}) => {
  if (!(ANALYTICS_EVENT_TYPES as readonly string[]).includes(eventType)) throw badInput(`Unknown event type. Allowed: ${ANALYTICS_EVENT_TYPES.join(', ')}`);
  let metadata: Record<string, unknown> = {};
  if (input.metadata) {
    try {
      const parsed = JSON.parse(input.metadata);
      if (parsed && typeof parsed === 'object') metadata = parsed;
    } catch {
      throw badInput('metadata must be a JSON object string');
    }
  }
  return AnalyticsEvent.create({
    user: userId,
    eventType: eventType as AnalyticsEventType,
    post: input.postId ? toObjectId(input.postId) : undefined,
    targetUser: input.targetUserId ? toObjectId(input.targetUserId) : undefined,
    metadata
  });
};

export const getUserAnalytics = async (userId: string): Promise<UserAnalytics> =>
  cache.getOrSetJSON(
    `analytics:user:${userId}`,
    async () => {
      const oid = new Types.ObjectId(userId);
      const [user, totals, profileViews, top, daily] = await Promise.all([
        User.findById(userId).select('followerCount followingCount postCount'),
        Post.aggregate<{ likes: number; comments: number; shares: number; posts: number }>([
          { $match: { author: oid, isArchived: false } },
          { $group: { _id: null, posts: { $sum: 1 }, likes: { $sum: '$likeCount' }, comments: { $sum: '$commentCount' }, shares: { $sum: '$sharesCount' } } }
        ]),
        AnalyticsEvent.countDocuments({ targetUser: oid, eventType: 'profile_viewed' }),
        Post.find({ author: oid, isArchived: false }).sort({ likeCount: -1, commentCount: -1, createdAt: -1 }).limit(5).select('_id'),
        AnalyticsEvent.aggregate<{ _id: string; events: number }>([
          { $match: { user: oid, createdAt: { $gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, events: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ])
      ]);
      const t = totals[0] ?? { likes: 0, comments: 0, shares: 0, posts: 0 };
      const interactions = t.likes + t.comments + t.shares;
      const followers = user?.followerCount ?? 0;
      return {
        userId,
        totalPosts: t.posts,
        totalLikes: t.likes,
        totalComments: t.comments,
        totalShares: t.shares,
        totalFollowers: followers,
        totalFollowing: user?.followingCount ?? 0,
        profileViews,
        // average interactions per post as a share of the audience (falls back to per-post when nobody follows yet)
        engagementRate: t.posts > 0 ? Math.round((interactions / t.posts / Math.max(followers, 1)) * 10000) / 100 : 0,
        topPostIds: top.map((p) => p.id),
        dailyActivity: daily.map((d) => ({ date: d._id, events: d.events }))
      };
    },
    30
  );

export const postEngagement = async (postId: string) => {
  const oid = toObjectId(postId);
  const [post, views, shares] = await Promise.all([
    Post.findById(oid).select('likeCount commentCount sharesCount reactionCount'),
    AnalyticsEvent.countDocuments({ post: oid, eventType: 'post_viewed' }),
    AnalyticsEvent.countDocuments({ post: oid, eventType: 'post_shared' })
  ]);
  return { postId, likes: post?.likeCount ?? 0, comments: post?.commentCount ?? 0, shares: Math.max(post?.sharesCount ?? 0, shares), reactions: post?.reactionCount ?? 0, views };
};
