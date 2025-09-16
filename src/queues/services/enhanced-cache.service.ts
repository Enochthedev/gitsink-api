import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Redis from 'ioredis';
import { MetricsService } from '../../metrics/metrics.service';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  tags?: string[];
  version?: string;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  averageResponseTime: number;
}

export interface CacheConfig {
  l1MaxSize: number;
  l1DefaultTtl: number;
  l2DefaultTtl: number;
  enableCompression: boolean;
  enableMetrics: boolean;
  keyPrefix: string;
}

@Injectable()
export class EnhancedCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnhancedCacheService.name);

  // L1 Cache: In-memory Map for fastest access
  private l1Cache = new Map<string, CacheEntry>();

  // L2 Cache: Redis for shared cache across instances
  private redis!: Redis;

  // Cache statistics
  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    totalHits: 0,
    totalMisses: 0,
    hitRate: 0,
    averageResponseTime: 0,
  };

  private config: CacheConfig;
  private cleanupInterval?: NodeJS.Timeout;
  private responseTimes: number[] = [];

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.config = {
      l1MaxSize: this.configService.get<number>('CACHE_L1_MAX_SIZE', 1000),
      l1DefaultTtl: this.configService.get<number>('CACHE_L1_DEFAULT_TTL', 300000), // 5 minutes
      l2DefaultTtl: this.configService.get<number>('CACHE_L2_DEFAULT_TTL', 3600000), // 1 hour
      enableCompression: this.configService.get<boolean>('CACHE_ENABLE_COMPRESSION', true),
      enableMetrics: this.configService.get<boolean>('CACHE_ENABLE_METRICS', true),
      keyPrefix: this.configService.get<string>('CACHE_KEY_PREFIX', 'gitsink:'),
    };
  }

  async onModuleInit() {
    await this.initializeRedis();
    this.startCleanupInterval();
    this.logger.log('Enhanced Cache Service initialized');
  }

  async onModuleDestroy() {
    await this.cleanup();
    this.logger.log('Enhanced Cache Service destroyed');
  }

  /**
   * Get value from cache with multi-level fallback
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.getFullKey(key);

    try {
      // Try L1 cache first
      const l1Result = this.getFromL1<T>(fullKey);
      if (l1Result !== null) {
        this.recordHit('l1', startTime);
        return l1Result;
      }

      // Try L2 cache (Redis)
      const l2Result = await this.getFromL2<T>(fullKey);
      if (l2Result !== null) {
        // Store in L1 for faster future access
        this.setInL1(fullKey, l2Result, this.config.l1DefaultTtl);
        this.recordHit('l2', startTime);
        return l2Result;
      }

      this.recordMiss(startTime);
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      this.recordMiss(startTime);
      return null;
    }
  }

  /**
   * Set value in cache with multi-level storage
   */
  async set<T>(
    key: string,
    value: T,
    ttl?: number,
    options?: { tags?: string[]; version?: string },
  ): Promise<void> {
    const fullKey = this.getFullKey(key);
    const l1Ttl = ttl || this.config.l1DefaultTtl;
    const l2Ttl = ttl || this.config.l2DefaultTtl;

    try {
      // Store in both L1 and L2
      this.setInL1(fullKey, value, l1Ttl, options);
      await this.setInL2(fullKey, value, l2Ttl, options);

      if (this.config.enableMetrics) {
        this.metricsService.recordCacheHit(key, true);
      }
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);

    try {
      // Remove from both levels
      this.l1Cache.delete(fullKey);
      await this.redis.del(fullKey);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache by tags
   */
  async clearByTags(tags: string[]): Promise<number> {
    let cleared = 0;

    try {
      // Clear from L1
      for (const [key, entry] of this.l1Cache.entries()) {
        if (entry.tags && tags.some(tag => entry.tags!.includes(tag))) {
          this.l1Cache.delete(key);
          cleared++;
        }
      }

      // Clear from L2 (Redis) - this would require a more sophisticated implementation
      // For now, we'll use a simple pattern-based approach
      for (const tag of tags) {
        const pattern = `${this.config.keyPrefix}*:tag:${tag}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          cleared += keys.length;
        }
      }

      this.logger.log(`Cleared ${cleared} cache entries by tags: ${tags.join(', ')}`);
      return cleared;
    } catch (error) {
      this.logger.error(`Error clearing cache by tags:`, error);
      return cleared;
    }
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    this.logger.log(`Warming cache with ${entries.length} entries`);

    const promises = entries.map(({ key, value, ttl }) =>
      this.set(key, value, ttl).catch(error =>
        this.logger.error(`Failed to warm cache for key ${key}:`, error),
      ),
    );

    await Promise.all(promises);
    this.logger.log('Cache warming completed');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = totalRequests > 0 ? this.stats.totalHits / totalRequests : 0;
    const averageResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
        : 0;

    return {
      ...this.stats,
      hitRate,
      averageResponseTime,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      totalHits: 0,
      totalMisses: 0,
      hitRate: 0,
      averageResponseTime: 0,
    };
    this.responseTimes = [];
  }

  /**
   * Get cache health status
   */
  getHealthStatus(): {
    healthy: boolean;
    l1Size: number;
    l2Connected: boolean;
    stats: CacheStats;
    issues: string[];
  } {
    const issues: string[] = [];
    let healthy = true;

    // Check L1 cache size
    if (this.l1Cache.size > this.config.l1MaxSize * 0.9) {
      issues.push('L1 cache is near capacity');
      healthy = false;
    }

    // Check Redis connection
    const l2Connected = this.redis.status === 'ready';
    if (!l2Connected) {
      issues.push('Redis connection is not ready');
      healthy = false;
    }

    // Check hit rate
    const stats = this.getStats();
    if (stats.hitRate < 0.5 && stats.totalHits + stats.totalMisses > 100) {
      issues.push('Cache hit rate is below 50%');
    }

    return {
      healthy,
      l1Size: this.l1Cache.size,
      l2Connected,
      stats,
      issues,
    };
  }

  private async initializeRedis() {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_CACHE_DB', 1),
      keyPrefix: this.config.keyPrefix,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for caching');
    });

    this.redis.on('error', error => {
      this.logger.error('Redis cache error:', error);
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis cache is ready');
    });
  }

  private getFromL1<T>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.l1Cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private async getFromL2<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;

      return this.deserialize<T>(data);
    } catch (error) {
      this.logger.error(`L2 cache get error:`, error);
      return null;
    }
  }

  private setInL1<T>(
    key: string,
    value: T,
    ttl: number,
    options?: { tags?: string[]; version?: string },
  ): void {
    // Implement LRU eviction if cache is full
    if (this.l1Cache.size >= this.config.l1MaxSize) {
      const oldestKey = this.l1Cache.keys().next().value;
      if (oldestKey) {
        this.l1Cache.delete(oldestKey);
      }
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl,
      tags: options?.tags,
      version: options?.version,
    };

    this.l1Cache.set(key, entry);
  }

  private async setInL2<T>(
    key: string,
    value: T,
    ttl: number,
    options?: { tags?: string[]; version?: string },
  ): Promise<void> {
    try {
      const serialized = this.serialize(value);
      const ttlSeconds = Math.floor(ttl / 1000);

      await this.redis.setex(key, ttlSeconds, serialized);

      // Store tags for tag-based invalidation
      if (options?.tags) {
        for (const tag of options.tags) {
          const tagKey = `${key}:tag:${tag}`;
          await this.redis.setex(tagKey, ttlSeconds, '1');
        }
      }
    } catch (error) {
      this.logger.error(`L2 cache set error:`, error);
      throw error;
    }
  }

  private serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(data: string): T {
    return JSON.parse(data);
  }

  private getFullKey(key: string): string {
    return key.startsWith(this.config.keyPrefix) ? key : `${this.config.keyPrefix}${key}`;
  }

  private recordHit(level: 'l1' | 'l2', startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    if (level === 'l1') {
      this.stats.l1Hits++;
    } else {
      this.stats.l2Hits++;
    }

    this.stats.totalHits++;

    if (this.config.enableMetrics) {
      this.metricsService.recordCacheHit(`cache_${level}`, true);
    }
  }

  private recordMiss(startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);

    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    this.stats.l1Misses++;
    this.stats.l2Misses++;
    this.stats.totalMisses++;

    if (this.config.enableMetrics) {
      this.metricsService.recordCacheHit('cache_miss', false);
    }
  }

  private startCleanupInterval(): void {
    const cleanupInterval = this.configService.get<number>('CACHE_CLEANUP_INTERVAL', 300000); // 5 minutes

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredL1Entries();
    }, cleanupInterval);
  }

  private cleanupExpiredL1Entries(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.l1Cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired L1 cache entries`);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.redis) {
      await this.redis.quit();
    }

    this.l1Cache.clear();
  }
}
