/**
 * Graph facade. Reads go to the configured provider (Neo4j / JanusGraph) and fall back to the
 * Mongo provider if it is down; writes are mirrored best-effort (`npm run graph:sync` reconciles).
 */
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { GraphPath, GraphPostNode, GraphProvider, GraphRecommendation, GraphUserNode } from './graph.types';
import { MongoGraphProvider } from './mongo.provider';
import { Neo4jGraphProvider } from './neo4j.provider';
import { JanusGraphProvider } from './janusgraph.provider';

class GraphService {
  private readonly mongo = new MongoGraphProvider();
  private primary: GraphProvider = this.mongo;
  private primaryUp = true;
  private health?: NodeJS.Timeout;

  get providerName(): string {
    return this.primary.name;
  }

  get active(): boolean {
    return this.primary.name !== 'mongo' && this.primaryUp;
  }

  async init(): Promise<void> {
    const wanted: GraphProvider | null =
      env.graphProvider === 'neo4j' ? new Neo4jGraphProvider() : env.graphProvider === 'janusgraph' ? new JanusGraphProvider() : null;
    if (!wanted) {
      logger.info('Graph: using MongoDB provider');
      return;
    }
    this.primary = wanted;
    try {
      await wanted.init();
      this.primaryUp = true;
      logger.info(`Graph: ${wanted.name} connected`);
    } catch (err) {
      this.primaryUp = false;
      logger.warn(`Graph: ${wanted.name} unavailable (${(err as Error).message}); falling back to MongoDB provider`);
    }
    this.health = setInterval(async () => {
      const ok = await this.primary.healthy().catch(() => false);
      if (ok !== this.primaryUp) {
        this.primaryUp = ok;
        logger.warn(`Graph: ${this.primary.name} is now ${ok ? 'reachable' : 'unreachable'}`);
      }
    }, 30_000);
    this.health.unref();
  }

  async close(): Promise<void> {
    if (this.health) clearInterval(this.health);
    await this.primary.close().catch(() => undefined);
  }

  private async write(label: string, op: (p: GraphProvider) => Promise<void>): Promise<void> {
    if (!this.active) return;
    try {
      await op(this.primary);
    } catch (err) {
      logger.warn(`Graph write "${label}" failed on ${this.primary.name}: ${(err as Error).message}`);
    }
  }

  private async read<T>(label: string, op: (p: GraphProvider) => Promise<T>): Promise<T> {
    if (this.active) {
      try {
        return await op(this.primary);
      } catch (err) {
        logger.warn(`Graph read "${label}" failed on ${this.primary.name}, using Mongo: ${(err as Error).message}`);
      }
    }
    return op(this.mongo);
  }

  upsertUser = (u: GraphUserNode) => this.write('upsertUser', (p) => p.upsertUser(u));
  follow = (a: string, b: string) => this.write('follow', (p) => p.follow(a, b));
  unfollow = (a: string, b: string) => this.write('unfollow', (p) => p.unfollow(a, b));
  upsertPost = (post: GraphPostNode) => this.write('upsertPost', (p) => p.upsertPost(post));
  removePost = (id: string) => this.write('removePost', (p) => p.removePost(id));
  like = (u: string, post: string) => this.write('like', (p) => p.like(u, post));
  unlike = (u: string, post: string) => this.write('unlike', (p) => p.unlike(u, post));

  shortestPath = (from: string, to: string, maxDepth?: number): Promise<GraphPath | null> => this.read('shortestPath', (p) => p.shortestPath(from, to, maxDepth));
  mutualConnections = (a: string, b: string, limit?: number): Promise<string[]> => this.read('mutualConnections', (p) => p.mutualConnections(a, b, limit));
  recommendations = (userId: string, limit?: number): Promise<GraphRecommendation[]> => this.read('recommendations', (p) => p.recommendations(userId, limit));

  /** Direct access to the configured provider for the backfill script. */
  get provider(): GraphProvider {
    return this.primary;
  }
}

export const graph = new GraphService();
