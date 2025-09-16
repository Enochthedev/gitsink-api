import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from './projects.service';

@Injectable()
export class SyncQueueService {
  private readonly logger = new Logger(SyncQueueService.name);
  private queue!: Queue;
  private worker!: Worker;
  private deadLetterQueue!: Queue;

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {
    this.initializeQueues();
    this.initializeWorker();
  }

  private initializeQueues() {
    const redisConnection = {
      url: this.config.get<string>('REDIS_URL'),
      maxRetriesPerRequest: null, // Critical: Must be null for BullMQ
    };

    // Main sync queue
    this.queue = new Queue('sync', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Dead letter queue for failed jobs
    this.deadLetterQueue = new Queue('sync-dead-letter', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: false, // Keep failed jobs for analysis
      },
    });
  }

  private initializeWorker() {
    this.worker = new Worker(
      'sync',
      async job => {
        const { userId, repoUrl, branch } = job.data;
        const jobId = job.id;
        const attemptNumber = job.attemptsMade + 1;

        this.logger.log(`Processing sync job ${jobId} (attempt ${attemptNumber})`, {
          userId,
          repoUrl,
          branch,
          jobId,
          attemptNumber,
        });

        try {
          const result = await this.projectsService.syncProjectFromGitHub(userId, repoUrl, branch);

          this.logger.log(`Sync job ${jobId} completed successfully`, {
            userId,
            repoUrl,
            projectId: result.id,
            jobId,
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          this.logger.error(`Sync job ${jobId} failed (attempt ${attemptNumber})`, {
            userId,
            repoUrl,
            branch,
            jobId,
            attemptNumber,
            error: errorMessage,
            maxAttempts: job.opts.attempts,
          });

          // If this is the final attempt, move to dead letter queue
          if (attemptNumber >= (job.opts.attempts || 3)) {
            await this.moveToDeadLetterQueue(job, error);
          }

          throw error; // Re-throw to let BullMQ handle retries
        }
      },
      {
        connection: {
          url: this.config.get<string>('REDIS_URL'),
          maxRetriesPerRequest: null, // Critical: Must be null for BullMQ
        },
        concurrency: 5, // Process up to 5 jobs concurrently
        settings: {},
      },
    );

    // Set up event listeners for monitoring
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.worker.on('completed', job => {
      this.logger.debug(`Job ${job.id} completed`, {
        jobId: job.id,
        duration: job.processedOn ? job.processedOn - job.timestamp : 0,
      });
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job ${job?.id} failed`, {
        jobId: job?.id,
        error: err.message,
        attemptsMade: job?.attemptsMade,
        attemptsTotal: job?.opts.attempts,
      });
    });

    this.worker.on('stalled', jobId => {
      this.logger.warn(`Job ${jobId} stalled`);
    });

    this.worker.on('error', err => {
      this.logger.error('Worker error:', err);
    });
  }

  async addJob(
    userId: string,
    repoUrl: string,
    branch?: string,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ) {
    const jobData = { userId, repoUrl, branch: branch || 'main' };
    const jobOptions = {
      jobId: `${userId}:${Buffer.from(repoUrl).toString('base64')}`, // Use base64 to handle special chars
      priority: options?.priority || 0,
      delay: options?.delay || 0,
      attempts: options?.attempts || 3,
      ...this.queue.opts.defaultJobOptions,
    };

    try {
      const job = await this.queue.add('sync', jobData, jobOptions);

      this.logger.log(`Sync job queued`, {
        jobId: job.id,
        userId,
        repoUrl,
        branch,
        priority: jobOptions.priority,
        delay: jobOptions.delay,
      });

      return job;
    } catch (error) {
      this.logger.error(`Failed to queue sync job`, {
        userId,
        repoUrl,
        branch,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async moveToDeadLetterQueue(job: any, error: any) {
    try {
      await this.deadLetterQueue.add(
        'failed-sync',
        {
          originalJobId: job.id,
          originalJobData: job.data,
          failureReason: error instanceof Error ? error.message : String(error),
          failureStack: error instanceof Error ? error.stack : undefined,
          attemptsMade: job.attemptsMade,
          failedAt: new Date(),
        },
        {
          priority: 1, // Low priority for dead letter processing
        },
      );

      this.logger.warn(`Job ${job.id} moved to dead letter queue`, {
        jobId: job.id,
        userId: job.data.userId,
        repoUrl: job.data.repoUrl,
        failureReason: error instanceof Error ? error.message : String(error),
      });
    } catch (dlqError) {
      this.logger.error(`Failed to move job ${job.id} to dead letter queue`, {
        jobId: job.id,
        error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      });
    }
  }

  async retryFailedJob(jobId: string): Promise<boolean> {
    try {
      // Get job from dead letter queue
      const deadLetterJob = await this.deadLetterQueue.getJob(jobId);
      if (!deadLetterJob) {
        this.logger.warn(`Dead letter job ${jobId} not found`);
        return false;
      }

      const originalData = deadLetterJob.data.originalJobData;

      // Re-queue the original job
      await this.addJob(
        originalData.userId,
        originalData.repoUrl,
        originalData.branch,
        { attempts: 1 }, // Single retry attempt
      );

      // Remove from dead letter queue
      await deadLetterJob.remove();

      this.logger.log(`Dead letter job ${jobId} retried`, {
        originalJobId: deadLetterJob.data.originalJobId,
        userId: originalData.userId,
        repoUrl: originalData.repoUrl,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to retry dead letter job ${jobId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getQueueStats() {
    try {
      const [queueCounts, deadLetterCounts] = await Promise.all([
        this.queue.getJobCounts(),
        this.deadLetterQueue.getJobCounts(),
      ]);

      return {
        main: queueCounts,
        deadLetter: deadLetterCounts,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        main: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        deadLetter: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        },
      };
    }
  }

  async cleanup() {
    try {
      // Clean up old completed jobs
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      await Promise.all([
        this.queue.clean(oneDayAgo, 100, 'completed'),
        this.queue.clean(oneDayAgo, 50, 'failed'),
      ]);

      this.logger.debug('Queue cleanup completed');
    } catch (error) {
      this.logger.error('Queue cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async close() {
    try {
      await Promise.all([this.worker?.close(), this.queue?.close(), this.deadLetterQueue?.close()]);
      this.logger.log('Sync queue service closed');
    } catch (error) {
      this.logger.error('Error closing sync queue service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
