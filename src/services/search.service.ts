/**
 * Search: Elasticsearch when available (fuzzy full-text, engagement boost, autocomplete),
 * otherwise MongoDB text indexes. Results are always re-read from Mongo so visibility
 * (private accounts / private groups / archived) is enforced identically on both paths.
 */
import { HydratedDocument } from 'mongoose';
import Post, { IPost } from '../models/Post';
import User, { IUser } from '../models/User';
import SearchHistory from '../models/SearchHistory';
import SavedSearch from '../models/SavedSearch';
import { esClient, POSTS_INDEX, USERS_INDEX } from '../config/elasticsearch';
import { escapeRegex } from '../middleware/validation';
import { visibilityFilter } from './visibility.service';
import { notFound } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import logger from '../utils/logger';

export interface SearchFilters {
  dateRange?: { start: string; end: string } | null;
  mediaType?: string[] | null;
  hashtags?: string[] | null;
  author?: string | null;
}

// ---------- indexing (fire-and-forget; failures never break a request) ----------

export const indexPost = (post: HydratedDocument<IPost>, authorUsername?: string): void => {
  const es = esClient();
  if (!es) return;
  void es
    .index({
      index: POSTS_INDEX,
      id: post.id,
      document: {
        content: post.content,
        hashtags: post.hashtags,
        author: String(post.author),
        authorUsername: authorUsername ?? '',
        mediaTypes: [...new Set(post.media.map((m) => m.type))],
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt,
        isArchived: post.isArchived
      }
    })
    .catch((e) => logger.debug(`ES index post failed: ${e.message}`));
};

export const removePostFromIndex = (postId: string): void => {
  const es = esClient();
  if (!es) return;
  void es.delete({ index: POSTS_INDEX, id: postId }).catch(() => undefined);
};

export const indexUser = (user: HydratedDocument<IUser>): void => {
  const es = esClient();
  if (!es) return;
  void es
    .index({
      index: USERS_INDEX,
      id: user.id,
      document: { username: user.username, displayName: user.displayName ?? '', bio: user.bio ?? '', followerCount: user.followerCount, createdAt: user.createdAt }
    })
    .catch((e) => logger.debug(`ES index user failed: ${e.message}`));
};

// ---------- queries ----------

const byRank = <T extends { _id: unknown }>(docs: T[], ids: string[]): T[] => {
  const map = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => map.get(id)).filter((d): d is T => !!d);
};

export const searchPosts = async (query: string, filters: SearchFilters | null | undefined, viewerId: string | undefined, limit = 20): Promise<HydratedDocument<IPost>[]> => {
  const visible = await visibilityFilter(viewerId);
  const es = esClient();

  if (es) {
    try {
      const filter: Record<string, unknown>[] = [{ term: { isArchived: false } }];
      if (filters?.dateRange) filter.push({ range: { createdAt: { gte: filters.dateRange.start, lte: filters.dateRange.end } } });
      if (filters?.hashtags?.length) filter.push({ terms: { hashtags: filters.hashtags.map((h) => h.toLowerCase().replace(/^#/, '')) } });
      if (filters?.mediaType?.length) filter.push({ terms: { mediaTypes: filters.mediaType } });
      if (filters?.author) filter.push({ term: { author: filters.author } });
      const res = await es.search({
        index: POSTS_INDEX,
        size: Math.min(limit * 3, 100),
        query: {
          function_score: {
            query: { bool: { must: [{ multi_match: { query, fields: ['content^3', 'hashtags^5', 'authorUsername'], fuzziness: 'AUTO' } }], filter } },
            functions: [{ field_value_factor: { field: 'likeCount', modifier: 'log1p', missing: 0 } }],
            boost_mode: 'sum'
          }
        }
      });
      const ids = res.hits.hits.map((h) => String(h._id));
      const docs = await Post.find({ _id: { $in: ids }, ...visible });
      return byRank(docs, ids).slice(0, limit);
    } catch (err) {
      logger.warn(`ES post search failed, using Mongo: ${(err as Error).message}`);
    }
  }

  const mongoFilter: Record<string, unknown> = { ...visible, isArchived: false, $text: { $search: query } };
  if (filters?.dateRange) mongoFilter.createdAt = { $gte: new Date(filters.dateRange.start), $lte: new Date(filters.dateRange.end) };
  if (filters?.hashtags?.length) mongoFilter.hashtags = { $in: filters.hashtags.map((h) => h.toLowerCase().replace(/^#/, '')) };
  if (filters?.mediaType?.length) mongoFilter['media.type'] = { $in: filters.mediaType };
  if (filters?.author) mongoFilter.$and = [{ author: toObjectId(filters.author) }]; // $and so the visibility `author` clause survives
  const found = await Post.find(mongoFilter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(limit);
  if (found.length) return found;
  // Text search ignores partial words; fall back to a plain substring match.
  delete mongoFilter.$text;
  mongoFilter.content = { $regex: escapeRegex(query), $options: 'i' };
  return Post.find(mongoFilter).sort({ createdAt: -1 }).limit(limit);
};

export const searchUsers = async (query: string, limit = 20): Promise<HydratedDocument<IUser>[]> => {
  const es = esClient();
  if (es) {
    try {
      const res = await es.search({
        index: USERS_INDEX,
        size: limit,
        query: {
          bool: {
            should: [
              { multi_match: { query, type: 'bool_prefix', fields: ['username', 'username._2gram', 'username._3gram'] } },
              { multi_match: { query, fields: ['displayName^2', 'bio'], fuzziness: 'AUTO' } }
            ],
            minimum_should_match: 1
          }
        }
      });
      const ids = res.hits.hits.map((h) => String(h._id));
      return byRank(await User.find({ _id: { $in: ids } }), ids);
    } catch (err) {
      logger.warn(`ES user search failed, using Mongo: ${(err as Error).message}`);
    }
  }
  const safe = escapeRegex(query.trim().toLowerCase());
  const prefix = await User.find({ $or: [{ username: { $regex: `^${safe}` } }, { displayName: { $regex: safe, $options: 'i' } }] })
    .sort({ followerCount: -1 })
    .limit(limit);
  if (prefix.length >= limit) return prefix;
  const seen = new Set(prefix.map((u) => u.id));
  const text = await User.find({ $text: { $search: query }, _id: { $nin: [...seen] } }).limit(limit - prefix.length);
  return [...prefix, ...text];
};

export const autocomplete = async (query: string, limit = 10): Promise<string[]> => {
  const q = query.trim().replace(/^[@#]/, '');
  if (!q) return [];
  const es = esClient();
  if (es) {
    try {
      const res = await es.search({
        index: USERS_INDEX,
        size: limit,
        query: { multi_match: { query: q, type: 'bool_prefix', fields: ['username', 'username._2gram', 'username._3gram'] } },
        _source: ['username']
      });
      const names = res.hits.hits.map((h) => (h._source as { username: string }).username);
      if (names.length >= limit) return names;
    } catch {
      /* fall through */
    }
  }
  const safe = escapeRegex(q.toLowerCase());
  const [users, tags] = await Promise.all([
    User.find({ username: { $regex: `^${safe}` } }).sort({ followerCount: -1 }).limit(limit).select('username'),
    Post.aggregate<{ _id: string }>([
      { $match: { hashtags: { $regex: `^${safe}` } } },
      { $unwind: '$hashtags' },
      { $match: { hashtags: { $regex: `^${safe}` } } },
      { $group: { _id: '$hashtags', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: limit }
    ])
  ]);
  return [...users.map((u) => u.username), ...tags.map((t) => `#${t._id}`)].slice(0, limit);
};

// ---------- history & saved searches ----------

export const recordSearch = async (userId: string, query: string): Promise<void> => {
  const q = query.trim().slice(0, 200);
  if (!q) return;
  await SearchHistory.updateOne({ user: userId, query: q }, { $set: { searchedAt: new Date() } }, { upsert: true });
};

export const listHistory = (userId: string, limit = 20) => SearchHistory.find({ user: userId }).sort({ searchedAt: -1 }).limit(Math.min(limit, 100)).exec();
export const clearHistory = async (userId: string): Promise<boolean> => {
  await SearchHistory.deleteMany({ user: userId });
  return true;
};

export const createSavedSearch = (userId: string, input: { query: string; name?: string | null; filters?: SearchFilters | null }) =>
  SavedSearch.create({
    user: userId,
    query: input.query,
    name: input.name ?? undefined,
    filters: {
      dateRange: input.filters?.dateRange ? { start: new Date(input.filters.dateRange.start), end: new Date(input.filters.dateRange.end) } : undefined,
      mediaType: input.filters?.mediaType ?? [],
      hashtags: input.filters?.hashtags ?? []
    }
  });

export const deleteSavedSearch = async (userId: string, id: string): Promise<boolean> => {
  const res = await SavedSearch.deleteOne({ _id: id, user: userId });
  if (res.deletedCount === 0) throw notFound('Saved search');
  return true;
};

export const listSavedSearches = (userId: string) => SavedSearch.find({ user: userId }).sort({ createdAt: -1 }).exec();
