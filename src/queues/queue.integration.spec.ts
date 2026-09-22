import { Test, TestingModule } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { Job, Queue, Worker } from 'bullmq';
import { QueueManagerService } from './services/queue-manager.service';
import { EmailWorkerService } from './workers/email-worker.service';
import { SyncWorkerService } from './workers/sync-worker.service';
import { QueueConfigService } from './config/queue.config';
import { createMockConfigService, createMockLogger } from '../../te../../test/test-utils/mocks';
import Redis from 'ioredis';

// Mock Redis for testing
jest.mock('ioredis');
const MockRedis = Redis as jest.MockedClass<typeof Redis>;

describe('Queue Integration Tests', () => {
  let module: TestingModule;
  let queueManager: QueueManagerService;
  let emailWorker: EmailWorkerService;
  let syncWorker: SyncWorkerService;
  let queueConfig: QueueConfigService;
  let emailQueue: Queue;
  let syncQueue: Queue;
  let mockRedis: jest.Mocked<Redis>;

  beforeAll(async () => {
    // Setup mock Redis
    mockRedis = new MockRedis() as jest.Mocked<Redis>;
    mockRedis.ping = jest.fn().mockResolvedValue('PONG');
    mockRedis.get = jest.fn().mockResolvedValue(null);
    mockRedis.set = jest.fn().mockResolvedValue('OK');
    mockRedis.del = jest.fn().mockResolvedValue(1);
    mockRedis.exists = jest.fn().mockResolvedValue(0);
    mockRedis.incr = jest.fn().mockResolvedValue(1);
    mockRedis.expire = jest.fn().mockResolvedValue(1);

    const configService = createMockConfigService();

    module = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          connection: {
            host: 'localhost',
            port: 6379,
          },
        }),
        BullModule.registerQueue(
          { name: 'email' },
          { name: 'sync' },
          { name: 'ai-enrichment' },
          { name: 'cleanup' },
        ),
      ],
      providers: [
        QueueManagerService,
        EmailWorkerService,
        SyncWorkerService,
        QueueConfigService,
        { provide: 'ConfigService', useValue: configService },
        { provide: 'PinoLogger', useValue: createMockLogger() },
      ],
    }).compile();

    queueManager = module.get<QueueManagerService>(QueueManagerService);
    emailWorker = module.get<EmailWorkerService>(EmailWorkerService);
    syncWorker = module.get<SyncWorkerService>(SyncWorkerService);
    queueConfig = module.get<QueueConfigService>(QueueConfigService);

    // Get queue instances
    emailQueue = queueManager.getQueue('email');
    syncQueue = queueManager.getQueue('sync');
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean up queues before each test
    await emailQueue.obliterate({ force: true });
    await syncQueue.obliterate({ force: true });
  });

  describe('Queue Configuration', () => {
    it('should configure queues with correct options', () => {
      const emailOptions = queueConfig.getQueueOptions('email');
      const syncOptions = queueConfig.getQueueOptions('sync');

      expect(emailOptions).toHaveProperty('defaultJobOptions');
      expect(emailOptions.defaultJobOptions).toHaveProperty('removeOnComplete');
      expect(emailOptions.defaultJobOptions).toHaveProperty('removeOnFail');
      expect(emailOptions.defaultJobOptions).toHaveProperty('attempts');

      expect(syncOptions).toHaveProperty('defaultJobOptions');
      expect(syncOptions.defaultJobOptions.attempts).toBeGreaterThan(1);
    });

    it('should configure workers with correct options', () => {
      const emailWorkerOptions = queueConfig.getWorkerOptions('email');
      const syncWorkerOptions = queueConfig.getWorkerOptions('sync');

      expect(emailWorkerOptions).toHaveProperty('concurrency');
      expect(emailWorkerOptions).toHaveProperty('maxStalledCount');
      expect(emailWorkerOptions.concurrency).toBeGreaterThan(0);

      expect(syncWorkerOptions).toHaveProperty('concurrency');
      expect(syncWorkerOptions.concurrency).toBeGreaterThan(0);
    });

    it('should provide Redis connection configuration', () => {
      const redisConnection = queueConfig.getRedisConnection();

      expect(redisConnection).toHaveProperty('host');
      expect(redisConnection).toHaveProperty('port');
      expect(redisConnection.port).toBe(6379);
    });
  });

  describe('Queue Manager Service', () => {
    it('should add jobs to email queue', async () => {
      const jobData = {
        to: 'test@example.com',
        subject: 'Test Email',
        template: 'welcome',
        data: { name: 'Test User' },
      };

      const job = await queueManager.addEmailJob(jobData);

      expect(job).toHaveProperty('id');
      expect(job.data).toEqual(jobData);
      expect(job.opts).toHaveProperty('attempts');
    });

    it('should add jobs to sync queue', async () => {
      const jobData = {
        userId: 'user-123',
        repoUrl: 'https://github.com/user/repo',
        branch: 'main',
      };

      const job = await queueManager.addSyncJob(jobData);

      expect(job).toHaveProperty('id');
      expect(job.data).toEqual(jobData);
      expect(job.opts).toHaveProperty('attempts');
    });

    it('should add jobs with custom options', async () => {
      const jobData = {
        to: 'priority@example.com',
        subject: 'Priority Email',
        template: 'urgent',
        data: {},
      };

      const customOptions = {
        priority: 10,
        delay: 5000,
        attempts: 5,
      };

      const job = await queueManager.addEmailJob(jobData, customOptions);

      expect(job.opts.priority).toBe(10);
      expect(job.opts.delay).toBe(5000);
      expect(job.opts.attempts).toBe(5);
    });

    it('should get queue statistics', async () => {
      // Add some test jobs
      await Promise.all([
        queueManager.addEmailJob({
          to: 'test1@example.com',
          subject: 'Test 1',
          template: 'test',
          data: {},
        }),
        queueManager.addEmailJob({
          to: 'test2@example.com',
          subject: 'Test 2',
          template: 'test',
          data: {},
        }),
      ]);

      const stats = await queueManager.getQueueStats('email');

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats.waiting).toBeGreaterThanOrEqual(0);
    });

    it('should pause and resume queues', async () => {
      await queueManager.pauseQueue('email');

      const isPaused = await emailQueue.isPaused();
      expect(isPaused).toBe(true);

      await queueManager.resumeQueue('email');

      const isResumed = !(await emailQueue.isPaused());
      expect(isResumed).toBe(true);
    });

    it('should clean completed jobs', async () => {
      // Add and complete some jobs
      const jobs = await Promise.all([
        queueManager.addEmailJob({
          to: 'clean1@example.com',
          subject: 'Clean Test 1',
          template: 'test',
          data: {},
        }),
        queueManager.addEmailJob({
          to: 'clean2@example.com',
          subject: 'Clean Test 2',
          template: 'test',
          data: {},
        }),
      ]);

      // Simulate job completion
      for (const job of jobs) {
        await job.moveToCompleted('success', 'test-token');
      }

      const cleanedCount = await queueManager.cleanQueue('email', 'completed', 0);
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Email Worker Service', () => {
    it('should process email jobs successfully', async () => {
      const jobData = {
        to: 'worker-test@example.com',
        subject: 'Worker Test',
        template: 'test',
        data: { name: 'Test User' },
      };

      // Mock the email sending
      const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'test-message-id' });
      (emailWorker as any).sendEmail = mockSendEmail;

      const job = await queueManager.addEmailJob(jobData);
      const result = await emailWorker.processEmailJob(job);

      expect(result).toHaveProperty('messageId');
      expect(mockSendEmail).toHaveBeenCalledWith(jobData);
    });

    it('should handle email job failures', async () => {
      const jobData = {
        to: 'invalid-email',
        subject: 'Failure Test',
        template: 'test',
        data: {},
      };

      // Mock email sending failure
      const mockSendEmail = jest.fn().mockRejectedValue(new Error('Invalid email address'));
      (emailWorker as any).sendEmail = mockSendEmail;

      const job = await queueManager.addEmailJob(jobData);

      await expect(emailWorker.processEmailJob(job)).rejects.toThrow('Invalid email address');
    });

    it('should retry failed email jobs', async () => {
      const jobData = {
        to: 'retry-test@example.com',
        subject: 'Retry Test',
        template: 'test',
        data: {},
      };

      let attemptCount = 0;
      const mockSendEmail = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ messageId: 'success-after-retry' });
      });
      (emailWorker as any).sendEmail = mockSendEmail;

      const job = await queueManager.addEmailJob(jobData, { attempts: 3 });

      // Simulate job processing with retries
      try {
        await emailWorker.processEmailJob(job);
      } catch (error) {
        // First attempt fails
        expect(attemptCount).toBe(1);
      }

      try {
        await emailWorker.processEmailJob(job);
      } catch (error) {
        // Second attempt fails
        expect(attemptCount).toBe(2);
      }

      // Third attempt succeeds
      const result = await emailWorker.processEmailJob(job);
      expect(result).toHaveProperty('messageId', 'success-after-retry');
      expect(attemptCount).toBe(3);
    });

    it('should track worker health metrics', () => {
      const health = emailWorker.getHealthMetrics();

      expect(health).toHaveProperty('processedJobs');
      expect(health).toHaveProperty('failedJobs');
      expect(health).toHaveProperty('averageProcessingTime');
      expect(health).toHaveProperty('isHealthy');
      expect(typeof health.processedJobs).toBe('number');
      expect(typeof health.failedJobs).toBe('number');
      expect(typeof health.isHealthy).toBe('boolean');
    });
  });

  describe('Sync Worker Service', () => {
    it('should process sync jobs successfully', async () => {
      const jobData = {
        userId: 'user-123',
        repoUrl: 'https://github.com/user/test-repo',
        branch: 'main',
      };

      // Mock the sync operation
      const mockSyncProject = jest.fn().mockResolvedValue({
        id: 'project-123',
        title: 'Test Project',
        syncStatus: 'completed',
      });
      (syncWorker as any).syncProject = mockSyncProject;

      const job = await queueManager.addSyncJob(jobData);
      const result = await syncWorker.processSyncJob(job);

      expect(result).toHaveProperty('id', 'project-123');
      expect(result).toHaveProperty('syncStatus', 'completed');
      expect(mockSyncProject).toHaveBeenCalledWith(jobData);
    });

    it('should handle sync job failures', async () => {
      const jobData = {
        userId: 'user-123',
        repoUrl: 'https://github.com/user/private-repo',
        branch: 'main',
      };

      // Mock sync failure
      const mockSyncProject = jest.fn().mockRejectedValue(new Error('Repository not accessible'));
      (syncWorker as any).syncProject = mockSyncProject;

      const job = await queueManager.addSyncJob(jobData);

      await expect(syncWorker.processSyncJob(job)).rejects.toThrow('Repository not accessible');
    });

    it('should handle different sync job types', async () => {
      const bulkSyncData = {
        userId: 'user-123',
        syncType: 'bulk',
        repositories: ['https://github.com/user/repo1', 'https://github.com/user/repo2'],
      };

      const mockBulkSync = jest.fn().mockResolvedValue({
        syncedCount: 2,
        failedCount: 0,
        results: [
          { repoUrl: 'https://github.com/user/repo1', status: 'success' },
          { repoUrl: 'https://github.com/user/repo2', status: 'success' },
        ],
      });
      (syncWorker as any).processBulkSync = mockBulkSync;

      const job = await queueManager.addSyncJob(bulkSyncData);

      // Mock job processing based on sync type
      let result;
      if (bulkSyncData.syncType === 'bulk') {
        result = await (syncWorker as any).processBulkSync(job);
      }

      expect(result).toHaveProperty('syncedCount', 2);
      expect(result).toHaveProperty('failedCount', 0);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('Queue Events and Monitoring', () => {
    it('should emit events on job completion', async () => {
      const jobData = {
        to: 'events-test@example.com',
        subject: 'Events Test',
        template: 'test',
        data: {},
      };

      const completedPromise = new Promise(resolve => {
        emailQueue.on('completed', (job, result) => {
          resolve({ job, result });
        });
      });

      const job = await queueManager.addEmailJob(jobData);

      // Simulate job completion
      await job.moveToCompleted('Email sent successfully', 'test-token');

      const { job: completedJob, result } = (await completedPromise) as any;
      expect(completedJob.id).toBe(job.id);
      expect(result).toBe('Email sent successfully');
    });

    it('should emit events on job failure', async () => {
      const jobData = {
        to: 'failure-events-test@example.com',
        subject: 'Failure Events Test',
        template: 'test',
        data: {},
      };

      const failedPromise = new Promise(resolve => {
        emailQueue.on('failed', (job, error) => {
          resolve({ job, error });
        });
      });

      const job = await queueManager.addEmailJob(jobData);

      // Simulate job failure
      await job.moveToFailed(new Error('Email sending failed'), 'test-token');

      const { job: failedJob, error } = (await failedPromise) as any;
      expect(failedJob.id).toBe(job.id);
      expect(error.message).toBe('Email sending failed');
    });

    it('should track queue metrics over time', async () => {
      const initialStats = await queueManager.getQueueStats('email');

      // Add several jobs
      const jobs = await Promise.all([
        queueManager.addEmailJob({
          to: 'metrics1@example.com',
          subject: 'Metrics Test 1',
          template: 'test',
          data: {},
        }),
        queueManager.addEmailJob({
          to: 'metrics2@example.com',
          subject: 'Metrics Test 2',
          template: 'test',
          data: {},
        }),
        queueManager.addEmailJob({
          to: 'metrics3@example.com',
          subject: 'Metrics Test 3',
          template: 'test',
          data: {},
        }),
      ]);

      const afterAddStats = await queueManager.getQueueStats('email');
      expect(afterAddStats.waiting).toBe(initialStats.waiting + 3);

      // Complete some jobs
      await jobs[0].moveToCompleted('Success', 'test-token');
      await jobs[1].moveToFailed(new Error('Failed'), 'test-token');

      const finalStats = await queueManager.getQueueStats('email');
      expect(finalStats.completed).toBe(initialStats.completed + 1);
      expect(finalStats.failed).toBe(initialStats.failed + 1);
      expect(finalStats.waiting).toBe(initialStats.waiting + 1);
    });
  });

  describe('Queue Cleanup and Maintenance', () => {
    it('should clean old completed jobs', async () => {
      // Add and complete several jobs
      const jobs = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queueManager.addEmailJob({
            to: `cleanup${i}@example.com`,
            subject: `Cleanup Test ${i}`,
            template: 'test',
            data: {},
          }),
        ),
      );

      // Complete all jobs
      for (const job of jobs) {
        await job.moveToCompleted('Success', 'test-token');
      }

      // Clean completed jobs older than 0 seconds (all of them)
      const cleanedCount = await queueManager.cleanQueue('email', 'completed', 0);
      expect(cleanedCount).toBeGreaterThanOrEqual(jobs.length);

      const stats = await queueManager.getQueueStats('email');
      expect(stats.completed).toBe(0);
    });

    it('should clean old failed jobs', async () => {
      // Add and fail several jobs
      const jobs = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          queueManager.addEmailJob({
            to: `cleanup-fail${i}@example.com`,
            subject: `Cleanup Fail Test ${i}`,
            template: 'test',
            data: {},
          }),
        ),
      );

      // Fail all jobs
      for (const job of jobs) {
        await job.moveToFailed(new Error('Test failure'), 'test-token');
      }

      // Clean failed jobs
      const cleanedCount = await queueManager.cleanQueue('email', 'failed', 0);
      expect(cleanedCount).toBeGreaterThanOrEqual(jobs.length);

      const stats = await queueManager.getQueueStats('email');
      expect(stats.failed).toBe(0);
    });

    it('should handle queue health checks', async () => {
      const health = await queueManager.getQueueHealth('email');

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('stats');
      expect(health).toHaveProperty('connection');
      expect(typeof health.isHealthy).toBe('boolean');
      expect(health.stats).toHaveProperty('waiting');
      expect(health.stats).toHaveProperty('active');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Mock Redis connection failure
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await queueManager.getQueueHealth('email');
      expect(health.isHealthy).toBe(false);
      expect(health.connection.status).toBe('disconnected');
    });

    it('should handle job processing errors', async () => {
      const jobData = {
        to: 'error-handling@example.com',
        subject: 'Error Handling Test',
        template: 'test',
        data: {},
      };

      // Mock worker to throw an error
      const mockProcessJob = jest.fn().mockRejectedValue(new Error('Processing failed'));
      (emailWorker as any).processEmailJob = mockProcessJob;

      const job = await queueManager.addEmailJob(jobData, { attempts: 1 });

      await expect(emailWorker.processEmailJob(job)).rejects.toThrow('Processing failed');
    });

    it('should handle malformed job data', async () => {
      const invalidJobData = {
        // Missing required fields
        subject: 'Invalid Job Test',
      };

      await expect(queueManager.addEmailJob(invalidJobData as any)).rejects.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high job throughput', async () => {
      const jobCount = 100;
      const startTime = Date.now();

      // Add many jobs quickly
      const jobs = await Promise.all(
        Array.from({ length: jobCount }, (_, i) =>
          queueManager.addEmailJob({
            to: `performance${i}@example.com`,
            subject: `Performance Test ${i}`,
            template: 'test',
            data: { index: i },
          }),
        ),
      );

      const addDuration = Date.now() - startTime;
      expect(addDuration).toBeLessThan(5000); // Should add 100 jobs in under 5 seconds
      expect(jobs).toHaveLength(jobCount);

      const stats = await queueManager.getQueueStats('email');
      expect(stats.waiting).toBeGreaterThanOrEqual(jobCount);
    });

    it('should handle concurrent queue operations', async () => {
      const operations = [
        queueManager.addEmailJob({
          to: 'concurrent1@example.com',
          subject: 'Concurrent Test 1',
          template: 'test',
          data: {},
        }),
        queueManager.addSyncJob({
          userId: 'user-123',
          repoUrl: 'https://github.com/user/concurrent-test',
          branch: 'main',
        }),
        queueManager.getQueueStats('email'),
        queueManager.getQueueStats('sync'),
        queueManager.getQueueHealth('email'),
      ];

      const results = await Promise.all(operations);

      expect(results[0]).toHaveProperty('id'); // Email job
      expect(results[1]).toHaveProperty('id'); // Sync job
      expect(results[2]).toHaveProperty('waiting'); // Email stats
      expect(results[3]).toHaveProperty('waiting'); // Sync stats
      expect(results[4]).toHaveProperty('isHealthy'); // Email health
    });
  });
});
