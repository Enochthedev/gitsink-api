import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SyncJobData, WebhookSyncService } from '../services/webhook-sync.service';
import { QueueType } from '../../queues/config/queue.config';

@Injectable()
@Processor(QueueType.WEBHOOK)
export class WebhookSyncWorkerService extends WorkerHost {
  private readonly logger = new Logger(WebhookSyncWorkerService.name);

  constructor(private readonly syncService: WebhookSyncService) {
    super();
  }

  async process(job: Job<{ payload: SyncJobData }>): Promise<any> {
    const { payload: syncData } = job.data;

    this.logger.debug(`Processing sync job: ${syncData.platform}:${syncData.repositoryFullName}`, {
      jobId: job.id,
      eventId: syncData.eventId,
      repositoryUrl: syncData.repositoryUrl,
      branch: syncData.branch,
    });

    try {
      const result = await this.syncService.executeSyncOperation(syncData);

      if (!result.success) {
        // If sync failed, throw error to trigger BullMQ retry mechanism
        throw new Error(result.error || 'Sync operation failed');
      }

      this.logger.debug(
        `Successfully processed sync job: ${syncData.platform}:${syncData.repositoryFullName}`,
        {
          jobId: job.id,
          eventId: syncData.eventId,
          projectId: result.projectId,
          duration: result.duration,
        },
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process sync job: ${syncData.platform}:${syncData.repositoryFullName}`,
        {
          jobId: job.id,
          eventId: syncData.eventId,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Unknown error',
        },
      );

      throw error; // Re-throw to let BullMQ handle retries
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<{ payload: SyncJobData }>) {
    const { payload: syncData } = job.data;
    this.logger.debug(`Sync job completed: ${syncData.platform}:${syncData.repositoryFullName}`, {
      jobId: job.id,
      eventId: syncData.eventId,
      duration: job.processedOn ? job.processedOn - job.timestamp : 0,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ payload: SyncJobData }>, error: Error) {
    const { payload: syncData } = job.data;
    this.logger.error(`Sync job failed: ${syncData.platform}:${syncData.repositoryFullName}`, {
      jobId: job.id,
      eventId: syncData.eventId,
      error: error instanceof Error ? error.message : String(error),
      attemptsMade: job.attemptsMade,
      attemptsTotal: job.opts.attempts,
    });
  }

  @OnWorkerEvent('active')
  onActive(job: Job<{ payload: SyncJobData }>) {
    const { payload: syncData } = job.data;
    this.logger.debug(`Sync job started: ${syncData.platform}:${syncData.repositoryFullName}`, {
      jobId: job.id,
      eventId: syncData.eventId,
    });
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Sync job stalled: ${jobId}`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<{ payload: SyncJobData }>, progress: number | object) {
    const { payload: syncData } = job.data;
    this.logger.debug(`Sync job progress: ${syncData.platform}:${syncData.repositoryFullName}`, {
      jobId: job.id,
      eventId: syncData.eventId,
      progress,
    });
  }
}
