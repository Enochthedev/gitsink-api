import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, QueueOptions, WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';

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
export class QueueConfigService implements OnModuleDestroy {
  private redisConnection: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleDestroy() {
    if (this.redisConnection) {
      this.redisConnection.disconnect();
    }
  }

  private getRedisConfig(): any {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    // Enhanced connection configuration for better connection management
    const baseConfig = {
      maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
      enableReadyCheck: false, // Reduce connection overhead
      enableOfflineQueue: true, // Queue commands when disconnected
      connectTimeout: 10000, // 10 seconds connection timeout
      // Connection pool settings to limit connections
      lazyConnect: false, // Connect immediately to detect issues
      keepAlive: 30000, // Keep connection alive
      family: 4, // IPv4
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    if (redisUrl) {
      try {
        const url = new URL(redisUrl);
        return {
          ...baseConfig,
          host: url.hostname,
          port: parseInt(url.port, 10) || 6379,
          password: url.password || undefined,
          username: url.username || undefined,
          db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
        };
      } catch (error) {
        console.warn('Failed to parse REDIS_URL, falling back to individual config:', error);
      }
    }

    return {
      ...baseConfig,
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
    };
  }

  getRedisConnection(): Redis {
    if (this.redisConnection) {
      return this.redisConnection;
    }

    const config = this.getRedisConfig();

    // Create a singleton connection - this will be SHARED across all Queue and QueueEvents instances
    // This dramatically reduces the number of Redis connections needed
    this.redisConnection = new Redis(config);

    // Enhanced connection monitoring and error handling
    this.redisConnection.on('connect', () => {
      console.log('[QueueConfig] Shared Redis connection established');
    });

    this.redisConnection.on('ready', () => {
      console.log('[QueueConfig] Shared Redis connection ready');
    });

    this.redisConnection.on('error', err => {
      console.error('[QueueConfig] Shared Redis connection error:', err.message);
      // Don't log full stack trace for "max clients" errors to reduce noise
      if (!err.message.includes('max number of clients')) {
        console.error(err.stack);
      }
    });

    this.redisConnection.on('close', () => {
      console.warn('[QueueConfig] Shared Redis connection closed');
    });

    this.redisConnection.on('reconnecting', (delay: number) => {
      console.log(`[QueueConfig] Shared Redis connection reconnecting in ${delay}ms`);
    });

    return this.redisConnection;
  }

  getQueueOptions(queueType: QueueType): QueueOptions {
    const baseOptions: QueueOptions = {
      // PRODUCERS: Reuse the singleton connection
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
      // WORKERS: Use a FRESH configuration object so BullMQ creates dedicated connections
      // This is critical for workers because they use blocking commands (BRPOP)
      // Sharing a singleton here would cause "Client is in blocking mode" errors
      connection: this.getRedisConfig(),
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
    // CRITICAL: Reduced default concurrency from 5 to 2 to minimize Redis connections
    // Each worker creates 2 Redis connections (blocking + command), so:
    // - 6 queue types × 2 avg concurrency × 2 connections = ~24 worker connections
    // Previous setting: 6 × 5 avg × 2 = ~60 connections (exceeds Redis limit!)
    const defaultConcurrency = this.configService.get<number>('QUEUE_CONCURRENCY', 2);

    switch (queueType) {
      case QueueType.EMAIL:
        // Email is high priority but doesn't need many concurrent workers
        return this.configService.get<number>('EMAIL_QUEUE_CONCURRENCY', 2);
      case QueueType.SYNC:
        // Sync operations are I/O bound, 2 workers is sufficient
        return this.configService.get<number>('SYNC_QUEUE_CONCURRENCY', 2);
      case QueueType.AI_ENRICHMENT:
        // AI operations are expensive, keep at 1 to avoid overload
        return this.configService.get<number>('AI_QUEUE_CONCURRENCY', 1);
      case QueueType.WEBHOOK:
        // Webhooks are fast, can handle slightly more concurrency
        return this.configService.get<number>('WEBHOOK_QUEUE_CONCURRENCY', 3);
      case QueueType.CLEANUP:
        return 1; // Single worker for cleanup tasks
      case QueueType.ANALYTICS:
        // Analytics can be processed slowly
        return this.configService.get<number>('ANALYTICS_QUEUE_CONCURRENCY', 1);
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
