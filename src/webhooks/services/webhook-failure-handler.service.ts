import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookStorageService } from './webhook-storage.service';
import { WebhookEvent, WebhookEventFilter } from '../types/webhook.types';

export interface FailureAlert {
  eventId: string;
  platform: string;
  eventType: string;
  repositoryFullName: string;
  error: string;
  retryCount: number;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface FailureStats {
  totalFailures: number;
  failuresByPlatform: Record<string, number>;
  failuresByEventType: Record<string, number>;
  recentFailures: FailureAlert[];
  failureRate: number;
}

@Injectable()
export class WebhookFailureHandlerService {
  private readonly logger = new Logger(WebhookFailureHandlerService.name);
  private readonly maxRetries: number;
  private readonly alertThreshold: number;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: WebhookStorageService,
  ) {
    this.maxRetries = this.config.get<number>('WEBHOOK_MAX_RETRIES', 3);
    this.alertThreshold = this.config.get<number>('WEBHOOK_ALERT_THRESHOLD', 10);
  }

  /**
   * Handle webhook processing failure
   */
  async handleFailure(event: WebhookEvent, error: string): Promise<void> {
    try {
      this.logger.warn(`Webhook processing failed: ${event.platform}:${event.eventType}`, {
        eventId: event.id,
        repositoryFullName: event.repositoryFullName,
        error,
        retryCount: event.retryCount,
      });

      // Update event with failure information
      await this.storage.updateEvent(event.id, {
        error,
        processed: false,
      });

      // Check if we should send alerts
      await this.checkAndSendAlerts(event, error);

      // Log failure metrics
      await this.recordFailureMetrics(event, error);
    } catch (err) {
      this.logger.error(`Failed to handle webhook failure for event ${event.id}:`, err);
    }
  }

  /**
   * Handle webhook retry
   */
  async handleRetry(event: WebhookEvent): Promise<boolean> {
    try {
      if (event.retryCount >= this.maxRetries) {
        this.logger.error(`Max retries exceeded for webhook event ${event.id}`, {
          eventId: event.id,
          platform: event.platform,
          eventType: event.eventType,
          repositoryFullName: event.repositoryFullName,
          retryCount: event.retryCount,
        });

        // Mark as permanently failed
        await this.storage.updateEvent(event.id, {
          processed: false,
          error: `Max retries (${this.maxRetries}) exceeded`,
        });

        // Send critical alert
        await this.sendCriticalAlert(event);
        return false;
      }

      // Increment retry count
      await this.storage.incrementRetryCount(event.id);
      return true;
    } catch (error) {
      this.logger.error(`Failed to handle webhook retry for event ${event.id}:`, error);
      return false;
    }
  }

  /**
   * Get failure statistics
   */
  async getFailureStats(timeRange?: { from: Date; to: Date }): Promise<FailureStats> {
    try {
      const filter: WebhookEventFilter = {
        processed: false,
        ...timeRange,
      };

      const failedEvents = await this.storage.getEvents(filter, 1000);
      const totalEvents = await this.storage.getEvents((timeRange as any) || {}, 1000);

      const totalFailures = failedEvents.length;
      const failureRate = totalEvents.length > 0 ? totalFailures / totalEvents.length : 0;

      // Group by platform
      const failuresByPlatform = failedEvents.reduce(
        (acc, event) => {
          acc[event.platform] = (acc[event.platform] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      // Group by event type
      const failuresByEventType = failedEvents.reduce(
        (acc, event) => {
          acc[event.eventType] = (acc[event.eventType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      // Get recent failures (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentFailedEvents = failedEvents.filter(event => event.timestamp >= oneDayAgo);

      const recentFailures: FailureAlert[] = recentFailedEvents.map(event => ({
        eventId: event.id,
        platform: event.platform,
        eventType: event.eventType,
        repositoryFullName: event.repositoryFullName,
        error: event.error || 'Unknown error',
        retryCount: event.retryCount,
        timestamp: event.timestamp,
        severity: this.determineSeverity(event),
      }));

      return {
        totalFailures,
        failuresByPlatform,
        failuresByEventType,
        recentFailures,
        failureRate,
      };
    } catch (error) {
      this.logger.error('Failed to get failure statistics:', error);
      return {
        totalFailures: 0,
        failuresByPlatform: {},
        failuresByEventType: {},
        recentFailures: [],
        failureRate: 0,
      };
    }
  }

  /**
   * Clean up old failed events
   */
  async cleanupOldFailures(olderThan: Date): Promise<number> {
    try {
      const cleaned = await this.storage.cleanupOldEvents(olderThan);
      this.logger.log(`Cleaned up ${cleaned} old failed webhook events`);
      return cleaned;
    } catch (error) {
      this.logger.error('Failed to cleanup old failures:', error);
      return 0;
    }
  }

  /**
   * Check if alerts should be sent and send them
   */
  private async checkAndSendAlerts(event: WebhookEvent, error: string): Promise<void> {
    // Check failure rate for this platform
    const recentFailures = await this.getRecentFailuresForPlatform(event.platform);

    if (recentFailures >= this.alertThreshold) {
      await this.sendFailureAlert({
        eventId: event.id,
        platform: event.platform,
        eventType: event.eventType,
        repositoryFullName: event.repositoryFullName,
        error,
        retryCount: event.retryCount,
        timestamp: new Date(),
        severity: 'high',
      });
    }
  }

  /**
   * Get recent failures for a platform
   */
  private async getRecentFailuresForPlatform(platform: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = await this.storage.getEvents(
      {
        platform,
        processed: false,
        fromDate: oneHourAgo,
      },
      100,
    );

    return recentEvents.length;
  }

  /**
   * Send failure alert
   */
  private async sendFailureAlert(alert: FailureAlert): Promise<void> {
    this.logger.warn(`Webhook failure alert: ${alert.platform}:${alert.eventType}`, {
      ...alert,
    });

    // TODO: Implement actual alerting mechanism (email, Slack, etc.)
    // This could integrate with the existing mail service or notification system
  }

  /**
   * Send critical alert for permanently failed events
   */
  private async sendCriticalAlert(event: WebhookEvent): Promise<void> {
    const alert: FailureAlert = {
      eventId: event.id,
      platform: event.platform,
      eventType: event.eventType,
      repositoryFullName: event.repositoryFullName,
      error: `Max retries (${this.maxRetries}) exceeded`,
      retryCount: event.retryCount,
      timestamp: new Date(),
      severity: 'critical',
    };

    this.logger.error(`Critical webhook failure: ${alert.platform}:${alert.eventType}`, {
      ...alert,
    });

    // TODO: Implement critical alerting mechanism
  }

  /**
   * Record failure metrics
   */
  private async recordFailureMetrics(event: WebhookEvent, error: string): Promise<void> {
    // TODO: Integrate with metrics service to record failure metrics
    // This could include:
    // - Failure count by platform
    // - Failure count by event type
    // - Error type classification
    // - Failure rate over time
  }

  /**
   * Determine failure severity based on event and retry count
   */
  private determineSeverity(event: WebhookEvent): 'low' | 'medium' | 'high' | 'critical' {
    if (event.retryCount >= this.maxRetries) {
      return 'critical';
    } else if (event.retryCount >= this.maxRetries - 1) {
      return 'high';
    } else if (event.retryCount >= 1) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}
