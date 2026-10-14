/**
 * Neo4j projection of the social graph (Cypher). Every write is a MERGE so replays and the
 * `graph:sync` backfill are idempotent.
 */
import neo4j, { Driver, Session } from 'neo4j-driver';
import { env } from '../../config/env';
import { GraphPath, GraphPostNode, GraphProvider, GraphRecommendation, GraphUserNode } from './graph.types';

export class Neo4jGraphProvider implements GraphProvider {
  readonly name = 'neo4j' as const;
  private driver: Driver | null = null;

  async init(): Promise<void> {
    this.driver = neo4j.driver(env.neo4jUri, neo4j.auth.basic(env.neo4jUser, env.neo4jPassword), { maxConnectionLifetime: 30 * 60 * 1000 });
    await this.driver.verifyConnectivity();
    await this.run('CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE');
    await this.run('CREATE CONSTRAINT post_id IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE');
  }

  async close(): Promise<void> {
    await this.driver?.close();
    this.driver = null;
  }

  async healthy(): Promise<boolean> {
    try {
      await this.driver?.verifyConnectivity();
      return !!this.driver;
    } catch {
      return false;
    }
  }

  private async run<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.driver) throw new Error('Neo4j driver not initialised');
    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject() as T);
    } finally {
      await session.close();
    }
  }

  async upsertUser(user: GraphUserNode): Promise<void> {
    await this.run('MERGE (u:User {id: $id}) SET u.username = $username, u.displayName = $displayName, u.updatedAt = datetime()', {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? ''
    });
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    await this.run(
      'MERGE (a:User {id: $a}) MERGE (b:User {id: $b}) MERGE (a)-[r:FOLLOWS]->(b) ON CREATE SET r.createdAt = datetime()',
      { a: followerId, b: followingId }
    );
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.run('MATCH (:User {id: $a})-[r:FOLLOWS]->(:User {id: $b}) DELETE r', { a: followerId, b: followingId });
  }

  async upsertPost(post: GraphPostNode): Promise<void> {
    await this.run(
      'MERGE (u:User {id: $authorId}) MERGE (p:Post {id: $id}) SET p.createdAt = datetime($createdAt) MERGE (u)-[:AUTHORED]->(p)',
      { id: post.id, authorId: post.authorId, createdAt: post.createdAt.toISOString() }
    );
  }

  async removePost(postId: string): Promise<void> {
    await this.run('MATCH (p:Post {id: $id}) DETACH DELETE p', { id: postId });
  }

  async like(userId: string, postId: string): Promise<void> {
    await this.run('MERGE (u:User {id: $u}) MERGE (p:Post {id: $p}) MERGE (u)-[r:LIKES]->(p) ON CREATE SET r.createdAt = datetime()', { u: userId, p: postId });
  }

  async unlike(userId: string, postId: string): Promise<void> {
    await this.run('MATCH (:User {id: $u})-[r:LIKES]->(:Post {id: $p}) DELETE r', { u: userId, p: postId });
  }

  async shortestPath(fromId: string, toId: string, maxDepth = 6): Promise<GraphPath | null> {
    if (fromId === toId) return { userIds: [fromId], distance: 0 };
    const depth = Math.max(1, Math.min(Math.floor(maxDepth), 10));
    const rows = await this.run<{ ids: string[] }>(
      `MATCH (a:User {id: $from}), (b:User {id: $to}), p = shortestPath((a)-[:FOLLOWS*..${depth}]->(b)) RETURN [n IN nodes(p) | n.id] AS ids`,
      { from: fromId, to: toId }
    );
    if (!rows.length) return null;
    return { userIds: rows[0].ids, distance: rows[0].ids.length - 1 };
  }

  async mutualConnections(a: string, b: string, limit = 50): Promise<string[]> {
    const rows = await this.run<{ id: string }>(
      'MATCH (:User {id: $a})-[:FOLLOWS]->(m:User)<-[:FOLLOWS]-(:User {id: $b}) RETURN DISTINCT m.id AS id LIMIT $limit',
      { a, b, limit: neo4j.int(limit) }
    );
    return rows.map((r) => r.id);
  }

  async recommendations(userId: string, limit = 10): Promise<GraphRecommendation[]> {
    const rows = await this.run<{ id: string; mutual: { toNumber(): number } | number }>(
      `MATCH (me:User {id: $id})-[:FOLLOWS]->(:User)-[:FOLLOWS]->(s:User)
       WHERE s.id <> $id AND NOT (me)-[:FOLLOWS]->(s)
       RETURN s.id AS id, count(*) AS mutual ORDER BY mutual DESC, id ASC LIMIT $limit`,
      { id: userId, limit: neo4j.int(limit) }
    );
    return rows.map((r) => ({ userId: r.id, mutualCount: typeof r.mutual === 'number' ? r.mutual : r.mutual.toNumber() }));
  }
}
