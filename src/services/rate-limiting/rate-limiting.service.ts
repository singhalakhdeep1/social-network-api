/**
 * Rate Limiting Service for Social Network API
 * Implements token bucket algorithm for API rate limiting
 */
import { Redis } from 'ioredis';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimitingService {
  private redis: Redis;
  private bucketCapacity: number = 100;
  private refillRate: number = 1; // tokens per second

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async isAllowed(key: string, tokensRequested: number = 1): Promise<boolean> {
    const bucket = await this.getOrCreateBucket(key);

    const now = Date.now();
    const timeSinceLastRefill = (now - bucket.lastRefill) / 1000;

    const tokensToAdd = Math.floor(timeSinceLastRefill * this.refillRate);
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.bucketCapacity);
    bucket.lastRefill = now;

    if (bucket.tokens >= tokensRequested) {
      bucket.tokens -= tokensRequested;
      await this.saveBucket(key, bucket);
      return true;
    }

    return false;
  }

  async getRemainingTokens(key: string): Promise<number> {
    const bucket = await this.getOrCreateBucket(key);

    const now = Date.now();
    const timeSinceLastRefill = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timeSinceLastRefill * this.refillRate);
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.bucketCapacity);
    bucket.lastRefill = now;

    await this.saveBucket(key, bucket);
    return bucket.tokens;
  }

  async resetBucket(key: string): Promise<void> {
    await this.redis.del(`rate_limit:${key}`);
  }

  private async getOrCreateBucket(key: string): Promise<TokenBucket> {
    const data = await this.redis.get(`rate_limit:${key}`);

    if (data) {
      return JSON.parse(data);
    }

    const bucket: TokenBucket = {
      tokens: this.bucketCapacity,
      lastRefill: Date.now(),
    };

    await this.saveBucket(key, bucket);
    return bucket;
  }

  private async saveBucket(key: string, bucket: TokenBucket): Promise<void> {
    await this.redis.setex(`rate_limit:${key}`, 3600, JSON.stringify(bucket));
  }
}
