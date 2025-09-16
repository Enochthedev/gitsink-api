import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueOptions, WorkerOptions, JobsOptions } from 'bullmq';

export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

export enum QueueType {
  EMAIL = 'email',
  SYNC = 'sync',
  AI_ENRICHMENT = 'ai-enrichment',
  WEBHOOK = 'webhook',
  CLEANUP = 'cleanup',
  ANALYTICS = 'analytics',
}

export interface EnhancedJobOptions extends JobsOptions {
  priority?: JobPriority;
  userTier?: 'free' | 'premium' | 'enterprise';
  retryStrategy?: 'exponential' | 'linear' | 'fixed';
  maxRetries?: number;
  timeout?: number;
  tags?: string[];
}

@Injectable()
export class QueueConfigService {
  constructor(private readonly configService: ConfigService) { }

  getRedisConnection() {
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: null, // Critical: Must be null for BullMQ
      retryDelayOnFailover: 100,
      enableReadyCheck: false, // Recommended for BullMQ
      maxLoadingTimeout: 5000,
      lazyConnect: true,
    };
  }

  getQueueOptions(queueType: QueueType): QueueOptions {
    const baseOptions: QueueOptions = {
      connection: this.getRedisConnection(),
      defaultJobOptions: this.getDefaultJobOptions(queueType),
    };

    // Queue-specific configurations
    switch (queueType) {
      case QueueType.EMAIL:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };

      case QueueType.SYNC:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 200,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            delay: 1000, // Default delay between sync jobs
          },
        };

      case QueueType.AI_ENRICHMENT:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 50,
            removeOnFail: 25,
            attempts: 2,
            backoff: {
              type: 'fixed',
              delay: 10000,
            },
          },
        };

      case QueueType.WEBHOOK:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 500,
            removeOnFail: 200,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        };

      case QueueType.CLEANUP:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 10,
            removeOnFail: 5,
            attempts: 1,
            // Note: repeat jobs should be handled separately
            // repeat: {
            //     pattern: '0 2 * * *', // Daily at 2 AM
            // },
          },
        };

      case QueueType.ANALYTICS:
        return {
          ...baseOptions,
          defaultJobOptions: {
            ...baseOptions.defaultJobOptions,
            removeOnComplete: 100,
            removeOnFail: 25,
            attempts: 2,
            backoff: {
              type: 'linear',
              delay: 5000,
            },
          },
        };

      default:
        return baseOptions;
    }
  }

  getWorkerOptions(queueType: QueueType): WorkerOptions {
    const baseOptions: WorkerOptions = {
      connection: this.getRedisConnection(),
      concurrency: this.getConcurrency(queueType),
      maxStalledCount: 3,
      stalledInterval: 30000,
      // maxMemoryUsage: this.getMaxMemoryUsage(), // Not available in current BullMQ version
    };

    return baseOptions;
  }

  private getDefaultJobOptions(queueType: QueueType): JobsOptions {
    return {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    };
  }

  private getConcurrency(queueType: QueueType): number {
    const defaultConcurrency = this.configService.get<number>('QUEUE_CONCURRENCY', 5);

    switch (queueType) {
      case QueueType.EMAIL:
        return this.configService.get<number>('EMAIL_QUEUE_CONCURRENCY', defaultConcurrency);
      case QueueType.SYNC:
        return this.configService.get<number>(
          'SYNC_QUEUE_CONCURRENCY',
          Math.max(defaultConcurrency - 2, 1),
        );
      case QueueType.AI_ENRICHMENT:
        return this.configService.get<number>(
          'AI_QUEUE_CONCURRENCY',
          Math.max(defaultConcurrency - 3, 1),
        );
      case QueueType.WEBHOOK:
        return this.configService.get<number>('WEBHOOK_QUEUE_CONCURRENCY', defaultConcurrency + 2);
      case QueueType.CLEANUP:
        return 1; // Single worker for cleanup tasks
      case QueueType.ANALYTICS:
        return this.configService.get<number>(
          'ANALYTICS_QUEUE_CONCURRENCY',
          Math.max(defaultConcurrency - 2, 1),
        );
      default:
        return defaultConcurrency;
    }
  }

  private getMaxMemoryUsage(): number {
    return this.configService.get<number>('QUEUE_MAX_MEMORY_MB', 100) * 1024 * 1024;
  }

  /**
   * Calculate intelligent delay based on user tier, system load, and priority
   */
  calculateJobDelay(
    priority: JobPriority = JobPriority.NORMAL,
    userTier: 'free' | 'premium' | 'enterprise' = 'free',
    systemLoad: number = 0.5,
  ): number {
    // Base delay in milliseconds
    let delay = 0;

    // Priority-based delay
    switch (priority) {
      case JobPriority.CRITICAL:
        delay = 0;
        break;
      case JobPriority.HIGH:
        delay = userTier === 'free' ? 500 : 0;
        break;
      case JobPriority.NORMAL:
        delay = userTier === 'free' ? 2000 : userTier === 'premium' ? 500 : 0;
        break;
      case JobPriority.LOW:
        delay = userTier === 'free' ? 5000 : userTier === 'premium' ? 2000 : 500;
        break;
    }

    // System load adjustment
    if (systemLoad > 0.8) {
      delay += 5000; // Add 5 seconds under high load
    } else if (systemLoad > 0.6) {
      delay += 2000; // Add 2 seconds under medium load
    }

    return delay;
  }

  /**
   * Get enhanced job options with intelligent configuration
   */
  getEnhancedJobOptions(queueType: QueueType, options: EnhancedJobOptions = {}): JobsOptions {
    const baseOptions = this.getQueueOptions(queueType).defaultJobOptions || {};

    const enhancedOptions: JobsOptions = {
      ...baseOptions,
      priority: options.priority || JobPriority.NORMAL,
      delay: options.delay || this.calculateJobDelay(options.priority, options.userTier),
    };

    // Custom retry strategy
    if (options.retryStrategy) {
      switch (options.retryStrategy) {
        case 'exponential':
          enhancedOptions.backoff = {
            type: 'exponential',
            delay: 2000,
          };
          break;
        case 'linear':
          enhancedOptions.backoff = {
            type: 'fixed',
            delay: 5000,
          };
          break;
        case 'fixed':
          enhancedOptions.backoff = {
            type: 'fixed',
            delay: 3000,
          };
          break;
      }
    }

    // Custom retry count
    if (options.maxRetries) {
      enhancedOptions.attempts = options.maxRetries;
    }

    // Job timeout
    if (options.timeout) {
      enhancedOptions.jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    return enhancedOptions;
  }
}
