/**
 * JanusGraph projection of the social graph (Gremlin over WebSocket).
 * Writes use the fold()/coalesce() upsert idiom so replays are idempotent.
 */
import gremlin from 'gremlin';
import { env } from '../../config/env';
import { GraphPath, GraphPostNode, GraphProvider, GraphRecommendation, GraphUserNode } from './graph.types';

const { traversal } = gremlin.process.AnonymousTraversalSource;
const __ = gremlin.process.statics;
const { P, order, t } = gremlin.process;

type Traversal = ReturnType<ReturnType<typeof traversal>['withRemote']>;

export class JanusGraphProvider implements GraphProvider {
  readonly name = 'janusgraph' as const;
  private connection: InstanceType<typeof gremlin.driver.DriverRemoteConnection> | null = null;
  private g: Traversal | null = null;

  async init(): Promise<void> {
    this.connection = new gremlin.driver.DriverRemoteConnection(env.janusgraphUrl, { mimeType: 'application/vnd.gremlin-v3.0+json' });
    this.g = traversal().withRemote(this.connection);
    await this.g.V().limit(1).toList(); // fails fast when the server is unreachable
  }

  async close(): Promise<void> {
    await this.connection?.close();
    this.connection = null;
    this.g = null;
  }

  async healthy(): Promise<boolean> {
    try {
      await this.src().V().limit(1).toList();
      return true;
    } catch {
      return false;
    }
  }

  private src(): Traversal {
    if (!this.g) throw new Error('JanusGraph not initialised');
    return this.g;
  }

  private async ensureUser(id: string): Promise<void> {
    await this.src()
      .V()
      .has('User', 'id', id)
      .fold()
      .coalesce(__.unfold(), __.addV('User').property('id', id))
      .next();
  }

  async upsertUser(user: GraphUserNode): Promise<void> {
    await this.ensureUser(user.id);
    await this.src().V().has('User', 'id', user.id).property('username', user.username).property('displayName', user.displayName ?? '').next();
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    await this.ensureUser(followerId);
    await this.ensureUser(followingId);
    await this.src()
      .V()
      .has('User', 'id', followerId)
      .as('a')
      .V()
      .has('User', 'id', followingId)
      .coalesce(__.inE('FOLLOWS').where(__.outV().as('a')), __.addE('FOLLOWS').from_('a'))
      .next();
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.src().V().has('User', 'id', followerId).outE('FOLLOWS').where(__.inV().has('User', 'id', followingId)).drop().iterate();
  }

  async upsertPost(post: GraphPostNode): Promise<void> {
    await this.ensureUser(post.authorId);
    await this.src()
      .V()
      .has('Post', 'id', post.id)
      .fold()
      .coalesce(__.unfold(), __.addV('Post').property('id', post.id).property('createdAt', post.createdAt.toISOString()))
      .next();
    await this.src()
      .V()
      .has('User', 'id', post.authorId)
      .as('u')
      .V()
      .has('Post', 'id', post.id)
      .coalesce(__.inE('AUTHORED').where(__.outV().as('u')), __.addE('AUTHORED').from_('u'))
      .next();
  }

  async removePost(postId: string): Promise<void> {
    await this.src().V().has('Post', 'id', postId).drop().iterate();
  }

  async like(userId: string, postId: string): Promise<void> {
    await this.ensureUser(userId);
    await this.src().V().has('Post', 'id', postId).fold().coalesce(__.unfold(), __.addV('Post').property('id', postId)).next();
    await this.src()
      .V()
      .has('User', 'id', userId)
      .as('u')
      .V()
      .has('Post', 'id', postId)
      .coalesce(__.inE('LIKES').where(__.outV().as('u')), __.addE('LIKES').from_('u'))
      .next();
  }

  async unlike(userId: string, postId: string): Promise<void> {
    await this.src().V().has('User', 'id', userId).outE('LIKES').where(__.inV().has('Post', 'id', postId)).drop().iterate();
  }

  async shortestPath(fromId: string, toId: string, maxDepth = 6): Promise<GraphPath | null> {
    if (fromId === toId) return { userIds: [fromId], distance: 0 };
    const paths = await this.src()
      .V()
      .has('User', 'id', fromId)
      .repeat(__.out('FOLLOWS').simplePath())
      .until(__.has('User', 'id', toId).or().loops().is(P.gte(maxDepth)))
      .has('User', 'id', toId)
      .path()
      .by('id')
      .limit(1)
      .toList();
    if (!paths.length) return null;
    const ids = (paths[0] as unknown as { objects: string[] }).objects ?? (paths[0] as unknown as string[]);
    return { userIds: ids, distance: ids.length - 1 };
  }

  async mutualConnections(a: string, b: string, limit = 50): Promise<string[]> {
    const ids = await this.src()
      .V()
      .has('User', 'id', a)
      .out('FOLLOWS')
      .where(__.in_('FOLLOWS').has('User', 'id', b))
      .dedup()
      .limit(limit)
      .values('id')
      .toList();
    return ids as string[];
  }

  async recommendations(userId: string, limit = 10): Promise<GraphRecommendation[]> {
    const grouped = await this.src()
      .V()
      .has('User', 'id', userId)
      .as('me')
      .out('FOLLOWS')
      .out('FOLLOWS')
      .where(P.neq('me'))
      .where(__.not(__.in_('FOLLOWS').where(P.eq('me'))))
      .groupCount()
      .by('id')
      .unfold()
      .order()
      .by(__.select(t.values), order.desc)
      .limit(limit)
      .toList();
    return (grouped as unknown as Map<string, number>[]).map((entry) => {
      const [key, value] = entry instanceof Map ? [...entry.entries()][0] : [(entry as never)['key'], (entry as never)['value']];
      return { userId: String(key), mutualCount: Number(value) };
    });
  }
}
