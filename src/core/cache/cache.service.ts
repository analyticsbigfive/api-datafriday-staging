import { Injectable, Logger } from '@nestjs/common';

interface CacheOptions {
    ttl?: number; // Time to live in seconds
    key: string;
}

/**
 * Simple in-memory cache service
 * For production, consider using Redis
 */
@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private cache = new Map<string, { value: any; expiresAt: number }>();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Cleanup expired entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    /**
     * Get value from cache
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        this.logger.debug(`Cache HIT: ${key}`);
        return entry.value as T;
    }

    /**
     * Set value in cache
     */
    set(key: string, value: any, ttl: number = 300): void {
        const expiresAt = Date.now() + ttl * 1000;
        this.cache.set(key, { value, expiresAt });
        this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
    }

    /**
     * Delete value from cache
     */
    delete(key: string): void {
        this.cache.delete(key);
        this.logger.debug(`Cache DELETE: ${key}`);
    }

    /**
     * Check if key exists in cache (and not expired)
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
        this.logger.log('Cache CLEARED');
    }

    /**
     * Get or set pattern
     */
    async getOrSet<T>(
        key: string,
        factory: () => Promise<T>,
        ttl: number = 300,
    ): Promise<T> {
        // Try to get from cache
        const cached = this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // Cache miss - fetch data
        this.logger.debug(`Cache MISS: ${key}`);
        const value = await factory();

        // Store in cache
        this.set(key, value, ttl);

        return value;
    }

    /**
     * Invalidate cache by pattern
     */
    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern);
        let count = 0;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }

        this.logger.log(`Invalidated ${count} cache entries matching: ${pattern}`);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }

    /**
     * Cleanup expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
        }
    }

    /**
     * Cleanup on module destroy
     */
    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
