import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueConfigService, QueueType, JobPriority } from './queue.config';

describe('QueueConfigService', () => {
  let service: QueueConfigService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<QueueConfigService>(QueueConfigService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getRedisConnection', () => {
    it('should return default Redis connection config', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_DB: 0,
        };
        return config[key] || defaultValue;
      });

      const connection = service.getRedisConnection();

      expect(connection).toEqual({
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxLoadingTimeout: 5000,
        lazyConnect: true,
      });
    });

    it('should return custom Redis connection config', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'redis.example.com',
          REDIS_PORT: 6380,
          REDIS_PASSWORD: 'secret',
          REDIS_DB: 1,
        };
        return config[key] || defaultValue;
      });

      const connection = service.getRedisConnection();

      expect(connection).toEqual({
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        db: 1,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxLoadingTimeout: 5000,
        lazyConnect: true,
      });
    });
  });

  describe('getQueueOptions', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_DB: 0,
          QUEUE_CONCURRENCY: 5,
        };
        return config[key] || defaultValue;
      });
    });

    it('should return email queue options', () => {
      const options = service.getQueueOptions(QueueType.EMAIL);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
    });

    it('should return sync queue options', () => {
      const options = service.getQueueOptions(QueueType.SYNC);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        delay: 1000,
      });
    });

    it('should return AI enrichment queue options', () => {
      const options = service.getQueueOptions(QueueType.AI_ENRICHMENT);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 10000,
        },
      });
    });

    it('should return webhook queue options', () => {
      const options = service.getQueueOptions(QueueType.WEBHOOK);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
    });

    it('should return cleanup queue options with cron schedule', () => {
      const options = service.getQueueOptions(QueueType.CLEANUP);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 1,
        repeat: {
          pattern: '0 2 * * *',
        },
      });
    });

    it('should return analytics queue options', () => {
      const options = service.getQueueOptions(QueueType.ANALYTICS);

      expect(options.defaultJobOptions).toMatchObject({
        removeOnComplete: 100,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'linear',
          delay: 5000,
        },
      });
    });
  });

  describe('getWorkerOptions', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          QUEUE_CONCURRENCY: 5,
          QUEUE_MAX_MEMORY_MB: 100,
        };
        return config[key] || defaultValue;
      });
    });

    it('should return worker options with default concurrency', () => {
      const options = service.getWorkerOptions(QueueType.EMAIL);

      expect(options).toMatchObject({
        concurrency: 5,
        maxStalledCount: 3,
        stalledInterval: 30000,
        maxMemoryUsage: 100 * 1024 * 1024,
      });
    });

    it('should return worker options with custom concurrency for sync queue', () => {
      const options = service.getWorkerOptions(QueueType.SYNC);

      expect(options.concurrency).toBe(3); // defaultConcurrency - 2
    });

    it('should return worker options with single concurrency for cleanup queue', () => {
      const options = service.getWorkerOptions(QueueType.CLEANUP);

      expect(options.concurrency).toBe(1);
    });
  });

  describe('calculateJobDelay', () => {
    it('should return 0 delay for critical priority', () => {
      const delay = service.calculateJobDelay(JobPriority.CRITICAL, 'free', 0.5);
      expect(delay).toBe(0);
    });

    it('should return 0 delay for high priority premium user', () => {
      const delay = service.calculateJobDelay(JobPriority.HIGH, 'premium', 0.5);
      expect(delay).toBe(0);
    });

    it('should return 500ms delay for high priority free user', () => {
      const delay = service.calculateJobDelay(JobPriority.HIGH, 'free', 0.5);
      expect(delay).toBe(500);
    });

    it('should return 2000ms delay for normal priority free user', () => {
      const delay = service.calculateJobDelay(JobPriority.NORMAL, 'free', 0.5);
      expect(delay).toBe(2000);
    });

    it('should return 500ms delay for normal priority premium user', () => {
      const delay = service.calculateJobDelay(JobPriority.NORMAL, 'premium', 0.5);
      expect(delay).toBe(500);
    });

    it('should return 0 delay for normal priority enterprise user', () => {
      const delay = service.calculateJobDelay(JobPriority.NORMAL, 'enterprise', 0.5);
      expect(delay).toBe(0);
    });

    it('should add delay for high system load', () => {
      const normalDelay = service.calculateJobDelay(JobPriority.NORMAL, 'free', 0.5);
      const highLoadDelay = service.calculateJobDelay(JobPriority.NORMAL, 'free', 0.9);

      expect(highLoadDelay).toBe(normalDelay + 5000);
    });

    it('should add delay for medium system load', () => {
      const normalDelay = service.calculateJobDelay(JobPriority.NORMAL, 'free', 0.5);
      const mediumLoadDelay = service.calculateJobDelay(JobPriority.NORMAL, 'free', 0.7);

      expect(mediumLoadDelay).toBe(normalDelay + 2000);
    });
  });

  describe('getEnhancedJobOptions', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        };
        return config[key] || defaultValue;
      });
    });

    it('should return enhanced job options with default values', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL);

      expect(options).toMatchObject({
        priority: JobPriority.NORMAL,
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
      });
      expect(options.delay).toBeGreaterThanOrEqual(0);
    });

    it('should return enhanced job options with custom priority', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        priority: JobPriority.HIGH,
        userTier: 'premium',
      });

      expect(options.priority).toBe(JobPriority.HIGH);
      expect(options.delay).toBe(0); // High priority premium user
    });

    it('should apply exponential retry strategy', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        retryStrategy: 'exponential',
      });

      expect(options.backoff).toEqual({
        type: 'exponential',
        delay: 2000,
      });
    });

    it('should apply linear retry strategy', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        retryStrategy: 'linear',
      });

      expect(options.backoff).toEqual({
        type: 'fixed',
        delay: 5000,
      });
    });

    it('should apply fixed retry strategy', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        retryStrategy: 'fixed',
      });

      expect(options.backoff).toEqual({
        type: 'fixed',
        delay: 3000,
      });
    });

    it('should apply custom max retries', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        maxRetries: 5,
      });

      expect(options.attempts).toBe(5);
    });

    it('should generate job ID when timeout is specified', () => {
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        timeout: 30000,
      });

      expect(options.jobId).toBeDefined();
      expect(typeof options.jobId).toBe('string');
    });

    it('should use custom delay when provided', () => {
      const customDelay = 10000;
      const options = service.getEnhancedJobOptions(QueueType.EMAIL, {
        delay: customDelay,
      });

      expect(options.delay).toBe(customDelay);
    });
  });

  describe('edge cases', () => {
    it('should handle missing config values gracefully', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const connection = service.getRedisConnection();
      expect(connection.host).toBe('localhost');
      expect(connection.port).toBe(6379);
    });

    it('should handle invalid queue type gracefully', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => defaultValue);

      const options = service.getQueueOptions('invalid' as QueueType);
      expect(options.connection).toBeDefined();
      expect(options.defaultJobOptions).toBeDefined();
    });

    it('should handle extreme system load values', () => {
      const delay1 = service.calculateJobDelay(JobPriority.NORMAL, 'free', -0.5);
      const delay2 = service.calculateJobDelay(JobPriority.NORMAL, 'free', 1.5);

      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeGreaterThan(delay1);
    });
  });
});
