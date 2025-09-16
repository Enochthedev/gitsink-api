import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { IWebhookQueue } from '../interfaces/webhook.interface';
import { WebhookJobData, WebhookProcessingOptions } from '../types/webhook.types';
import { QueueType } from '../../queues/config/queue.config';

@Injectable()
export class WebhookQueueService implements IWebhookQueue {
  private readonly logger = new Logger(WebhookQueueService.name);

  constructor(@InjectQueue(QueueType.WEBHOOK) private readonly webhookQueue: Queue) {}

  async addJob(jobData: WebhookJobData, options: WebhookProcessingOptions = {}): Promise<void> {
    try {
      const jobOptions = this.buildJobOptions(options);

      await this.webhookQueue.add(
        'webhook-process',
        {
          ...jobData,
          retryCount: jobData.retryCount || 0,
        },
        jobOptions,
      );

      this.logger.debug(`Queued webhook job for ${jobData.platform}:${jobData.eventType}`, {
        eventId: jobData.eventId,
        repositoryUrl: jobData.repositoryUrl,
        priority: options.priority,
        delay: options.delay,
      });
    } catch (error) {
      this.logger.error('Failed to add webhook job to queue:', error);
      throw error;
    }
  }

  async processJobs(): Promise<void> {
    // This method is handled by the webhook worker
    // Just log that processing is active
    this.logger.debug('Webhook queue processing is active');
  }

  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    activeJobs: number;
    waitingJobs: number;
    failedJobs: number;
  }> {
    try {
      const [activeJobs, waitingJobs, failedJobs] = await Promise.all([
        this.webhookQueue.getActive(),
        this.webhookQueue.getWaiting(),
        this.webhookQueue.getFailed(),
      ]);

      const isHealthy = failedJobs.length < 100; // Consider unhealthy if too many failed jobs

      return {
        isHealthy,
        activeJobs: activeJobs.length,
        waitingJobs: waitingJobs.length,
        failedJobs: failedJobs.length,
      };
    } catch (error) {
      this.logger.error('Failed to get webhook queue health status:', error);
      return {
        isHealthy: false,
        activeJobs: 0,
        waitingJobs: 0,
        failedJobs: 0,
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up completed jobs older than 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      await this.webhookQueue.clean(oneDayAgo, 100, 'completed');
      await this.webhookQueue.clean(oneDayAgo, 50, 'failed');

      this.logger.debug('Webhook queue cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup webhook queue:', error);
      throw error;
    }
  }

  /**
   * Add retry job for failed webhook
   */
  async addRetryJob(jobData: WebhookJobData, retryDelay: number): Promise<void> {
    try {
      await this.webhookQueue.add(
        'webhook-retry',
        {
          ...jobData,
          retryCount: (jobData.retryCount || 0) + 1,
        },
        {
          delay: retryDelay,
          attempts: 1, // Retry jobs should not be retried again
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );

      this.logger.debug(`Queued webhook retry job for ${jobData.platform}:${jobData.eventType}`, {
        eventId: jobData.eventId,
        retryCount: (jobData.retryCount || 0) + 1,
        retryDelay,
      });
    } catch (error) {
      this.logger.error('Failed to add webhook retry job to queue:', error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    try {
      return await this.webhookQueue.getJob(jobId);
    } catch (error) {
      this.logger.error(`Failed to get job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Remove job by ID
   */
  async removeJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to remove job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const counts = await this.webhookQueue.getJobCounts();
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get queue statistics:', error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  private buildJobOptions(options: WebhookProcessingOptions) {
    const priority = this.getPriorityValue(options.priority || 'normal');

    return {
      priority,
      delay: options.delay || 0,
      attempts: options.maxRetries || 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
      jobId: options.immediate ? undefined : `webhook-${Date.now()}-${Math.random()}`,
    };
  }

  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    const priorityMap = {
      low: 1,
      normal: 5,
      high: 10,
    };
    return priorityMap[priority];
  }
}
