import { Test, TestingModule } from '@nestjs/testing';
import { QueueManagerService } from './queue-manager.service';
import { JobPriority, QueueConfigService, QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';
import { Job, Queue, QueueEvents } from 'bullmq';

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    addBulk: jest.fn(),
    getWaiting: jest.fn(),
    getActive: jest.fn(),
    getCompleted: jest.fn(),
    getFailed: jest.fn(),
    getDelayed: jest.fn(),
    isPaused: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    clean: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('QueueManagerService', () => {
  let service: QueueManagerService;
  let queueConfig: QueueConfigService;
  let metricsService: MetricsService;
  let mockQueue: jest.Mocked<Queue>;
  let mockQueueEvents: jest.Mocked<QueueEvents>;

  const mockQueueConfig = {
    getQueueOptions: jest.fn(),
    getEnhancedJobOptions: jest.fn(),
    calculateJobDelay: jest.fn(),
  };

  const mockMetricsService = {
    recordQueueJob: jest.fn(),
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockQueue = new Queue('test') as jest.Mocked<Queue>;
    mockQueueEvents = new QueueEvents('test') as jest.Mocked<QueueEvents>;

    (Queue as jest.Mock).mockImplementation(() => mockQueue);
    (QueueEvents as jest.Mock).mockImplementation(() => mockQueueEvents);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueManagerService,
        {
          provide: QueueConfigService,
          useValue: mockQueueConfig,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<QueueManagerService>(QueueManagerService);
    queueConfig = module.get<QueueConfigService>(QueueConfigService);
    metricsService = module.get<MetricsService>(MetricsService);

    // Setup default mock returns
    mockQueueConfig.getQueueOptions.mockReturnValue({
      connection: { host: 'localhost', port: 6379 },
      defaultJobOptions: { attempts: 3 },
    });

    mockQueueConfig.getEnhancedJobOptions.mockReturnValue({
      attempts: 3,
      priority: JobPriority.NORMAL,
      delay: 1000,
    });

    mockQueueConfig.calculateJobDelay.mockReturnValue(1000);
  });

  describe('onModuleInit', () => {
    it('should initialize all queues successfully', async () => {
      await service.onModuleInit();

      expect(Queue).toHaveBeenCalledTimes(Object.values(QueueType).length);
      expect(QueueEvents).toHaveBeenCalledTimes(Object.values(QueueType).length);
    });

    it('should setup event listeners for each queue', async () => {
      await service.onModuleInit();

      expect(mockQueueEvents.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueEvents.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueueEvents.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(mockQueueEvents.on).toHaveBeenCalledWith('progress', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('addJob', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should add a job successfully', async () => {
      const mockJob = { id: '123', name: 'test-job' } as Job;
      mockQueue.add.mockResolvedValue(mockJob);

      const result = await service.addJob(QueueType.EMAIL, 'test-job', {
        email: 'test@example.com',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'test-job',
        { email: 'test@example.com' },
        expect.objectContaining({
          attempts: 3,
          priority: JobPriority.NORMAL,
        }),
      );
      expect(result).toBe(mockJob);
      expect(mockMetricsService.recordQueueJob).toHaveBeenCalledWith(QueueType.EMAIL, 'added', 0);
    });

    it('should add a job with custom options', async () => {
      const mockJob = { id: '123', name: 'test-job' } as Job;
      mockQueue.add.mockResolvedValue(mockJob);

      const customOptions = {
        priority: JobPriority.HIGH,
        userTier: 'premium' as const,
        maxRetries: 5,
      };

      mockQueueConfig.getEnhancedJobOptions.mockReturnValue({
        attempts: 5,
        priority: JobPriority.HIGH,
        delay: 0,
      });

      await service.addJob(
        QueueType.EMAIL,
        'test-job',
        { email: 'test@example.com' },
        customOptions,
      );

      expect(mockQueueConfig.getEnhancedJobOptions).toHaveBeenCalledWith(
        QueueType.EMAIL,
        expect.objectContaining(customOptions),
      );
    });

    it('should throw error for non-existent queue', async () => {
      await expect(service.addJob('non-existent' as QueueType, 'test-job', {})).rejects.toThrow(
        'Queue non-existent not found',
      );
    });

    it('should handle queue add errors', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(
        service.addJob(QueueType.EMAIL, 'test-job', {
          email: 'test@example.com',
        }),
      ).rejects.toThrow('Queue error');
    });
  });

  describe('addBulkJobs', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should add bulk jobs successfully', async () => {
      const mockJobs = [
        { id: '1', name: 'job1' },
        { id: '2', name: 'job2' },
      ] as Job[];
      mockQueue.addBulk.mockResolvedValue(mockJobs);

      const jobs = [
        { name: 'job1', data: { email: 'test1@example.com' } },
        { name: 'job2', data: { email: 'test2@example.com' } },
      ];

      const result = await service.addBulkJobs(QueueType.EMAIL, jobs);

      expect(mockQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'job1',
          data: { email: 'test1@example.com' },
          opts: expect.objectContaining({ attempts: 3 }),
        },
        {
          name: 'job2',
          data: { email: 'test2@example.com' },
          opts: expect.objectContaining({ attempts: 3 }),
        },
      ]);
      expect(result).toBe(mockJobs);
      expect(mockMetricsService.recordQueueJob).toHaveBeenCalledWith(
        QueueType.EMAIL,
        'bulk_added',
        2,
      );
    });

    it('should handle bulk job errors', async () => {
      mockQueue.addBulk.mockRejectedValue(new Error('Bulk add error'));

      const jobs = [{ name: 'job1', data: { email: 'test@example.com' } }];

      await expect(service.addBulkJobs(QueueType.EMAIL, jobs)).rejects.toThrow('Bulk add error');
    });
  });

  describe('getQueueMetrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return queue metrics successfully', async () => {
      mockQueue.getWaiting.mockResolvedValue([{}, {}] as any[]);
      mockQueue.getActive.mockResolvedValue([{}] as any[]);
      mockQueue.getCompleted.mockResolvedValue([{}, {}, {}] as any[]);
      mockQueue.getFailed.mockResolvedValue([{}] as any[]);
      mockQueue.getDelayed.mockResolvedValue([{}, {}] as any[]);
      mockQueue.isPaused.mockResolvedValue(false);

      const metrics = await service.getQueueMetrics(QueueType.EMAIL);

      expect(metrics).toEqual({
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 1,
        delayed: 2,
        paused: 0,
      });
    });

    it('should handle paused queue', async () => {
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(true);

      const metrics = await service.getQueueMetrics(QueueType.EMAIL);

      expect(metrics.paused).toBe(1);
    });

    it('should throw error for non-existent queue', async () => {
      await expect(service.getQueueMetrics('non-existent' as QueueType)).rejects.toThrow(
        'Queue non-existent not found',
      );
    });
  });

  describe('getAllQueueMetrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return metrics for all queues', async () => {
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(false);

      const allMetrics = await service.getAllQueueMetrics();

      expect(Object.keys(allMetrics)).toEqual(Object.values(QueueType));

      for (const queueType of Object.values(QueueType)) {
        expect(allMetrics[queueType]).toEqual({
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        });
      }
    });

    it('should handle errors gracefully', async () => {
      mockQueue.getWaiting.mockRejectedValue(new Error('Metrics error'));

      const allMetrics = await service.getAllQueueMetrics();

      // Should still return metrics for all queues, with zeros for failed ones
      expect(Object.keys(allMetrics)).toEqual(Object.values(QueueType));
    });
  });

  describe('pauseQueue and resumeQueue', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should pause a queue successfully', async () => {
      await service.pauseQueue(QueueType.EMAIL);

      expect(mockQueue.pause).toHaveBeenCalled();
    });

    it('should resume a queue successfully', async () => {
      await service.resumeQueue(QueueType.EMAIL);

      expect(mockQueue.resume).toHaveBeenCalled();
    });

    it('should throw error for non-existent queue when pausing', async () => {
      await expect(service.pauseQueue('non-existent' as QueueType)).rejects.toThrow(
        'Queue non-existent not found',
      );
    });

    it('should throw error for non-existent queue when resuming', async () => {
      await expect(service.resumeQueue('non-existent' as QueueType)).rejects.toThrow(
        'Queue non-existent not found',
      );
    });
  });

  describe('cleanQueue', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clean a queue successfully', async () => {
      mockQueue.clean.mockResolvedValueOnce(5).mockResolvedValueOnce(3);

      await service.cleanQueue(QueueType.EMAIL, 24 * 60 * 60 * 1000, 100);

      expect(mockQueue.clean).toHaveBeenCalledTimes(2);
      expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 100, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 100, 'failed');
    });

    it('should handle clean errors', async () => {
      mockQueue.clean.mockRejectedValue(new Error('Clean error'));

      await expect(service.cleanQueue(QueueType.EMAIL, 24 * 60 * 60 * 1000, 100)).rejects.toThrow(
        'Clean error',
      );
    });
  });

  describe('getQueueHealth', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return healthy status for all queues', async () => {
      // Mock healthy metrics
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue(Array(100).fill({}));
      mockQueue.getFailed.mockResolvedValue(Array(5).fill({})); // 5% failure rate
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(false);

      const health = await service.getQueueHealth();

      expect(health.healthy).toBe(true);
      expect(Object.keys(health.queues)).toEqual(Object.values(QueueType));

      for (const queueHealth of Object.values(health.queues)) {
        expect(queueHealth.healthy).toBe(true);
      }
    });

    it('should return unhealthy status for queues with high failure rate', async () => {
      // Mock unhealthy metrics (high failure rate)
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue(Array(50).fill({}));
      mockQueue.getFailed.mockResolvedValue(Array(50).fill({})); // 50% failure rate
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(false);

      const health = await service.getQueueHealth();

      expect(health.healthy).toBe(false);
    });

    it('should return unhealthy status for paused queues', async () => {
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(true);

      const health = await service.getQueueHealth();

      expect(health.healthy).toBe(false);
    });

    it('should include system load in health report', async () => {
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.isPaused.mockResolvedValue(false);

      const health = await service.getQueueHealth();

      expect(health.systemLoad).toBeDefined();
      expect(health.systemLoad).toHaveProperty('cpu');
      expect(health.systemLoad).toHaveProperty('memory');
      expect(health.systemLoad).toHaveProperty('queueLoad');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close all queues and events', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockQueue.close).toHaveBeenCalled();
      expect(mockQueueEvents.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      await service.onModuleInit();

      mockQueue.close.mockRejectedValue(new Error('Close error'));
      mockQueueEvents.close.mockRejectedValue(new Error('Close error'));

      // Should not throw
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
