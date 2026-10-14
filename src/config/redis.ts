/**
 * Redis connection (ioredis). Redis is optional: when it is unreachable the cache,
 * rate limiter and pub/sub fall back to in-process implementations, so the API
 * still runs on a laptop with only MongoDB.
 */
import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';
import logger from '../utils/logger';

let client: Redis | null = null;
let ready = false;

const baseOptions = (): RedisOptions => ({
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  retryStrategy: (times) => Math.min(times * 500, 10000)
});

export const createRedisConnection = (extra: RedisOptions = {}): Redis => {
  const options = { ...baseOptions(), ...extra };
  return env.redisUrl
    ? new Redis(env.redisUrl, options)
    : new Redis({ host: env.redisHost, port: env.redisPort, ...options });
};

/** Connects once at boot; resolves to the client when ready, or null if Redis is down. */
export const initRedis = async (): Promise<Redis | null> => {
  if (client) return ready ? client : null;
  client = createRedisConnection();
  let warned = false;
  client.on('ready', () => {
    ready = true;
    logger.info('Redis connected');
  });
  client.on('close', () => {
    ready = false;
  });
  client.on('error', (err) => {
    if (!warned) {
      logger.warn(`Redis unavailable (${err.message}); using in-memory cache/rate-limit/pubsub fallbacks`);
      warned = true;
    }
  });
  try {
    await client.connect();
  } catch {
    /* handled by the error listener; reconnect keeps trying in the background */
  }
  return ready ? client : null;
};

/** Returns the live client, or null when Redis is not currently connected. */
export const getRedis = (): Redis | null => (ready ? client : null);

export const isRedisReady = (): boolean => ready;

export const closeRedis = async (): Promise<void> => {
  if (client) {
    client.disconnect();
    client = null;
    ready = false;
  }
};
