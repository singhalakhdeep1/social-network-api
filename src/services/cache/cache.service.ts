/**
 * Distributed cache (HLD: Distributed Caching).
 * Redis-backed with TTLs, get-or-set and pattern invalidation (SCAN, never KEYS).
 * Falls back to a process-local TTL map when Redis is not connected.
 */
import { getRedis } from '../../config/redis';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class CacheService {
  private memory = new Map<string, MemoryEntry>();
  private readonly defaultTTL: number;

  constructor(defaultTTLSeconds = 3600) {
    this.defaultTTL = defaultTTLSeconds;
    const sweeper = setInterval(() => this.sweep(), 60_000);
    sweeper.unref();
  }

  async get(key: string): Promise<string | null> {
    const redis = getRedis();
    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        /* fall through to memory */
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const seconds = ttl ?? this.defaultTTL;
    const redis = getRedis();
    if (redis) {
      try {
        await redis.set(key, value, 'EX', seconds);
        return;
      } catch {
        /* fall through to memory */
      }
    }
    this.memory.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(...keys);
      } catch {
        /* ignore */
      }
    }
    keys.forEach((k) => this.memory.delete(k));
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  async getOrSet(key: string, factory: () => Promise<string>, ttl?: number): Promise<string> {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async getOrSetJSON<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.getJSON<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.setJSON(key, value, ttl);
    return value;
  }

  /** Deletes every key matching a glob pattern such as `feed:*`. */
  async invalidatePattern(pattern: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      try {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          cursor = next;
          if (keys.length) await redis.del(...keys);
        } while (cursor !== '0');
      } catch {
        /* ignore */
      }
    }
    const matcher = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    for (const key of this.memory.keys()) {
      if (matcher.test(key)) this.memory.delete(key);
    }
  }

  async clearAll(): Promise<void> {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.flushdb();
      } catch {
        /* ignore */
      }
    }
    this.memory.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt < now) this.memory.delete(key);
    }
  }
}

export const cache = new CacheService();
