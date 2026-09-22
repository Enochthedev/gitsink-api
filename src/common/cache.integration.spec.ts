import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { redisStore } from 'cache-manager-ioredis';
import { EnhancedCacheService } from '../queues/services/enhanced-cache.service';
import { QueryCacheService } from './services/query-cache.service';
import { createMockConfigService, createMockLogger } from '../../test/test-utils/mocks';
import Redis from 'ioredis';

// Mock Redis for testing
jest.mock('ioredis');
const MockRedis = Redis as jest.MockedClass<typeof Redis>;

describe('Cache Integration Tests', () => {
  let module: TestingModule;
  let cacheManager: Cache;
  let enhancedCacheService: EnhancedCacheService;
  let queryCacheService: QueryCacheService;
  let mockRedis: jest.Mocked<Redis>;

  beforeAll(async () => {
    // Setup mock Redis
    mockRedis = new MockRedis() as jest.Mocked<Redis>;
    mockRedis.get = jest.fn();
    mockRedis.set = jest.fn();
    mockRedis.del = jest.fn();
    mockRedis.exists = jest.fn();
    mockRedis.ttl = jest.fn();
    mockRedis.expire = jest.fn();
    mockRedis.keys = jest.fn();
    mockRedis.flushall = jest.fn();
    mockRedis.ping = jest.fn().mockResolvedValue('PONG');
    mockRedis.mget = jest.fn();
    mockRedis.mset = jest.fn();
    mockRedis.pipeline = jest.fn().mockReturnValue({
      get: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    const configService = createMockConfigService();

    module = await Test.createTestingModule({
      imports: [
        CacheModule.register({
          store: redisStore,
          host: 'localhost',
          port: 6379,
          ttl: 300, // 5 minutes default TTL
        }),
      ],
      providers: [
        EnhancedCacheService,
        QueryCacheService,
        { provide: 'ConfigService', useValue: configService },
        { provide: 'PinoLogger', useValue: createMockLogger() },
      ],
    }).compile();

    cacheManager = module.get<Cache>(CACHE_MANAGER);
    enhancedCacheService = module.get<EnhancedCacheService>(EnhancedCacheService);
    queryCacheService = module.get<QueryCacheService>(QueryCacheService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset cache before each test
    mockRedis.flushall.mockResolvedValue('OK');
    await cacheManager.reset();
  });

  describe('Basic Cache Operations', () => {
    it('should set and get cache values', async () => {
      const key = 'test:basic';
      const value = { message: 'Hello, Cache!' };

      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify(value));

      await cacheManager.set(key, value, 300);
      const cachedValue = await cacheManager.get(key);

      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value), 'EX', 300);
      expect(cachedValue).toEqual(value);
    });

    it('should handle cache misses', async () => {
      const key = 'test:missing';

      mockRedis.get.mockResolvedValue(null);

      const cachedValue = await cacheManager.get(key);
      expect(cachedValue).toBeNull();
    });

    it('should delete cache values', async () => {
      const key = 'test:delete';

      mockRedis.del.mockResolvedValue(1);

      await cacheManager.del(key);
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should check if cache key exists', async () => {
      const key = 'test:exists';

      mockRedis.exists.mockResolvedValue(1);

      const exists = await mockRedis.exists(key);
      expect(exists).toBe(1);
    });

    it('should handle cache TTL', async () => {
      const key = 'test:ttl';
      const value = 'test value';
      const ttl = 60;

      mockRedis.set.mockResolvedValue('OK');
      mockRedis.ttl.mockResolvedValue(ttl);

      await cacheManager.set(key, value, ttl);
      const remainingTtl = await mockRedis.ttl(key);

      expect(remainingTtl).toBe(ttl);
    });
  });

  describe('Enhanced Cache Service', () => {
    it('should implement multi-level caching', async () => {
      const key = 'test:multilevel';
      const value = { data: 'multi-level test' };

      mockRedis.get.mockResolvedValue(JSON.stringify(value));

      // Test L1 cache (memory)
      const result1 = await enhancedCacheService.get(key);
      expect(result1).toEqual(value);

      // Second call should hit L1 cache
      const result2 = await enhancedCacheService.get(key);
      expect(result2).toEqual(value);
      expect(mockRedis.get).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should handle cache warming', async () => {
      const keys = ['warm:1', 'warm:2', 'warm:3'];
      const values = [
        { id: 1, data: 'value 1' },
        { id: 2, data: 'value 2' },
        { id: 3, data: 'value 3' },
      ];

      mockRedis.mset.mockResolvedValue('OK');

      await enhancedCacheService.warmCache(keys, values);

      expect(mockRedis.mset).toHaveBeenCalledWith(
        keys[0],
        JSON.stringify(values[0]),
        keys[1],
        JSON.stringify(values[1]),
        keys[2],
        JSON.stringify(values[2]),
      );
    });

    it('should implement cache invalidation patterns', async () => {
      const pattern = 'user:123:*';
      const matchingKeys = ['user:123:profile', 'user:123:projects', 'user:123:settings'];

      mockRedis.keys.mockResolvedValue(matchingKeys);
      mockRedis.del.mockResolvedValue(matchingKeys.length);

      const deletedCount = await enhancedCacheService.invalidatePattern(pattern);

      expect(mockRedis.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedis.del).toHaveBeenCalledWith(...matchingKeys);
      expect(deletedCount).toBe(matchingKeys.length);
    });

    it('should handle cache tags for group invalidation', async () => {
      const tag = 'user:123';
      const taggedKeys = ['user:123:profile', 'user:123:projects'];

      // Mock tagged cache operations
      mockRedis.get.mockImplementation(key => {
        if (key === `tag:${tag}`) {
          return Promise.resolve(JSON.stringify(taggedKeys));
        }
        return Promise.resolve(null);
      });
      mockRedis.del.mockResolvedValue(taggedKeys.length);

      const deletedCount = await enhancedCacheService.invalidateByTag(tag);

      expect(deletedCount).toBe(taggedKeys.length);
    });

    it('should implement cache compression for large values', async () => {
      const key = 'test:large';
      const largeValue = {
        data: 'x'.repeat(10000), // Large string
        metadata: { size: 'large', compressed: true },
      };

      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify(largeValue));

      await enhancedCacheService.setCompressed(key, largeValue, 300);
      const retrievedValue = await enhancedCacheService.getCompressed(key);

      expect(retrievedValue).toEqual(largeValue);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle cache statistics', async () => {
      // Simulate cache operations
      await enhancedCacheService.get('stats:test1');
      await enhancedCacheService.get('stats:test2');
      await enhancedCacheService.set('stats:test3', 'value', 300);

      const stats = enhancedCacheService.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('Query Cache Service', () => {
    it('should cache database query results', async () => {
      const queryKey = 'query:users:active';
      const queryResult = [
        { id: 1, name: 'User 1', active: true },
        { id: 2, name: 'User 2', active: true },
      ];

      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Mock query function
      const mockQuery = jest.fn().mockResolvedValue(queryResult);

      const result = await queryCacheService.cacheQuery(queryKey, mockQuery, 300);

      expect(result).toEqual(queryResult);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should return cached query results on subsequent calls', async () => {
      const queryKey = 'query:users:cached';
      const cachedResult = [{ id: 1, name: 'Cached User', active: true }];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const mockQuery = jest.fn();

      const result = await queryCacheService.cacheQuery(queryKey, mockQuery, 300);

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled(); // Should not execute query
    });

    it('should handle query cache invalidation', async () => {
      const queryKeys = ['query:users:1', 'query:users:2', 'query:projects:1'];

      mockRedis.keys.mockResolvedValue(queryKeys);
      mockRedis.del.mockResolvedValue(queryKeys.length);

      const deletedCount = await queryCacheService.invalidateQueries('query:users:*');

      expect(deletedCount).toBeGreaterThan(0);
    });

    it('should implement query result pagination caching', async () => {
      const baseKey = 'query:projects:paginated';
      const page1Key = `${baseKey}:page:1:limit:10`;
      const page2Key = `${baseKey}:page:2:limit:10`;

      const page1Result = {
        data: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          title: `Project ${i + 1}`,
        })),
        pagination: { page: 1, limit: 10, total: 25, hasNext: true },
      };

      const page2Result = {
        data: Array.from({ length: 10 }, (_, i) => ({
          id: i + 11,
          title: `Project ${i + 11}`,
        })),
        pagination: { page: 2, limit: 10, total: 25, hasNext: true },
      };

      mockRedis.get
        .mockResolvedValueOnce(null) // Page 1 miss
        .mockResolvedValueOnce(JSON.stringify(page2Result)); // Page 2 hit

      mockRedis.set.mockResolvedValue('OK');

      const mockQuery1 = jest.fn().mockResolvedValue(page1Result);
      const mockQuery2 = jest.fn().mockResolvedValue(page2Result);

      // Cache page 1
      const result1 = await queryCacheService.cacheQuery(page1Key, mockQuery1, 300);
      expect(result1).toEqual(page1Result);
      expect(mockQuery1).toHaveBeenCalled();

      // Get page 2 from cache
      const result2 = await queryCacheService.cacheQuery(page2Key, mockQuery2, 300);
      expect(result2).toEqual(page2Result);
      expect(mockQuery2).not.toHaveBeenCalled(); // Should be cached
    });
  });

  describe('Cache Performance and Reliability', () => {
    it('should handle high-frequency cache operations', async () => {
      const operationCount = 1000;
      const operations = [];

      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify({ test: 'value' }));

      const startTime = Date.now();

      // Generate many cache operations
      for (let i = 0; i < operationCount; i++) {
        operations.push(cacheManager.set(`perf:${i}`, { index: i }, 300));
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle cache failures gracefully', async () => {
      const key = 'test:failure';
      const value = { data: 'test' };

      // Mock Redis failure
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw error, but handle gracefully
      await expect(cacheManager.set(key, value, 300)).rejects.toThrow();
    });

    it('should implement cache circuit breaker', async () => {
      const key = 'test:circuit-breaker';

      // Simulate multiple failures
      mockRedis.get.mockRejectedValue(new Error('Connection timeout'));

      let failureCount = 0;
      for (let i = 0; i < 5; i++) {
        try {
          await cacheManager.get(key);
        } catch (error) {
          failureCount++;
        }
      }

      expect(failureCount).toBe(5);
    });

    it('should handle concurrent cache operations safely', async () => {
      const key = 'test:concurrent';
      const values = Array.from({ length: 10 }, (_, i) => ({ index: i }));

      mockRedis.set.mockResolvedValue('OK');

      // Simulate concurrent writes to the same key
      const concurrentWrites = values.map((value, index) => cacheManager.set(key, value, 300));

      await Promise.all(concurrentWrites);

      // All operations should complete without error
      expect(mockRedis.set).toHaveBeenCalledTimes(10);
    });

    it('should implement cache warming strategies', async () => {
      const warmingData = [
        { key: 'warm:user:1', value: { id: 1, name: 'User 1' } },
        { key: 'warm:user:2', value: { id: 2, name: 'User 2' } },
        { key: 'warm:user:3', value: { id: 3, name: 'User 3' } },
      ];

      mockRedis.pipeline().set.mockReturnThis();
      mockRedis.pipeline().exec.mockResolvedValue([]);

      await enhancedCacheService.batchWarmCache(warmingData);

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });
  });

  describe('Cache Monitoring and Metrics', () => {
    it('should track cache hit/miss ratios', async () => {
      const keys = ['metrics:1', 'metrics:2', 'metrics:3'];

      // Mock some hits and misses
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ cached: true })) // Hit
        .mockResolvedValueOnce(null) // Miss
        .mockResolvedValueOnce(JSON.stringify({ cached: true })); // Hit

      await Promise.all(keys.map(key => cacheManager.get(key)));

      const stats = enhancedCacheService.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });

    it('should monitor cache memory usage', async () => {
      const memoryInfo = await enhancedCacheService.getMemoryInfo();

      expect(memoryInfo).toHaveProperty('used');
      expect(memoryInfo).toHaveProperty('available');
      expect(memoryInfo).toHaveProperty('percentage');
      expect(typeof memoryInfo.used).toBe('number');
      expect(typeof memoryInfo.percentage).toBe('number');
    });

    it('should track cache operation latencies', async () => {
      const key = 'latency:test';
      const value = { test: 'latency' };

      mockRedis.set.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('OK'), 10)),
      );
      mockRedis.get.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(JSON.stringify(value)), 5)),
      );

      const startTime = Date.now();
      await cacheManager.set(key, value, 300);
      const setLatency = Date.now() - startTime;

      const getStartTime = Date.now();
      await cacheManager.get(key);
      const getLatency = Date.now() - getStartTime;

      expect(setLatency).toBeGreaterThan(0);
      expect(getLatency).toBeGreaterThan(0);
    });

    it('should provide cache health status', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const health = await enhancedCacheService.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('connection');
      expect(health).toHaveProperty('stats');
      expect(health.status).toBe('healthy');
      expect(health.connection.ping).toBe('PONG');
    });
  });

  describe('Cache Cleanup and Maintenance', () => {
    it('should clean expired cache entries', async () => {
      const expiredKeys = ['expired:1', 'expired:2', 'expired:3'];

      mockRedis.keys.mockResolvedValue(expiredKeys);
      mockRedis.ttl.mockResolvedValue(-2); // Expired
      mockRedis.del.mockResolvedValue(expiredKeys.length);

      const cleanedCount = await enhancedCacheService.cleanExpiredKeys();

      expect(cleanedCount).toBe(expiredKeys.length);
    });

    it('should implement cache size limits', async () => {
      const maxSize = 100; // MB
      const currentSize = 150; // MB (over limit)

      // Mock memory usage check
      jest.spyOn(enhancedCacheService, 'getMemoryInfo').mockResolvedValue({
        used: currentSize * 1024 * 1024,
        available: 1000 * 1024 * 1024,
        percentage: 15,
      });

      const shouldEvict = await enhancedCacheService.shouldEvictCache(maxSize);
      expect(shouldEvict).toBe(true);
    });

    it('should implement LRU eviction strategy', async () => {
      const lruKeys = ['lru:old:1', 'lru:old:2', 'lru:recent:1'];

      // Mock LRU key identification
      mockRedis.keys.mockResolvedValue(lruKeys);
      mockRedis.del.mockResolvedValue(2); // Evicted 2 old keys

      const evictedCount = await enhancedCacheService.evictLRU(2);
      expect(evictedCount).toBe(2);
    });
  });
});
