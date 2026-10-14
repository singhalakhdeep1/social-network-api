/**
 * Per-request DataLoaders. One instance per GraphQL operation, so lookups made by sibling
 * fields are batched into a single query (this is the N+1 fix) and cached for the request.
 */
import DataLoader from 'dataloader';
import { Model, Types } from 'mongoose';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';
import Story from '../models/Story';
import Group from '../models/Group';
import Page from '../models/Page';
import Event from '../models/Event';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Like from '../models/Like';
import Reaction from '../models/Reaction';
import Follow from '../models/Follow';
import Poll from '../models/Poll';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byId = <T = any>(model: Model<any>): DataLoader<string, T | null> =>
  new DataLoader<string, T | null>(async (ids) => {
    const docs = await model.find({ _id: { $in: ids.filter((i) => Types.ObjectId.isValid(i)) } });
    const map = new Map(docs.map((d) => [String(d._id), d as unknown as T]));
    return ids.map((id) => map.get(id) ?? null);
  });

const oids = (ids: readonly string[]): Types.ObjectId[] => ids.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i));

export interface ReactionCount {
  emoji: string;
  count: number;
}

export const createLoaders = (viewerId?: string) => ({
  user: byId(User),
  post: byId(Post),
  comment: byId(Comment),
  story: byId(Story),
  group: byId(Group),
  page: byId(Page),
  event: byId(Event),
  conversation: byId(Conversation),
  message: byId(Message),

  /** Did the viewer like this post? Keyed by post id. */
  postLiked: new DataLoader<string, boolean>(async (ids) => {
    if (!viewerId) return ids.map(() => false);
    const likes = await Like.find({ user: viewerId, targetType: 'post', target: { $in: oids(ids) } }).select('target');
    const liked = new Set(likes.map((l) => String(l.target)));
    return ids.map((id) => liked.has(id));
  }),

  commentLiked: new DataLoader<string, boolean>(async (ids) => {
    if (!viewerId) return ids.map(() => false);
    const likes = await Like.find({ user: viewerId, targetType: 'comment', target: { $in: oids(ids) } }).select('target');
    const liked = new Set(likes.map((l) => String(l.target)));
    return ids.map((id) => liked.has(id));
  }),

  /** Keys are `p:<postId>` or `c:<commentId>`; values are the viewer's emoji or null. */
  myReaction: new DataLoader<string, string | null>(async (keys) => {
    if (!viewerId) return keys.map(() => null);
    const posts = oids(keys.filter((k) => k.startsWith('p:')).map((k) => k.slice(2)));
    const comments = oids(keys.filter((k) => k.startsWith('c:')).map((k) => k.slice(2)));
    const rows = await Reaction.find({ user: viewerId, $or: [{ post: { $in: posts }, comment: null }, { comment: { $in: comments } }] });
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.comment ? `c:${r.comment}` : `p:${r.post}`, r.emoji);
    return keys.map((k) => map.get(k) ?? null);
  }),

  /** Emoji histogram per post / comment. */
  reactionSummary: new DataLoader<string, ReactionCount[]>(async (keys) => {
    const posts = oids(keys.filter((k) => k.startsWith('p:')).map((k) => k.slice(2)));
    const comments = oids(keys.filter((k) => k.startsWith('c:')).map((k) => k.slice(2)));
    const rows = await Reaction.aggregate<{ _id: { post: Types.ObjectId; comment: Types.ObjectId | null; emoji: string }; count: number }>([
      { $match: { $or: [{ post: { $in: posts }, comment: null }, { comment: { $in: comments } }] } },
      { $group: { _id: { post: '$post', comment: '$comment', emoji: '$emoji' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const map = new Map<string, ReactionCount[]>();
    for (const r of rows) {
      const key = r._id.comment ? `c:${r._id.comment}` : `p:${r._id.post}`;
      map.set(key, [...(map.get(key) ?? []), { emoji: r._id.emoji, count: r.count }]);
    }
    return keys.map((k) => map.get(k) ?? []);
  }),

  isFollowing: new DataLoader<string, boolean>(async (ids) => {
    if (!viewerId) return ids.map(() => false);
    const edges = await Follow.find({ follower: viewerId, following: { $in: oids(ids) } }).select('following');
    const set = new Set(edges.map((e) => String(e.following)));
    return ids.map((id) => set.has(id));
  }),

  isFollowedBy: new DataLoader<string, boolean>(async (ids) => {
    if (!viewerId) return ids.map(() => false);
    const edges = await Follow.find({ following: viewerId, follower: { $in: oids(ids) } }).select('follower');
    const set = new Set(edges.map((e) => String(e.follower)));
    return ids.map((id) => set.has(id));
  }),

  pollForPost: new DataLoader<string, InstanceType<typeof Poll> | null>(async (ids) => {
    const polls = await Poll.find({ post: { $in: oids(ids) } });
    const map = new Map(polls.map((p) => [String(p.post), p]));
    return ids.map((id) => map.get(id) ?? null);
  })
});

export type Loaders = ReturnType<typeof createLoaders>;
