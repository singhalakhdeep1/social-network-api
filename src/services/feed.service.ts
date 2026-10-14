/**
 * Personalised feed.
 *
 *  candidates : posts from people you follow, groups you joined and pages you follow (last 7 days);
 *               topped up with trending posts when the network is quiet.
 *  score      : recency decay (≈8h half-life) + log-damped engagement + affinity for authors you like
 *  ordering   : score descending, then a diversity pass so one author never fills the screen
 *  paging     : the ranked id list is cached per user (60 s) and paged by offset cursor, so scrolling
 *               never reshuffles and Mongo is hit once per refresh, not once per page.
 */
import { HydratedDocument } from 'mongoose';
import Post, { IPost } from '../models/Post';
import Like from '../models/Like';
import Group from '../models/Group';
import Page from '../models/Page';
import { followingIds } from './follow.service';
import { visibilityFilter } from './visibility.service';
import { trendingPosts } from './post.service';
import { cache } from './cache/cache.service';
import { badInput } from '../utils/errors';
import { clampLimit } from '../utils/pagination';
import logger from '../utils/logger';

export interface FeedItem {
  post: HydratedDocument<IPost>;
  score: number;
  reason: string;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface Ranked {
  id: string;
  score: number;
  reason: string;
}

const HALF_LIFE_HOURS = 8;
const WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_CANDIDATES = 400;

const encodeOffset = (n: number): string => Buffer.from(`o:${n}`).toString('base64url');
const decodeOffset = (cursor?: string | null): number => {
  if (!cursor) return 0;
  const m = /^o:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!m) throw badInput('Invalid cursor');
  return Number(m[1]);
};

export const scorePost = (post: { createdAt: Date; likeCount: number; commentCount: number; sharesCount: number; reactionCount: number }, affinity: number, now = Date.now()): number => {
  const ageHours = Math.max(0, (now - post.createdAt.getTime()) / 3.6e6);
  const recency = 100 * Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
  const engagement = 10 * Math.log1p(post.likeCount + post.commentCount * 2 + post.sharesCount * 3 + post.reactionCount);
  return recency + engagement + Math.min(affinity, 10) * 2;
};

const reasonFor = (p: IPost, viewerId: string, affinity: number, source: string, score: number): string => {
  if (source === 'trending') return 'Trending';
  if (source === 'group') return 'From a group you joined';
  if (source === 'page') return 'From a page you follow';
  if (p.author.toString() === viewerId) return 'Your post';
  if (affinity >= 3) return 'You interact with this author often';
  if (p.likeCount + p.commentCount * 2 >= 15) return 'High engagement';
  return score > 90 ? 'Recent post' : 'From someone you follow';
};

async function buildRanking(viewerId: string): Promise<Ranked[]> {
  const [following, groups, pages, visible] = await Promise.all([
    followingIds(viewerId),
    Group.find({ members: viewerId }).distinct('_id'),
    Page.find({ followers: viewerId }).distinct('_id'),
    visibilityFilter(viewerId)
  ]);
  const since = new Date(Date.now() - WINDOW_MS);
  const candidates = await Post.find({
    $and: [visible, { createdAt: { $gte: since } }, { $or: [{ author: { $in: [...following, viewerId] } }, { group: { $in: groups } }, { page: { $in: pages } }] }]
  })
    .sort({ _id: -1 })
    .limit(MAX_CANDIDATES);

  // affinity: how often the viewer liked each author's posts recently
  const myLikes = await Like.find({ user: viewerId, targetType: 'post' }).sort({ _id: -1 }).limit(500).select('target').lean();
  const likedPosts = await Post.find({ _id: { $in: myLikes.map((l) => l.target) } }).select('author').lean();
  const affinity = new Map<string, number>();
  for (const p of likedPosts) affinity.set(String(p.author), (affinity.get(String(p.author)) ?? 0) + 1);

  const groupSet = new Set(groups.map(String));
  const pageSet = new Set(pages.map(String));
  const followSet = new Set(following);
  const now = Date.now();
  const seen = new Set<string>();
  const ranked: Ranked[] = [];

  for (const p of candidates) {
    const aff = affinity.get(p.author.toString()) ?? 0;
    const score = scorePost(p, aff, now);
    const source = followSet.has(p.author.toString()) || p.author.toString() === viewerId ? 'follow' : p.group && groupSet.has(p.group.toString()) ? 'group' : p.page && pageSet.has(p.page.toString()) ? 'page' : 'follow';
    ranked.push({ id: p.id, score, reason: reasonFor(p, viewerId, aff, source, score) });
    seen.add(p.id);
  }

  if (ranked.length < 20) {
    const trending = await trendingPosts(viewerId, 20);
    for (const p of trending) {
      if (seen.has(p.id) || p.author.toString() === viewerId) continue;
      ranked.push({ id: p.id, score: scorePost(p, 0, now) * 0.6, reason: 'Trending' });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return diversify(ranked, new Map(candidates.map((p) => [p.id, p.author.toString()])));
}

/** Greedy pass: never place more than 2 consecutive posts from the same author while others remain. */
function diversify(ranked: Ranked[], authorOf: Map<string, string>): Ranked[] {
  const out: Ranked[] = [];
  const pool = [...ranked];
  while (pool.length) {
    const tail = out.slice(-2).map((r) => authorOf.get(r.id));
    const blocked = tail.length === 2 && tail[0] && tail[0] === tail[1] ? tail[0] : undefined;
    let idx = blocked ? pool.findIndex((r) => authorOf.get(r.id) !== blocked) : 0;
    if (idx === -1) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export const getFeed = async (viewerId: string, opts: { cursor?: string | null; limit?: number | null; refresh?: boolean | null }): Promise<FeedPage> => {
  const key = `feed:${viewerId}`;
  const offset = decodeOffset(opts.cursor);
  const limit = clampLimit(opts.limit, 20, 50);

  let ranking = opts.refresh && offset === 0 ? null : await cache.getJSON<Ranked[]>(key);
  if (!ranking) {
    ranking = await buildRanking(viewerId);
    await cache.setJSON(key, ranking, 60);
    logger.debug(`feed rebuilt for ${viewerId}: ${ranking.length} candidates`);
  }

  const slice = ranking.slice(offset, offset + limit);
  const posts = await Post.find({ _id: { $in: slice.map((r) => r.id) } });
  const byId = new Map(posts.map((p) => [p.id, p]));
  const items: FeedItem[] = slice.flatMap((r) => {
    const post = byId.get(r.id);
    return post && !post.isArchived ? [{ post, score: Math.round(r.score * 100) / 100, reason: r.reason }] : [];
  });
  const hasMore = offset + limit < ranking.length;
  return { items, hasMore, nextCursor: hasMore ? encodeOffset(offset + limit) : null };
};
