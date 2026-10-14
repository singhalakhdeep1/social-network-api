/**
 * Follow graph writes and reads. Counters on User are kept in step with the Follow collection.
 */
import { HydratedDocument, Types } from 'mongoose';
import Follow from '../models/Follow';
import User, { IUser } from '../models/User';
import { badInput, notFound } from '../utils/errors';
import { Page, clampLimit, decodeCursor, encodeCursor, toObjectId } from '../utils/pagination';
import { notify } from './notification.service';
import { graph } from './graph/graph.service';
import { cache } from './cache/cache.service';
import { emitDomainEvent, pubsub, TOPICS } from '../events/pubsub';
import AnalyticsEvent from '../models/AnalyticsEvent';

const followingCacheKey = (userId: string) => `following:${userId}`;

/** Ids the user follows (cached briefly; used by feed and visibility filtering). */
export const followingIds = async (userId: string): Promise<string[]> =>
  cache.getOrSetJSON(
    followingCacheKey(userId),
    async () => (await Follow.find({ follower: userId }).select('following').lean()).map((f) => String(f.following)),
    30
  );

export const isFollowing = async (followerId: string, targetId: string): Promise<boolean> => !!(await Follow.exists({ follower: followerId, following: targetId }));

export const follow = async (followerId: string, targetId: string): Promise<HydratedDocument<IUser>> => {
  if (followerId === targetId) throw badInput('You cannot follow yourself');
  const target = await User.findById(targetId);
  if (!target) throw notFound('User');

  let created = false;
  try {
    const res = await Follow.findOneAndUpdate(
      { follower: followerId, following: targetId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true, includeResultMetadata: true }
    );
    created = !res.lastErrorObject?.updatedExisting;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // lost a race with a concurrent follow: already exists
  }
  if (created) {
    await Promise.all([User.updateOne({ _id: followerId }, { $inc: { followingCount: 1 } }), User.updateOne({ _id: targetId }, { $inc: { followerCount: 1 } })]);
    await cache.delete(followingCacheKey(followerId), `feed:${followerId}`);
    const follower = await User.findById(followerId).select('username');
    void notify({ recipient: targetId, sender: followerId, type: 'follow', message: `${follower?.username ?? 'Someone'} started following you` });
    void graph.follow(followerId, targetId);
    void pubsub.publish(TOPICS.USER_FOLLOWED(targetId), { id: followerId });
    emitDomainEvent('webhook', { userId: targetId, event: 'follow.created', data: { followerId, followingId: targetId } });
    void AnalyticsEvent.create({ user: followerId, eventType: 'user_followed', targetUser: targetId });
  }
  return (await User.findById(targetId)) as HydratedDocument<IUser>;
};

export const unfollow = async (followerId: string, targetId: string): Promise<HydratedDocument<IUser>> => {
  const target = await User.findById(targetId);
  if (!target) throw notFound('User');
  const res = await Follow.deleteOne({ follower: followerId, following: targetId });
  if (res.deletedCount === 1) {
    await Promise.all([User.updateOne({ _id: followerId }, { $inc: { followingCount: -1 } }), User.updateOne({ _id: targetId }, { $inc: { followerCount: -1 } })]);
    await cache.delete(followingCacheKey(followerId), `feed:${followerId}`);
    void graph.unfollow(followerId, targetId);
    void AnalyticsEvent.create({ user: followerId, eventType: 'user_unfollowed', targetUser: targetId });
  }
  return (await User.findById(targetId)) as HydratedDocument<IUser>;
};

async function edgesPage(side: 'followers' | 'following', userId: string, limit?: number | null, cursor?: string | null): Promise<Page<HydratedDocument<IUser>>> {
  const pageSize = clampLimit(limit, 20, 100);
  const match = side === 'followers' ? { following: toObjectId(userId) } : { follower: toObjectId(userId) };
  const after = decodeCursor(cursor);
  const edges = await Follow.find({ ...match, ...(after ? { _id: { $lt: new Types.ObjectId(after) } } : {}) })
    .sort({ _id: -1 })
    .limit(pageSize + 1);
  const hasMore = edges.length > pageSize;
  const slice = hasMore ? edges.slice(0, pageSize) : edges;
  const ids = slice.map((e) => (side === 'followers' ? e.follower : e.following));
  const users = await User.find({ _id: { $in: ids } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const nodes = ids.map((id) => byId.get(String(id))).filter((u): u is HydratedDocument<IUser> => !!u);
  return { nodes, hasMore, nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]._id) : null };
}

export const followers = (userId: string, limit?: number | null, cursor?: string | null) => edgesPage('followers', userId, limit, cursor);
export const following = (userId: string, limit?: number | null, cursor?: string | null) => edgesPage('following', userId, limit, cursor);

export const relationship = async (viewerId: string, targetId: string): Promise<{ isFollowing: boolean; isFollowedBy: boolean }> => {
  const [a, b] = await Promise.all([Follow.exists({ follower: viewerId, following: targetId }), Follow.exists({ follower: targetId, following: viewerId })]);
  return { isFollowing: !!a, isFollowedBy: !!b };
};

export const suggestions = async (userId: string, limit = 10): Promise<{ user: HydratedDocument<IUser>; mutualCount: number }[]> => {
  const recs = await graph.recommendations(userId, limit);
  let results = recs;
  if (results.length < limit) {
    // top up with popular accounts the user does not follow yet
    const exclude = new Set<string>([userId, ...(await followingIds(userId)), ...results.map((r) => r.userId)]);
    const popular = await User.find({ _id: { $nin: [...exclude].map((i) => new Types.ObjectId(i)) } })
      .sort({ followerCount: -1 })
      .limit(limit - results.length);
    results = [...results, ...popular.map((u) => ({ userId: u.id, mutualCount: 0 }))];
  }
  const users = await User.find({ _id: { $in: results.map((r) => r.userId) } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return results.map((r) => ({ user: byId.get(r.userId)!, mutualCount: r.mutualCount })).filter((r) => r.user);
};
