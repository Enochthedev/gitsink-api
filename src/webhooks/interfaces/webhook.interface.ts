import {
  WebhookEvent,
  WebhookProcessingResult,
  WebhookSignatureValidation,
  WebhookEventFilter,
  WebhookJobData,
  WebhookProcessingOptions,
  WebhookMetrics,
} from '../types/webhook.types';

export interface IWebhookHandler {
  /**
   * Process a webhook event
   */
  processWebhook(eventData: WebhookJobData): Promise<WebhookProcessingResult>;

  /**
   * Validate webhook signature
   */
  validateSignature(
    payload: string,
    signature: string,
    platform: string,
  ): Promise<WebhookSignatureValidation>;

  /**
   * Queue webhook for processing
   */
  queueWebhook(eventData: WebhookJobData, options?: WebhookProcessingOptions): Promise<void>;

  /**
   * Retry failed webhook
   */
  retryWebhook(eventId: string): Promise<WebhookProcessingResult>;

  /**
   * Get webhook processing metrics
   */
  getMetrics(filter?: WebhookEventFilter): Promise<WebhookMetrics>;
}

export interface IWebhookStorage {
  /**
   * Store webhook event
   */
  storeEvent(event: Omit<WebhookEvent, 'id'>): Promise<WebhookEvent>;

  /**
   * Get webhook event by ID
   */
  getEvent(eventId: string): Promise<WebhookEvent | null>;

  /**
   * Update webhook event
   */
  updateEvent(eventId: string, updates: Partial<WebhookEvent>): Promise<WebhookEvent>;

  /**
   * Get webhook events with filtering
   */
  getEvents(filter: WebhookEventFilter, limit?: number, offset?: number): Promise<WebhookEvent[]>;

  /**
   * Mark event as processed
   */
  markAsProcessed(eventId: string, success: boolean, error?: string): Promise<void>;

  /**
   * Increment retry count
   */
  incrementRetryCount(eventId: string): Promise<void>;

  /**
   * Clean up old events
   */
  cleanupOldEvents(olderThan: Date): Promise<number>;

  /**
   * Check for duplicate events
   */
  isDuplicateEvent(
    platform: string,
    eventType: string,
    repositoryId: string,
    payload: any,
  ): Promise<boolean>;
}

export interface IWebhookProcessor {
  /**
   * Process webhook event based on platform and event type
   */
  process(event: WebhookEvent): Promise<WebhookProcessingResult>;

  /**
   * Check if processor supports the event
   */
  supports(platform: string, eventType: string): boolean;

  /**
   * Get processor priority (higher number = higher priority)
   */
  getPriority(): number;
}

export interface IWebhookQueue {
  /**
   * Add webhook job to queue
   */
  addJob(jobData: WebhookJobData, options?: WebhookProcessingOptions): Promise<void>;

  /**
   * Process webhook jobs
   */
  processJobs(): Promise<void>;

  /**
   * Get queue health status
   */
  getHealthStatus(): Promise<{
    isHealthy: boolean;
    activeJobs: number;
    waitingJobs: number;
    failedJobs: number;
  }>;

  /**
   * Clean up completed jobs
   */
  cleanup(): Promise<void>;
}
