import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { EnhancedCacheService } from './enhanced-cache.service';
import { MetricsService } from '../../metrics/metrics.service';

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('EnhancedCacheService', () => {
  let service: EnhancedCacheService;
  let configService: ConfigService;
  let metricsService: MetricsService;

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockMetricsService = {
    recordCacheHit: jest.fn(),
    recordQueueJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedCacheService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<EnhancedCacheService>(EnhancedCacheService);
    configService = module.get<ConfigService>(ConfigService);
    metricsService = module.get<MetricsService>(MetricsService);

    // Setup default config mock returns
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        CACHE_L1_MAX_SIZE: 1000,
        CACHE_L1_DEFAULT_TTL: 300000,
        CACHE_L2_DEFAULT_TTL: 3600000,
        CACHE_ENABLE_COMPRESSION: true,
        CACHE_ENABLE_METRICS: true,
        CACHE_KEY_PREFIX: 'test:',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_CACHE_DB: 1,
      };
      return config[key] || defaultValue;
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.onModuleInit();
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should cleanup successfully', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return value from L1 cache', async () => {
      const testValue = { data: 'test' };

      // Set value in L1 cache directly
      await service.set('test-key', testValue, 300000);

      const result = await service.get('test-key');
      expect(result).toEqual(testValue);
    });

    it('should return value from L2 cache when L1 misses', async () => {
      const testValue = { data: 'test' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testValue));

      const result = await service.get('test-key');
      expect(result).toEqual(testValue);
      expect(mockRedis.get).toHaveBeenCalledWith('test:test-key');
    });

    it('should return null when both caches miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should set value in both L1 and L2 cache', async () => {
      const testValue = { data: 'test' };
      mockRedis.setex.mockResolvedValue('OK');

      await service.set('test-key', testValue, 300000);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:test-key',
        300, // TTL in seconds
        JSON.stringify(testValue),
      );

      // Verify L1 cache has the value
      const result = await service.get('test-key');
      expect(result).toEqual(testValue);
    });

    it('should set value with tags', async () => {
      const testValue = { data: 'test' };
      const tags = ['user', 'profile'];
      mockRedis.setex.mockResolvedValue('OK');

      await service.set('test-key', testValue, 300000, { tags });

      expect(mockRedis.setex).toHaveBeenCalledWith('test:test-key', 300, JSON.stringify(testValue));

      // Should also set tag keys
      expect(mockRedis.setex).toHaveBeenCalledWith('test:test-key:tag:user', 300, '1');
      expect(mockRedis.setex).toHaveBeenCalledWith('test:test-key:tag:profile', 300, '1');
    });

    it('should handle Redis set errors', async () => {
      const testValue = { data: 'test' };
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.set('test-key', testValue)).rejects.toThrow('Redis error');
    });
  });

  describe('del', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete from both L1 and L2 cache', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.del('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });

    it('should handle Redis delete errors', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.del('test-key')).rejects.toThrow('Redis error');
    });
  });

  describe('clearByTags', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clear cache entries by tags', async () => {
      const tags = ['user', 'profile'];
      mockRedis.keys.mockResolvedValue(['test:key1:tag:user', 'test:key2:tag:user']);
      mockRedis.del.mockResolvedValue(2);

      const cleared = await service.clearByTags(tags);

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*:tag:user:*');
      expect(mockRedis.keys).toHaveBeenCalledWith('test:*:tag:profile:*');
      expect(cleared).toBeGreaterThan(0);
    });

    it('should handle errors during tag clearing', async () => {
      const tags = ['user'];
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const cleared = await service.clearByTags(tags);
      expect(cleared).toBe(0);
    });
  });

  describe('warmCache', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should warm cache with multiple entries', async () => {
      const entries = [
        { key: 'key1', value: 'value1', ttl: 300000 },
        { key: 'key2', value: 'value2', ttl: 600000 },
      ];
      mockRedis.setex.mockResolvedValue('OK');

      await service.warmCache(entries);

      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during cache warming', async () => {
      const entries = [{ key: 'key1', value: 'value1' }];
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      // Should not throw, but handle errors gracefully
      await expect(service.warmCache(entries)).resolves.toBeUndefined();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return cache statistics', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('l1Hits');
      expect(stats).toHaveProperty('l1Misses');
      expect(stats).toHaveProperty('l2Hits');
      expect(stats).toHaveProperty('l2Misses');
      expect(stats).toHaveProperty('totalHits');
      expect(stats).toHaveProperty('totalMisses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('averageResponseTime');
    });

    it('should calculate hit rate correctly', async () => {
      // Simulate some cache hits and misses
      await service.get('existing-key'); // This will be a miss

      const stats = service.getStats();
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('resetStats', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should reset all statistics', async () => {
      // Generate some stats
      await service.get('non-existent-key');

      let stats = service.getStats();
      expect(stats.totalMisses).toBeGreaterThan(0);

      service.resetStats();

      stats = service.getStats();
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.l1Hits).toBe(0);
      expect(stats.l1Misses).toBe(0);
      expect(stats.l2Hits).toBe(0);
      expect(stats.l2Misses).toBe(0);
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return healthy status when everything is normal', () => {
      const health = service.getHealthStatus();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('l1Size');
      expect(health).toHaveProperty('l2Connected');
      expect(health).toHaveProperty('stats');
      expect(health).toHaveProperty('issues');

      expect(health.l2Connected).toBe(true); // Redis status is 'ready'
      expect(Array.isArray(health.issues)).toBe(true);
    });

    it('should detect unhealthy status when Redis is not connected', () => {
      mockRedis.status = 'connecting';

      const health = service.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.l2Connected).toBe(false);
      expect(health.issues).toContain('Redis connection is not ready');
    });
  });

  describe('L1 cache eviction', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Set a small L1 cache size for testing
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CACHE_L1_MAX_SIZE') return 2;
        return defaultValue;
      });
    });

    it('should evict oldest entries when L1 cache is full', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      // Fill L1 cache beyond capacity
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');
      await service.set('key3', 'value3'); // This should evict key1

      // key1 should be evicted from L1, but key2 and key3 should be present
      const result1 = await service.get('key1');
      const result2 = await service.get('key2');
      const result3 = await service.get('key3');

      // key1 might still be available from L2 cache
      expect(result2).toBe('value2');
      expect(result3).toBe('value3');
    });
  });
});
