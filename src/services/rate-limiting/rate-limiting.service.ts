/**
 * API rate limiting (HLD: token bucket).
 * The refill/consume step runs atomically in a Redis Lua script so it is correct across
 * multiple API instances; a process-local bucket map is used when Redis is down.
 */
import { getRedis } from '../../config/redis';
import { env } from '../../config/env';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface BucketOptions {
  capacity?: number;
  refillRate?: number; // tokens per second
}

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * rate)
local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end
redis.call('HSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('EXPIRE', key, math.ceil(capacity / rate) + 60)
return {allowed, tostring(tokens)}
`;

interface LocalBucket {
  tokens: number;
  ts: number;
}

export class RateLimitingService {
  private readonly capacity: number;
  private readonly refillRate: number;
  private local = new Map<string, LocalBucket>();

  constructor(options: BucketOptions = {}) {
    this.capacity = options.capacity ?? env.rateLimitBucketCapacity;
    this.refillRate = options.refillRate ?? env.rateLimitRefillRate;
    const sweeper = setInterval(() => this.sweep(), 5 * 60_000);
    sweeper.unref();
  }

  async consume(key: string, tokensRequested = 1, options: BucketOptions = {}): Promise<RateLimitResult> {
    const capacity = options.capacity ?? this.capacity;
    const rate = options.refillRate ?? this.refillRate;
    const redisKey = `rate_limit:${key}`;
    const now = Date.now();

    const redis = getRedis();
    if (redis) {
      try {
        const [allowedRaw, tokensRaw] = (await redis.eval(
          TOKEN_BUCKET_LUA,
          1,
          redisKey,
          capacity,
          rate,
          now,
          tokensRequested
        )) as [number, string];
        return this.toResult(allowedRaw === 1, Number(tokensRaw), tokensRequested, rate);
      } catch {
        /* fall back to the local bucket */
      }
    }

    const bucket = this.local.get(redisKey) ?? { tokens: capacity, ts: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.ts) / 1000) * rate);
    bucket.ts = now;
    const allowed = bucket.tokens >= tokensRequested;
    if (allowed) bucket.tokens -= tokensRequested;
    this.local.set(redisKey, bucket);
    return this.toResult(allowed, bucket.tokens, tokensRequested, rate);
  }

  async isAllowed(key: string, tokensRequested = 1, options: BucketOptions = {}): Promise<boolean> {
    return (await this.consume(key, tokensRequested, options)).allowed;
  }

  async getRemainingTokens(key: string): Promise<number> {
    return (await this.consume(key, 0)).remaining;
  }

  async resetBucket(key: string): Promise<void> {
    const redisKey = `rate_limit:${key}`;
    this.local.delete(redisKey);
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(redisKey);
      } catch {
        /* ignore */
      }
    }
  }

  private toResult(allowed: boolean, tokens: number, requested: number, rate: number): RateLimitResult {
    const missing = Math.max(0, requested - tokens);
    return {
      allowed,
      remaining: Math.floor(tokens),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(missing / rate))
    };
  }

  private sweep(): void {
    const cutoff = Date.now() - 60 * 60_000;
    for (const [key, bucket] of this.local) {
      if (bucket.ts < cutoff) this.local.delete(key);
    }
  }
}

export const rateLimiter = new RateLimitingService();
