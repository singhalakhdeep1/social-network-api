/**
 * Graph provider backed by the Follow collection. Used by default and as the fallback
 * when Neo4j / JanusGraph are not configured or unreachable.
 */
import { Types } from 'mongoose';
import Follow from '../../models/Follow';
import { GraphPath, GraphProvider, GraphRecommendation } from './graph.types';

const MAX_VISITED = 5000;

export class MongoGraphProvider implements GraphProvider {
  readonly name = 'mongo' as const;

  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async healthy(): Promise<boolean> {
    return true;
  }

  // Writes are no-ops: the Follow / Like collections are already the data.
  async upsertUser(): Promise<void> {}
  async follow(): Promise<void> {}
  async unfollow(): Promise<void> {}
  async upsertPost(): Promise<void> {}
  async removePost(): Promise<void> {}
  async like(): Promise<void> {}
  async unlike(): Promise<void> {}

  async shortestPath(fromId: string, toId: string, maxDepth = 6): Promise<GraphPath | null> {
    if (fromId === toId) return { userIds: [fromId], distance: 0 };
    const parent = new Map<string, string>([[fromId, '']]);
    let frontier = [fromId];
    for (let depth = 1; depth <= maxDepth && frontier.length && parent.size < MAX_VISITED; depth++) {
      const edges = await Follow.find({ follower: { $in: frontier.map((i) => new Types.ObjectId(i)) } })
        .select('follower following')
        .lean();
      const next: string[] = [];
      for (const edge of edges) {
        const from = String(edge.follower);
        const to = String(edge.following);
        if (parent.has(to)) continue;
        parent.set(to, from);
        if (to === toId) {
          const path = [to];
          let cur = from;
          while (cur) {
            path.unshift(cur);
            cur = parent.get(cur) ?? '';
          }
          return { userIds: path, distance: path.length - 1 };
        }
        next.push(to);
      }
      frontier = next;
    }
    return null;
  }

  async mutualConnections(a: string, b: string, limit = 50): Promise<string[]> {
    const aFollows = await Follow.find({ follower: a }).distinct('following');
    if (!aFollows.length) return [];
    const common = await Follow.find({ follower: b, following: { $in: aFollows } })
      .limit(limit)
      .select('following')
      .lean();
    return common.map((f) => String(f.following));
  }

  async recommendations(userId: string, limit = 10): Promise<GraphRecommendation[]> {
    const following = (await Follow.find({ follower: userId }).sort({ createdAt: -1 }).limit(500).select('following').lean()).map((f) => f.following);
    if (!following.length) return [];
    const exclude = [...following, new Types.ObjectId(userId)];
    const rows = await Follow.aggregate<{ _id: Types.ObjectId; mutualCount: number }>([
      { $match: { follower: { $in: following }, following: { $nin: exclude } } },
      { $group: { _id: '$following', mutualCount: { $sum: 1 } } },
      { $sort: { mutualCount: -1, _id: 1 } },
      { $limit: limit }
    ]);
    return rows.map((r) => ({ userId: String(r._id), mutualCount: r.mutualCount }));
  }
}
