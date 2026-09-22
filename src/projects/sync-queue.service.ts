import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from './projects.service';

@Injectable()
export class SyncQueueService {
  private readonly logger = new Logger(SyncQueueService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @InjectQueue('sync') private readonly queue: Queue,
    @InjectQueue('sync-dead-letter') private readonly deadLetterQueue: Queue,
  ) {}

  // Worker initialization removed to prevent duplicate processing and connection exhaustion.
  // Processing is handled by SyncWorkerService in QueuesModule.

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

      this.logger.log('Sync job queued', {
        jobId: job.id,
        userId,
        repoUrl,
        branch,
        priority: jobOptions.priority,
        delay: jobOptions.delay,
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to queue sync job', {
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
}
