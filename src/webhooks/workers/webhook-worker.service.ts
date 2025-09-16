import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WebhookHandlerService } from '../services/webhook-handler.service';
import { WebhookJobData } from '../types/webhook.types';
import { QueueType } from '../../queues/config/queue.config';

@Injectable()
@Processor(QueueType.WEBHOOK)
export class WebhookWorkerService extends WorkerHost {
  private readonly logger = new Logger(WebhookWorkerService.name);

  constructor(private readonly webhookHandler: WebhookHandlerService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<any> {
    const { data } = job;

    this.logger.debug(`Processing webhook job: ${data.platform}:${data.eventType}`, {
      jobId: job.id,
      eventId: data.eventId,
      repositoryUrl: data.repositoryUrl,
      retryCount: data.retryCount || 0,
    });

    try {
      const result = await this.webhookHandler.processWebhook(data);

      if (!result.success) {
        // If processing failed, throw error to trigger BullMQ retry mechanism
        throw new Error(result.error || 'Webhook processing failed');
      }

      this.logger.debug(`Successfully processed webhook job: ${data.platform}:${data.eventType}`, {
        jobId: job.id,
        eventId: data.eventId,
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to process webhook job: ${data.platform}:${data.eventType}`, {
        jobId: job.id,
        eventId: data.eventId,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      });

      throw error; // Re-throw to let BullMQ handle retries
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<WebhookJobData>) {
    this.logger.debug(`Webhook job completed: ${job.data.platform}:${job.data.eventType}`, {
      jobId: job.id,
      eventId: job.data.eventId,
      duration: job.processedOn ? job.processedOn - job.timestamp : 0,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData>, error: Error) {
    this.logger.error(`Webhook job failed: ${job.data.platform}:${job.data.eventType}`, {
      jobId: job.id,
      eventId: job.data.eventId,
      error: error instanceof Error ? error.message : String(error),
      attemptsMade: job.attemptsMade,
      attemptsTotal: job.opts.attempts,
    });
  }

  @OnWorkerEvent('active')
  onActive(job: Job<WebhookJobData>) {
    this.logger.debug(`Webhook job started: ${job.data.platform}:${job.data.eventType}`, {
      jobId: job.id,
      eventId: job.data.eventId,
    });
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Webhook job stalled: ${jobId}`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<WebhookJobData>, progress: number | object) {
    this.logger.debug(`Webhook job progress: ${job.data.platform}:${job.data.eventType}`, {
      jobId: job.id,
      eventId: job.data.eventId,
      progress,
    });
  }
}
