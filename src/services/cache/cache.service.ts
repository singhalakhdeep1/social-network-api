/**
 * Cache Service for Social Network API
 * Implements distributed caching with Redis
 */
import { Redis } from 'ioredis';

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    return value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expiration = ttl || this.defaultTTL;
    await this.redis.setex(key, expiration, value);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getOrSet(key: string, factory: () => Promise<string>, ttl?: number): Promise<string> {
    const cachedValue = await this.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async clearAll(): Promise<void> {
    const keys = await this.redis.keys('*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
