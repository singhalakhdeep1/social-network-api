/**
 * Backfills: rebuild the Elasticsearch indices and the Neo4j / JanusGraph projections from MongoDB.
 * Run on first deployment of a search / graph backend, or after an outage.
 */
import Post from '../models/Post';
import User from '../models/User';
import Follow from '../models/Follow';
import Like from '../models/Like';
import { esClient, POSTS_INDEX, USERS_INDEX } from '../config/elasticsearch';
import { graph } from './graph/graph.service';
import logger from '../utils/logger';

const BATCH = 500;

export const reindexSearch = async (): Promise<{ posts: number; users: number }> => {
  const es = esClient();
  if (!es) throw new Error('Elasticsearch is not available');
  let posts = 0;
  let users = 0;

  const userNames = new Map<string, string>();
  for await (const u of User.find().cursor({ batchSize: BATCH })) {
    userNames.set(u.id, u.username);
  }

  let ops: unknown[] = [];
  const flush = async (): Promise<void> => {
    if (!ops.length) return;
    const res = await es.bulk({ operations: ops as never, refresh: false });
    if (res.errors) logger.warn('Some documents failed to index during bulk reindex');
    ops = [];
  };

  for await (const u of User.find().cursor({ batchSize: BATCH })) {
    ops.push({ index: { _index: USERS_INDEX, _id: u.id } }, { username: u.username, displayName: u.displayName ?? '', bio: u.bio ?? '', followerCount: u.followerCount, createdAt: u.createdAt });
    users++;
    if (ops.length >= BATCH * 2) await flush();
  }
  for await (const p of Post.find({ isArchived: false }).cursor({ batchSize: BATCH })) {
    ops.push(
      { index: { _index: POSTS_INDEX, _id: p.id } },
      { content: p.content, hashtags: p.hashtags, author: String(p.author), authorUsername: userNames.get(String(p.author)) ?? '', mediaTypes: [...new Set(p.media.map((m) => m.type))], likeCount: p.likeCount, commentCount: p.commentCount, createdAt: p.createdAt, isArchived: false }
    );
    posts++;
    if (ops.length >= BATCH * 2) await flush();
  }
  await flush();
  await es.indices.refresh({ index: [POSTS_INDEX, USERS_INDEX] });
  return { posts, users };
};

export const syncGraph = async (): Promise<{ users: number; follows: number; posts: number; likes: number }> => {
  if (!graph.active) throw new Error(`Graph provider "${graph.providerName}" is not active (set GRAPH_PROVIDER and make sure it is reachable)`);
  const counts = { users: 0, follows: 0, posts: 0, likes: 0 };
  for await (const u of User.find().cursor({ batchSize: BATCH })) {
    await graph.upsertUser({ id: u.id, username: u.username, displayName: u.displayName });
    counts.users++;
  }
  for await (const f of Follow.find().cursor({ batchSize: BATCH })) {
    await graph.follow(String(f.follower), String(f.following));
    counts.follows++;
  }
  for await (const p of Post.find({ isArchived: false }).select('author createdAt').cursor({ batchSize: BATCH })) {
    await graph.upsertPost({ id: p.id, authorId: String(p.author), createdAt: p.createdAt });
    counts.posts++;
  }
  for await (const l of Like.find({ targetType: 'post' }).cursor({ batchSize: BATCH })) {
    await graph.like(String(l.user), String(l.target));
    counts.likes++;
  }
  return counts;
};
