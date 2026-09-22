import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWebhookHandler } from '../interfaces/webhook.interface';
import { WebhookStorageService } from './webhook-storage.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhookProcessorService } from './webhook-processor.service';
import {
  WebhookEvent,
  WebhookEventFilter,
  WebhookJobData,
  WebhookMetrics,
  WebhookProcessingOptions,
  WebhookProcessingResult,
  WebhookRetryConfig,
  WebhookSignatureValidation,
} from '../types/webhook.types';

@Injectable()
export class WebhookHandlerService implements IWebhookHandler {
  private readonly logger = new Logger(WebhookHandlerService.name);
  private readonly retryConfig: WebhookRetryConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: WebhookStorageService,
    private readonly signature: WebhookSignatureService,
    private readonly queue: WebhookQueueService,
    private readonly processor: WebhookProcessorService,
  ) {
    this.retryConfig = {
      maxRetries: this.config.get<number>('WEBHOOK_MAX_RETRIES', 3),
      baseDelay: this.config.get<number>('WEBHOOK_BASE_DELAY', 1000),
      maxDelay: this.config.get<number>('WEBHOOK_MAX_DELAY', 30000),
      backoffMultiplier: this.config.get<number>('WEBHOOK_BACKOFF_MULTIPLIER', 2),
    };
  }

  async processWebhook(eventData: WebhookJobData): Promise<WebhookProcessingResult> {
    try {
      this.logger.debug(`Processing webhook: ${eventData.platform}:${eventData.eventType}`, {
        eventId: eventData.eventId,
        repositoryUrl: eventData.repositoryUrl,
        retryCount: eventData.retryCount || 0,
      });

      // Get the stored event
      const event = await this.storage.getEvent(eventData.eventId);
      if (!event) {
        return {
          success: false,
          eventId: eventData.eventId,
          processed: false,
          error: 'Event not found in storage',
        };
      }

      // Check if already processed
      if (event.processed) {
        this.logger.debug(`Event ${eventData.eventId} already processed`);
        return {
          success: true,
          eventId: eventData.eventId,
          processed: true,
        };
      }

      // Process the event
      const result = await this.processor.process(event);

      // Update storage based on result
      await this.storage.markAsProcessed(eventData.eventId, result.success, result.error);

      // If processing failed and we haven't exceeded retry limit, schedule retry
      if (!result.success && (eventData.retryCount || 0) < this.retryConfig.maxRetries) {
        const retryDelay = this.calculateRetryDelay(eventData.retryCount || 0);
        await this.scheduleRetry(eventData, retryDelay);

        return {
          ...result,
          retryAfter: retryDelay,
        };
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to process webhook ${eventData.eventId}:`, error);

      // Mark as failed in storage
      await this.storage.markAsProcessed(
        eventData.eventId,
        false,
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : 'Processing failed',
      );

      return {
        success: false,
        eventId: eventData.eventId,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Processing failed',
      };
    }
  }

  async validateSignature(
    payload: string,
    signature: string,
    platform: string,
    headers?: Record<string, string>,
  ): Promise<WebhookSignatureValidation> {
    return await this.signature.validateSignature(
      payload,
      signature,
      platform as 'github' | 'gitlab' | 'bitbucket',
      headers,
    );
  }

  async queueWebhook(
    eventData: WebhookJobData,
    options: WebhookProcessingOptions = {},
  ): Promise<void> {
    try {
      // Store the event first
      const storedEvent = await this.storage.storeEvent({
        platform: eventData.platform,
        eventType: eventData.eventType,
        repositoryUrl: eventData.repositoryUrl,
        repositoryId: this.extractRepositoryId(eventData.payload, eventData.platform),
        repositoryName: this.extractRepositoryName(eventData.payload, eventData.platform),
        repositoryFullName: this.extractRepositoryFullName(eventData.payload, eventData.platform),
        ownerId: this.extractOwnerId(eventData.payload, eventData.platform),
        ownerName: this.extractOwnerName(eventData.payload, eventData.platform),
        payload: eventData.payload,
        signature: eventData.signature,
        timestamp: eventData.timestamp,
        processed: false,
        retryCount: 0,
      });

      // Update eventData with stored event ID
      const updatedEventData = {
        ...eventData,
        eventId: storedEvent.id,
      };

      // Queue for processing
      await this.queue.addJob(updatedEventData, options);

      this.logger.debug('Queued webhook for processing', {
        eventId: storedEvent.id,
        platform: eventData.platform,
        eventType: eventData.eventType,
        repositoryUrl: eventData.repositoryUrl,
      });
    } catch (error) {
      this.logger.error('Failed to queue webhook:', error);
      throw error;
    }
  }

  async retryWebhook(eventId: string): Promise<WebhookProcessingResult> {
    try {
      const event = await this.storage.getEvent(eventId);
      if (!event) {
        return {
          success: false,
          eventId,
          processed: false,
          error: 'Event not found',
        };
      }

      // Increment retry count
      await this.storage.incrementRetryCount(eventId);

      // Create job data for retry
      const jobData: WebhookJobData = {
        eventId: event.id,
        platform: event.platform,
        eventType: event.eventType,
        repositoryUrl: event.repositoryUrl,
        payload: event.payload,
        signature: event.signature,
        timestamp: event.timestamp,
        retryCount: event.retryCount + 1,
      };

      // Process immediately
      return await this.processWebhook(jobData);
    } catch (error) {
      this.logger.error(`Failed to retry webhook ${eventId}:`, error);
      return {
        success: false,
        eventId,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Retry failed',
      };
    }
  }

  async getMetrics(filter: WebhookEventFilter = {}): Promise<WebhookMetrics> {
    try {
      // Get events based on filter
      const events = await this.storage.getEvents(filter, 10000); // Large limit for metrics

      const totalEvents = events.length;
      const processedEvents = events.filter(e => e.processed && !e.error).length;
      const failedEvents = events.filter(e => e.error).length;
      const retryingEvents = events.filter(e => e.retryCount > 0 && !e.processed).length;

      // Calculate average processing time (would need to track this separately)
      const averageProcessingTime = 0; // TODO: Implement processing time tracking

      // Group by platform
      const eventsByPlatform = events.reduce(
        (acc, event) => {
          acc[event.platform] = (acc[event.platform] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      // Group by event type
      const eventsByType = events.reduce(
        (acc, event) => {
          acc[event.eventType] = (acc[event.eventType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        totalEvents,
        processedEvents,
        failedEvents,
        retryingEvents,
        averageProcessingTime,
        eventsByPlatform,
        eventsByType,
      };
    } catch (error) {
      this.logger.error('Failed to get webhook metrics:', error);
      return {
        totalEvents: 0,
        processedEvents: 0,
        failedEvents: 0,
        retryingEvents: 0,
        averageProcessingTime: 0,
        eventsByPlatform: {},
        eventsByType: {},
      };
    }
  }

  private async scheduleRetry(eventData: WebhookJobData, retryDelay: number): Promise<void> {
    try {
      await this.queue.addRetryJob(eventData, retryDelay);
      this.logger.debug(`Scheduled retry for webhook ${eventData.eventId}`, {
        retryCount: (eventData.retryCount || 0) + 1,
        retryDelay,
      });
    } catch (error) {
      this.logger.error(`Failed to schedule retry for webhook ${eventData.eventId}:`, error);
    }
  }

  private calculateRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount),
      this.retryConfig.maxDelay,
    );

    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  private extractRepositoryId(payload: any, platform: string): string {
    switch (platform) {
      case 'github':
        return payload.repository?.id?.toString() || '';
      case 'gitlab':
        return payload.project?.id?.toString() || '';
      case 'bitbucket':
        return payload.repository?.uuid || '';
      default:
        return '';
    }
  }

  private extractRepositoryName(payload: any, platform: string): string {
    switch (platform) {
      case 'github':
        return payload.repository?.name || '';
      case 'gitlab':
        return payload.project?.name || '';
      case 'bitbucket':
        return payload.repository?.name || '';
      default:
        return '';
    }
  }

  private extractRepositoryFullName(payload: any, platform: string): string {
    switch (platform) {
      case 'github':
        return payload.repository?.full_name || '';
      case 'gitlab':
        return payload.project?.path_with_namespace || '';
      case 'bitbucket':
        return payload.repository?.full_name || '';
      default:
        return '';
    }
  }

  private extractOwnerId(payload: any, platform: string): string {
    switch (platform) {
      case 'github':
        return payload.repository?.owner?.id?.toString() || '';
      case 'gitlab':
        return payload.project?.namespace?.id?.toString() || '';
      case 'bitbucket':
        return payload.repository?.owner?.uuid || '';
      default:
        return '';
    }
  }

  private extractOwnerName(payload: any, platform: string): string {
    switch (platform) {
      case 'github':
        return payload.repository?.owner?.login || '';
      case 'gitlab':
        return payload.project?.namespace?.path || '';
      case 'bitbucket':
        return payload.repository?.owner?.username || '';
      default:
        return '';
    }
  }
}
