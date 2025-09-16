import { Test, TestingModule } from '@nestjs/testing';
import { HealthService, HealthStatus, SystemHealth } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getQueueToken } from '@nestjs/bull';
import { Cache } from 'cache-manager';
import { Queue } from 'bull';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: jest.Mocked<PrismaService>;
  let metricsService: jest.Mocked<MetricsService>;
  let cacheManager: jest.Mocked<Cache>;
  let syncQueue: jest.Mocked<Queue>;
  let emailQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const mockPrismaService = {
      $queryRaw: jest.fn(),
      user: {
        count: jest.fn(),
      },
    };

    const mockMetricsService = {
      updateSystemHealth: jest.fn(),
    };

    const mockCacheManager = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    const mockQueue = {
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: getQueueToken('sync'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('email'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get(PrismaService);
    metricsService = module.get(MetricsService);
    cacheManager = module.get(CACHE_MANAGER);
    syncQueue = module.get(getQueueToken('sync'));
    emailQueue = module.get(getQueueToken('email'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('checkDatabase', () => {
    it('should return healthy status when database is accessible', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      prismaService.user.count.mockResolvedValue(100);

      const result = await service.checkDatabase();

      expect(result.status).toBe('up');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.details).toEqual({
        userCount: 100,
        connectionPool: 'active',
      });
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('database', 1);
    });

    it('should return degraded status when database is slow', async () => {
      prismaService.$queryRaw.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 1500)),
      );
      prismaService.user.count.mockResolvedValue(100);

      const result = await service.checkDatabase();

      expect(result.status).toBe('degraded');
      expect(result.responseTime).toBeGreaterThan(1000);
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('database', 0.5);
    });

    it('should return down status when database is inaccessible', async () => {
      const error = new Error('Connection refused');
      prismaService.$queryRaw.mockRejectedValue(error);

      const result = await service.checkDatabase();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Connection refused');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('database', 0);
    });
  });

  describe('checkRedis', () => {
    it('should return healthy status when Redis is accessible', async () => {
      const testValue = Date.now().toString();
      cacheManager.set.mockResolvedValue(undefined);
      cacheManager.get.mockResolvedValue(testValue);
      cacheManager.del.mockResolvedValue(undefined);

      // Mock Date.now to return consistent value
      const mockNow = jest.spyOn(Date, 'now').mockReturnValue(12345);

      const result = await service.checkRedis();

      expect(result.status).toBe('up');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.details).toEqual({
        operation: 'read_write_test',
      });
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('redis', 1);

      mockNow.mockRestore();
    });

    it('should return down status when Redis read/write test fails', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      cacheManager.get.mockResolvedValue('wrong_value');

      const result = await service.checkRedis();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Redis read/write test failed');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('redis', 0);
    });

    it('should return down status when Redis throws error', async () => {
      const error = new Error('Redis connection failed');
      cacheManager.set.mockRejectedValue(error);

      const result = await service.checkRedis();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Redis connection failed');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('redis', 0);
    });
  });

  describe('checkQueues', () => {
    it('should return healthy status when queues are healthy', async () => {
      const mockJobs = {
        waiting: [],
        active: [],
        completed: Array(10).fill({}),
        failed: [],
      };

      syncQueue.getWaiting.mockResolvedValue(mockJobs.waiting);
      syncQueue.getActive.mockResolvedValue(mockJobs.active);
      syncQueue.getCompleted.mockResolvedValue(mockJobs.completed);
      syncQueue.getFailed.mockResolvedValue(mockJobs.failed);

      emailQueue.getWaiting.mockResolvedValue(mockJobs.waiting);
      emailQueue.getActive.mockResolvedValue(mockJobs.active);
      emailQueue.getCompleted.mockResolvedValue(mockJobs.completed);
      emailQueue.getFailed.mockResolvedValue(mockJobs.failed);

      const result = await service.checkQueues();

      expect(result.status).toBe('up');
      expect(result.details.syncQueue.healthy).toBe(true);
      expect(result.details.emailQueue.healthy).toBe(true);
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('queues', 1);
    });

    it('should return degraded status when queues have high failure rate', async () => {
      const mockJobs = {
        waiting: [],
        active: [],
        completed: Array(5).fill({}),
        failed: Array(5).fill({}), // 50% failure rate
      };

      syncQueue.getWaiting.mockResolvedValue(mockJobs.waiting);
      syncQueue.getActive.mockResolvedValue(mockJobs.active);
      syncQueue.getCompleted.mockResolvedValue(mockJobs.completed);
      syncQueue.getFailed.mockResolvedValue(mockJobs.failed);

      emailQueue.getWaiting.mockResolvedValue([]);
      emailQueue.getActive.mockResolvedValue([]);
      emailQueue.getCompleted.mockResolvedValue([]);
      emailQueue.getFailed.mockResolvedValue([]);

      const result = await service.checkQueues();

      expect(result.status).toBe('degraded');
      expect(result.details.syncQueue.healthy).toBe(false);
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('queues', 0.5);
    });

    it('should return down status when queue check throws error', async () => {
      const error = new Error('Queue connection failed');
      syncQueue.getWaiting.mockRejectedValue(error);

      const result = await service.checkQueues();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Queue connection failed');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('queues', 0);
    });
  });

  describe('checkExternalServices', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return healthy status for accessible external services', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await service.checkExternalServices();

      expect(result.github.status).toBe('up');
      expect(result.github.details.statusCode).toBe(200);
    });

    it('should return degraded status for external services with errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await service.checkExternalServices();

      expect(result.github.status).toBe('degraded');
      expect(result.github.error).toBe('HTTP 500: Internal Server Error');
    });

    it('should return down status when external service is unreachable', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.checkExternalServices();

      expect(result.github.status).toBe('down');
      expect(result.github.error).toBe('Network error');
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics', async () => {
      syncQueue.getWaiting.mockResolvedValue([]);
      syncQueue.getActive.mockResolvedValue([]);
      emailQueue.getWaiting.mockResolvedValue([]);
      emailQueue.getActive.mockResolvedValue([]);

      const result = await service.getSystemMetrics();

      expect(result).toEqual({
        cpuUsage: 0,
        memoryUsage: expect.any(Number),
        diskUsage: 0,
        activeConnections: 0,
        queueSize: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      });
    });

    it('should handle errors gracefully', async () => {
      syncQueue.getWaiting.mockRejectedValue(new Error('Queue error'));

      const result = await service.getSystemMetrics();

      expect(result).toEqual({
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        activeConnections: 0,
        queueSize: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      });
    });
  });

  describe('getOverallHealth', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      // Mock successful health checks
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      prismaService.user.count.mockResolvedValue(100);

      cacheManager.set.mockResolvedValue(undefined);
      cacheManager.get.mockImplementation(key => Promise.resolve(Date.now().toString()));
      cacheManager.del.mockResolvedValue(undefined);

      const mockJobs = {
        waiting: [],
        active: [],
        completed: Array(10).fill({}),
        failed: [],
      };

      syncQueue.getWaiting.mockResolvedValue(mockJobs.waiting);
      syncQueue.getActive.mockResolvedValue(mockJobs.active);
      syncQueue.getCompleted.mockResolvedValue(mockJobs.completed);
      syncQueue.getFailed.mockResolvedValue(mockJobs.failed);

      emailQueue.getWaiting.mockResolvedValue(mockJobs.waiting);
      emailQueue.getActive.mockResolvedValue(mockJobs.active);
      emailQueue.getCompleted.mockResolvedValue(mockJobs.completed);
      emailQueue.getFailed.mockResolvedValue(mockJobs.failed);
    });

    it('should return healthy status when all services are up', async () => {
      const result = await service.getOverallHealth();

      expect(result.status).toBe('healthy');
      expect(result.services.database.status).toBe('up');
      expect(result.services.redis.status).toBe('up');
      expect(result.services.queues.status).toBe('up');
      expect(result.services.github.status).toBe('up');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('overall', 1);
    });

    it('should return degraded status when some services are degraded', async () => {
      // Make database slow
      prismaService.$queryRaw.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 1500)),
      );

      const result = await service.getOverallHealth();

      expect(result.status).toBe('degraded');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('overall', 0.5);
    });

    it('should return unhealthy status when services are down', async () => {
      prismaService.$queryRaw.mockRejectedValue(new Error('Database down'));

      const result = await service.getOverallHealth();

      expect(result.status).toBe('unhealthy');
      expect(metricsService.updateSystemHealth).toHaveBeenCalledWith('overall', 0);
    });
  });

  describe('getHealthSummary', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      prismaService.user.count.mockResolvedValue(100);

      cacheManager.set.mockResolvedValue(undefined);
      cacheManager.get.mockImplementation(key => Promise.resolve(Date.now().toString()));
      cacheManager.del.mockResolvedValue(undefined);

      const mockJobs = {
        waiting: [],
        active: [],
        completed: Array(10).fill({}),
        failed: [],
      };

      [syncQueue, emailQueue].forEach(queue => {
        queue.getWaiting.mockResolvedValue(mockJobs.waiting);
        queue.getActive.mockResolvedValue(mockJobs.active);
        queue.getCompleted.mockResolvedValue(mockJobs.completed);
        queue.getFailed.mockResolvedValue(mockJobs.failed);
      });
    });

    it('should return health summary', async () => {
      const result = await service.getHealthSummary();

      expect(result).toEqual({
        status: 'healthy',
        checks: 4, // database, redis, queues, github
        healthy: 4,
        degraded: 0,
        down: 0,
      });
    });
  });

  describe('scaling recommendations', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      prismaService.user.count.mockResolvedValue(100);

      cacheManager.set.mockResolvedValue(undefined);
      cacheManager.get.mockImplementation(key => Promise.resolve(Date.now().toString()));
      cacheManager.del.mockResolvedValue(undefined);
    });

    it('should recommend scale up when queue size is high', async () => {
      const highQueueJobs = Array(600).fill({});
      syncQueue.getWaiting.mockResolvedValue(highQueueJobs);
      syncQueue.getActive.mockResolvedValue([]);
      syncQueue.getCompleted.mockResolvedValue([]);
      syncQueue.getFailed.mockResolvedValue([]);

      emailQueue.getWaiting.mockResolvedValue([]);
      emailQueue.getActive.mockResolvedValue([]);
      emailQueue.getCompleted.mockResolvedValue([]);
      emailQueue.getFailed.mockResolvedValue([]);

      const shouldScaleUp = await service.shouldScaleUp();
      const recommendation = await service.getScalingRecommendation();

      expect(shouldScaleUp).toBe(true);
      expect(recommendation.action).toBe('scale_up');
      expect(recommendation.reason).toContain('High resource usage or queue backlog detected');
    });

    it('should recommend scale down when resources are low', async () => {
      syncQueue.getWaiting.mockResolvedValue([]);
      syncQueue.getActive.mockResolvedValue([]);
      syncQueue.getCompleted.mockResolvedValue([]);
      syncQueue.getFailed.mockResolvedValue([]);

      emailQueue.getWaiting.mockResolvedValue([]);
      emailQueue.getActive.mockResolvedValue([]);
      emailQueue.getCompleted.mockResolvedValue([]);
      emailQueue.getFailed.mockResolvedValue([]);

      const shouldScaleDown = await service.shouldScaleDown();
      const recommendation = await service.getScalingRecommendation();

      expect(shouldScaleDown).toBe(true);
      expect(recommendation.action).toBe('scale_down');
      expect(recommendation.reason).toContain('Low resource usage detected');
    });

    it('should recommend maintain when resources are normal', async () => {
      const normalJobs = Array(50).fill({});
      syncQueue.getWaiting.mockResolvedValue(normalJobs);
      syncQueue.getActive.mockResolvedValue([]);
      syncQueue.getCompleted.mockResolvedValue([]);
      syncQueue.getFailed.mockResolvedValue([]);

      emailQueue.getWaiting.mockResolvedValue([]);
      emailQueue.getActive.mockResolvedValue([]);
      emailQueue.getCompleted.mockResolvedValue([]);
      emailQueue.getFailed.mockResolvedValue([]);

      const recommendation = await service.getScalingRecommendation();

      expect(recommendation.action).toBe('maintain');
      expect(recommendation.reason).toContain('System operating within normal parameters');
    });
  });
});
