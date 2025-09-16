export interface WebhookEvent {
  id: string;
  platform: 'github' | 'gitlab' | 'bitbucket';
  eventType: string;
  repositoryUrl: string;
  repositoryId: string;
  repositoryName: string;
  repositoryFullName: string;
  ownerId: string;
  ownerName: string;
  payload: any;
  signature: string;
  timestamp: Date;
  processed: boolean;
  retryCount: number;
  lastRetryAt?: Date;
  error?: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  processed: boolean;
  error?: string;
  retryAfter?: number;
}

export interface WebhookRetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface WebhookSignatureValidation {
  isValid: boolean;
  error?: string;
}

export interface WebhookEventFilter {
  platform?: string;
  eventType?: string;
  repositoryId?: string;
  ownerId?: string;
  processed?: boolean;
  fromDate?: Date;
  toDate?: Date;
}

export interface WebhookJobData {
  eventId: string;
  platform: 'github' | 'gitlab' | 'bitbucket';
  eventType: string;
  repositoryUrl: string;
  payload: any;
  signature: string;
  timestamp: Date;
  retryCount?: number;
}

export interface WebhookProcessingOptions {
  immediate?: boolean;
  priority?: 'low' | 'normal' | 'high';
  delay?: number;
  maxRetries?: number;
}

export type WebhookJobType = 'webhook-process' | 'webhook-retry' | 'webhook-cleanup';

export interface WebhookMetrics {
  totalEvents: number;
  processedEvents: number;
  failedEvents: number;
  retryingEvents: number;
  averageProcessingTime: number;
  eventsByPlatform: Record<string, number>;
  eventsByType: Record<string, number>;
}
