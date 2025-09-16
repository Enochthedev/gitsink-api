import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service';
import { createHash } from 'crypto';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  namespace?: string; // Cache namespace
  compress?: boolean; // Whether to compress large values
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  averageResponseTime: number;
}

@Injectable()
export class QueryCacheService {
  private readonly logger = new Logger(QueryCacheService.name);
  private readonly defaultTtl: number;
  private readonly compressionThreshold: number;
  private readonly stats = new Map<string, CacheStats>();

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.defaultTtl = this.configService.get<number>('CACHE_DEFAULT_TTL', 300); // 5 minutes
    this.compressionThreshold = this.configService.get<number>('CACHE_COMPRESSION_THRESHOLD', 1024); // 1KB
  }

  /**
   * Get cached query result
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(key, options.namespace);

    try {
      const cached = await this.cacheManager.get<string>(cacheKey);
      const duration = Date.now() - startTime;

      if (cached !== undefined && cached !== null) {
        this.recordCacheHit(key, duration);
        this.metricsService.recordCacheHit(cacheKey, true);

        // Decompress if needed
        const result = this.deserializeValue(cached);
        return result as T;
      } else {
        this.recordCacheMiss(key, duration);
        this.metricsService.recordCacheHit(cacheKey, false);
        return null;
      }
    } catch (error) {
      this.logger.error(`Cache get error for key ${cacheKey}`, error);
      this.recordCacheMiss(key, Date.now() - startTime);
      return null;
    }
  }

  /**
   * Set cached query result
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildCacheKey(key, options.namespace);
    const ttl = options.ttl || this.defaultTtl;

    try {
      const serializedValue = this.serializeValue(value, options.compress);
      await this.cacheManager.set(cacheKey, serializedValue, ttl * 1000);

      // Store cache tags for invalidation
      if (options.tags && options.tags.length > 0) {
        await this.storeCacheTags(cacheKey, options.tags);
      }

      this.logger.debug(`Cached result for key: ${cacheKey} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Cache set error for key ${cacheKey}`, error);
    }
  }

  /**
   * Delete cached result
   */
  async del(key: string, namespace?: string): Promise<void> {
    const cacheKey = this.buildCacheKey(key, namespace);

    try {
      await this.cacheManager.del(cacheKey);
      this.logger.debug(`Deleted cache key: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${cacheKey}`, error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const cachedKeys = await this.cacheManager.get<string[]>(tagKey);

        if (cachedKeys && Array.isArray(cachedKeys)) {
          await Promise.all(cachedKeys.map(key => this.cacheManager.del(key)));
          await this.cacheManager.del(tagKey);

          this.logger.debug(`Invalidated ${cachedKeys.length} cache entries for tag: ${tag}`);
        }
      }
    } catch (error) {
      this.logger.error(`Cache invalidation error for tags: ${tags.join(', ')}`, error);
    }
  }

  /**
   * Get or set cached result with a factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key, options);

    if (cached !== null) {
      return cached;
    }

    // Generate new value
    const startTime = Date.now();
    try {
      const value = await factory();
      const duration = Date.now() - startTime;

      // Cache the result
      await this.set(key, value, options);

      this.logger.debug(`Generated and cached result for key: ${key} (${duration}ms)`);
      return value;
    } catch (error) {
      this.logger.error(`Factory function error for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache<T>(
    entries: Array<{
      key: string;
      factory: () => Promise<T>;
      options?: CacheOptions;
    }>,
  ): Promise<void> {
    this.logger.log(`Warming cache with ${entries.length} entries`);

    const promises = entries.map(async ({ key, factory, options = {} }) => {
      try {
        const value = await factory();
        await this.set(key, value, options);
      } catch (error) {
        this.logger.error(`Cache warming error for key: ${key}`, error);
      }
    });

    await Promise.all(promises);
    this.logger.log('Cache warming completed');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(key?: string): CacheStats | Map<string, CacheStats> {
    if (key) {
      return (
        this.stats.get(key) || {
          hits: 0,
          misses: 0,
          hitRate: 0,
          totalRequests: 0,
          averageResponseTime: 0,
        }
      );
    }

    return new Map(this.stats);
  }

  /**
   * Clear all cache statistics
   */
  clearStats(): void {
    this.stats.clear();
    this.logger.log('Cache statistics cleared');
  }

  /**
   * Generate cache key for query parameters
   */
  generateQueryKey(operation: string, params: Record<string, any>, userId?: string): string {
    const keyData = {
      operation,
      params: this.normalizeParams(params),
      ...(userId && { userId }),
    };

    const keyString = JSON.stringify(keyData);
    return createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }

  private buildCacheKey(key: string, namespace?: string): string {
    const prefix = this.configService.get<string>('CACHE_KEY_PREFIX', 'gitsink');
    const parts = [prefix];

    if (namespace) {
      parts.push(namespace);
    }

    parts.push(key);
    return parts.join(':');
  }

  private serializeValue<T>(value: T, compress = false): string {
    const serialized = JSON.stringify(value);

    if (compress && serialized.length > this.compressionThreshold) {
      // In a real implementation, you might use compression here
      // For now, we'll just mark it as compressed
      return `compressed:${serialized}`;
    }

    return serialized;
  }

  private deserializeValue(value: string): any {
    if (value.startsWith('compressed:')) {
      // Handle decompression
      return JSON.parse(value.substring(11));
    }

    return JSON.parse(value);
  }

  private async storeCacheTags(cacheKey: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const existingKeys = (await this.cacheManager.get<string[]>(tagKey)) || [];

      if (!existingKeys.includes(cacheKey)) {
        existingKeys.push(cacheKey);
        await this.cacheManager.set(tagKey, existingKeys, 3600 * 1000); // 1 hour TTL for tag mappings
      }
    }
  }

  private normalizeParams(params: Record<string, any>): Record<string, any> {
    // Sort keys and handle special values for consistent cache keys
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params).sort()) {
      if (value === undefined) {
        continue; // Skip undefined values
      }

      if (value instanceof Date) {
        normalized[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        normalized[key] = [...value].sort();
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = this.normalizeParams(value);
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  private recordCacheHit(key: string, duration: number): void {
    const stats = this.stats.get(key) || {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      averageResponseTime: 0,
    };

    stats.hits++;
    stats.totalRequests++;
    stats.hitRate = (stats.hits / stats.totalRequests) * 100;
    stats.averageResponseTime =
      (stats.averageResponseTime * (stats.totalRequests - 1) + duration) / stats.totalRequests;

    this.stats.set(key, stats);
  }

  private recordCacheMiss(key: string, duration: number): void {
    const stats = this.stats.get(key) || {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      averageResponseTime: 0,
    };

    stats.misses++;
    stats.totalRequests++;
    stats.hitRate = (stats.hits / stats.totalRequests) * 100;
    stats.averageResponseTime =
      (stats.averageResponseTime * (stats.totalRequests - 1) + duration) / stats.totalRequests;

    this.stats.set(key, stats);
  }
}
