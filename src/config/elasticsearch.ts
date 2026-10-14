/**
 * Elasticsearch client and index definitions. Elasticsearch is optional: when ELASTICSEARCH_URL
 * is empty or the cluster is unreachable, SearchService transparently uses MongoDB text search.
 */
import { Client } from '@elastic/elasticsearch';
import { env } from './env';
import logger from '../utils/logger';

export const POSTS_INDEX = 'sn-posts';
export const USERS_INDEX = 'sn-users';

let client: Client | null = null;
let available = false;
let healthTimer: NodeJS.Timeout | undefined;

const postMapping = {
  properties: {
    content: { type: 'text' },
    hashtags: { type: 'keyword' },
    author: { type: 'keyword' },
    authorUsername: { type: 'keyword' },
    mediaTypes: { type: 'keyword' },
    likeCount: { type: 'integer' },
    commentCount: { type: 'integer' },
    createdAt: { type: 'date' },
    isArchived: { type: 'boolean' }
  }
} as const;

const userMapping = {
  properties: {
    username: { type: 'search_as_you_type' },
    displayName: { type: 'text' },
    bio: { type: 'text' },
    followerCount: { type: 'integer' },
    createdAt: { type: 'date' }
  }
} as const;

export const esClient = (): Client | null => (available ? client : null);
export const esEnabled = (): boolean => available;

const ensureIndex = async (index: string, mappings: Record<string, unknown>): Promise<void> => {
  const exists = await client!.indices.exists({ index });
  if (!exists) await client!.indices.create({ index, mappings: mappings as never });
};

export const initElasticsearch = async (): Promise<boolean> => {
  if (!env.elasticsearchUrl) {
    logger.info('Search: ELASTICSEARCH_URL not set, using MongoDB text search');
    return false;
  }
  client = new Client({
    node: env.elasticsearchUrl,
    auth: env.elasticsearchUsername ? { username: env.elasticsearchUsername, password: env.elasticsearchPassword } : undefined,
    maxRetries: 2,
    requestTimeout: 8000
  });
  const connect = async (): Promise<boolean> => {
    try {
      await client!.ping();
      await ensureIndex(POSTS_INDEX, postMapping);
      await ensureIndex(USERS_INDEX, userMapping);
      return true;
    } catch (err) {
      logger.warn(`Elasticsearch unavailable (${(err as Error).message}); using MongoDB text search`);
      return false;
    }
  };
  available = await connect();
  if (available) logger.info('Elasticsearch connected');
  healthTimer = setInterval(async () => {
    const was = available;
    available = await client!.ping().then(() => true).catch(() => false);
    if (available && !was) {
      await connect();
      logger.info('Elasticsearch reconnected');
    }
  }, 30_000);
  healthTimer.unref();
  return available;
};

export const closeElasticsearch = async (): Promise<void> => {
  if (healthTimer) clearInterval(healthTimer);
  await client?.close();
  client = null;
  available = false;
};
