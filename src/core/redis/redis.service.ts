import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 300)
  prefix?: string; // Key prefix for namespacing
}

/**
 * Redis-based distributed cache service
 * Replaces the in-memory cache for production scalability
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly defaultTTL = 300; // 5 minutes
  private readonly keyPrefix = 'datafriday:';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }

  /**
   * Build a namespaced cache key
   */
  private buildKey(key: string, prefix?: string): string {
    const namespace = prefix || this.keyPrefix;
    return `${namespace}${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, prefix?: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, prefix);
      const data = await this.redis.get(fullKey);
      
      if (!data) {
        this.logger.debug(`Cache MISS: ${fullKey}`);
        return null;
      }

      this.logger.debug(`Cache HIT: ${fullKey}`);
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.error(`Cache GET error for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTTL;
      const data = JSON.stringify(value);

      await this.redis.setex(fullKey, ttl, data);
      this.logger.debug(`Cache SET: ${fullKey} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Cache SET error for ${key}: ${error.message}`);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, prefix?: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key, prefix);
      await this.redis.del(fullKey);
      this.logger.debug(`Cache DELETE: ${fullKey}`);
    } catch (error) {
      this.logger.error(`Cache DELETE error for ${key}: ${error.message}`);
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string, prefix?: string): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, prefix);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      this.logger.debug(`Cache DELETE PATTERN: ${fullPattern} (${deleted} keys)`);
      return deleted;
    } catch (error) {
      this.logger.error(`Cache DELETE PATTERN error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, prefix);
      return (await this.redis.exists(fullKey)) === 1;
    } catch (error) {
      this.logger.error(`Cache HAS error for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and store
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options.prefix);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - compute value
    const value = await factory();
    
    // Store in cache
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Increment a counter
   */
  async incr(key: string, prefix?: string): Promise<number> {
    const fullKey = this.buildKey(key, prefix);
    return this.redis.incr(fullKey);
  }

  /**
   * Set expiration on existing key
   */
  async expire(key: string, ttl: number, prefix?: string): Promise<void> {
    const fullKey = this.buildKey(key, prefix);
    await this.redis.expire(fullKey, ttl);
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string, prefix?: string): Promise<number> {
    const fullKey = this.buildKey(key, prefix);
    return this.redis.ttl(fullKey);
  }

  /**
   * Store hash data
   */
  async hset(key: string, field: string, value: any, prefix?: string): Promise<void> {
    const fullKey = this.buildKey(key, prefix);
    await this.redis.hset(fullKey, field, JSON.stringify(value));
  }

  /**
   * Get hash field
   */
  async hget<T>(key: string, field: string, prefix?: string): Promise<T | null> {
    const fullKey = this.buildKey(key, prefix);
    const data = await this.redis.hget(fullKey, field);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all hash fields
   */
  async hgetall<T>(key: string, prefix?: string): Promise<Record<string, T>> {
    const fullKey = this.buildKey(key, prefix);
    const data = await this.redis.hgetall(fullKey);
    const result: Record<string, T> = {};
    
    for (const [field, value] of Object.entries(data)) {
      result[field] = JSON.parse(value as string);
    }
    
    return result;
  }

  /**
   * Add to sorted set (for leaderboards, rate limiting)
   */
  async zadd(key: string, score: number, member: string, prefix?: string): Promise<void> {
    const fullKey = this.buildKey(key, prefix);
    await this.redis.zadd(fullKey, score, member);
  }

  /**
   * Get range from sorted set
   */
  async zrange(key: string, start: number, stop: number, prefix?: string): Promise<string[]> {
    const fullKey = this.buildKey(key, prefix);
    return this.redis.zrange(fullKey, start, stop);
  }

  /**
   * Publish message to channel (Pub/Sub)
   */
  async publish(channel: string, message: any): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(message));
    this.logger.debug(`Published to ${channel}`);
  }

  /**
   * Clear all datafriday keys (use with caution!)
   */
  async flushNamespace(): Promise<number> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    if (keys.length === 0) return 0;
    
    const deleted = await this.redis.del(...keys);
    this.logger.warn(`Flushed ${deleted} keys from namespace`);
    return deleted;
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get Redis info for monitoring
   */
  async info(): Promise<string> {
    return this.redis.info();
  }
}
