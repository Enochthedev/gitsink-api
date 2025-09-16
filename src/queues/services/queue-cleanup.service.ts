import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { QueueManagerService } from './queue-manager.service';
import { QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';

export interface CleanupConfig {
  maxAge: number; // Maximum age in milliseconds
  maxCount: number; // Maximum number of jobs to keep
  batchSize: number; // Number of jobs to clean in each batch
}

export interface CleanupResult {
  queueType: QueueType;
  completedCleaned: number;
  failedCleaned: number;
  activeCleaned: number;
  totalCleaned: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface CleanupReport {
  results: CleanupResult[];
  totalCleaned: number;
  totalDuration: number;
  startTime: Date;
  endTime: Date;
  success: boolean;
}

@Injectable()
export class QueueCleanupService {
  private readonly logger = new Logger(QueueCleanupService.name);
  private isCleanupRunning = false;

  // Default cleanup configurations per queue type
  private readonly DEFAULT_CLEANUP_CONFIGS: Record<QueueType, CleanupConfig> = {
    [QueueType.EMAIL]: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxCount: 1000,
      batchSize: 100,
    },
    [QueueType.SYNC]: {
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
      maxCount: 2000,
      batchSize: 50,
    },
    [QueueType.AI_ENRICHMENT]: {
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
      maxCount: 500,
      batchSize: 25,
    },
    [QueueType.WEBHOOK]: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      maxCount: 5000,
      batchSize: 200,
    },
    [QueueType.CLEANUP]: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      maxCount: 100,
      batchSize: 10,
    },
    [QueueType.ANALYTICS]: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxCount: 1000,
      batchSize: 50,
    },
  };

  constructor(
    private readonly queueManager: QueueManagerService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Perform cleanup on all queues
   */
  async performFullCleanup(): Promise<CleanupReport> {
    if (this.isCleanupRunning) {
      throw new Error('Cleanup is already running');
    }

    this.isCleanupRunning = true;
    const startTime = new Date();
    const results: CleanupResult[] = [];

    this.logger.log('Starting full queue cleanup');

    try {
      for (const queueType of Object.values(QueueType)) {
        const result = await this.cleanupQueue(queueType);
        results.push(result);
      }

      const endTime = new Date();
      const totalCleaned = results.reduce((sum, result) => sum + result.totalCleaned, 0);
      const totalDuration = endTime.getTime() - startTime.getTime();
      const success = results.every(result => result.success);

      const report: CleanupReport = {
        results,
        totalCleaned,
        totalDuration,
        startTime,
        endTime,
        success,
      };

      this.logger.log(
        `Full cleanup completed: ${totalCleaned} jobs cleaned in ${totalDuration}ms, success: ${success}`,
      );

      // Record metrics
      this.recordCleanupMetrics(report);

      return report;
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * Cleanup a specific queue
   */
  async cleanupQueue(
    queueType: QueueType,
    customConfig?: Partial<CleanupConfig>,
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    const config = {
      ...this.DEFAULT_CLEANUP_CONFIGS[queueType],
      ...customConfig,
    };

    this.logger.debug(`Starting cleanup for queue ${queueType}`);

    try {
      const [completedCleaned, failedCleaned, activeCleaned] = await Promise.all([
        this.queueManager.cleanQueue(queueType, config.maxAge, config.maxCount),
        this.cleanFailedJobs(queueType, config),
        this.cleanActiveJobs(queueType, config),
      ]);

      const totalCleaned = completedCleaned + failedCleaned + activeCleaned;
      const duration = Date.now() - startTime;

      const result: CleanupResult = {
        queueType,
        completedCleaned: completedCleaned,
        failedCleaned: failedCleaned || 0,
        activeCleaned: activeCleaned || 0,
        totalCleaned,
        duration,
        success: true,
      };

      this.logger.debug(
        `Cleanup completed for queue ${queueType}: ${totalCleaned} jobs cleaned in ${duration}ms`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Cleanup failed for queue ${queueType}:`, error);

      return {
        queueType,
        completedCleaned: 0,
        failedCleaned: 0,
        activeCleaned: 0,
        totalCleaned: 0,
        duration,
        success: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      };
    }
  }

  /**
   * Clean up old failed jobs
   */
  private async cleanFailedJobs(queueType: QueueType, config: CleanupConfig): Promise<number> {
    try {
      // This would need to be implemented with direct Redis commands
      // as BullMQ doesn't provide a direct method for this
      // For now, we'll use the general clean method
      return 0; // Placeholder
    } catch (error) {
      this.logger.error(`Failed to clean failed jobs for queue ${queueType}:`, error);
      return 0;
    }
  }

  /**
   * Clean up stalled active jobs
   */
  private async cleanActiveJobs(queueType: QueueType, config: CleanupConfig): Promise<number> {
    try {
      // This would clean up jobs that have been active for too long
      // Implementation would depend on specific requirements
      return 0; // Placeholder
    } catch (error) {
      this.logger.error(`Failed to clean active jobs for queue ${queueType}:`, error);
      return 0;
    }
  }

  /**
   * Get cleanup configuration for a queue
   */
  getCleanupConfig(queueType: QueueType): CleanupConfig {
    return { ...this.DEFAULT_CLEANUP_CONFIGS[queueType] };
  }

  /**
   * Update cleanup configuration for a queue
   */
  updateCleanupConfig(queueType: QueueType, config: Partial<CleanupConfig>): void {
    this.DEFAULT_CLEANUP_CONFIGS[queueType] = {
      ...this.DEFAULT_CLEANUP_CONFIGS[queueType],
      ...config,
    };
    this.logger.log(`Updated cleanup config for queue ${queueType}`);
  }

  /**
   * Check if cleanup is currently running
   */
  isCleanupInProgress(): boolean {
    return this.isCleanupRunning;
  }

  /**
   * Scheduled cleanup - runs daily at 2 AM
   */
  @Cron('0 2 * * *', {
    name: 'queue-cleanup',
    timeZone: 'UTC',
  })
  async scheduledCleanup() {
    try {
      this.logger.log('Starting scheduled queue cleanup');
      const report = await this.performFullCleanup();

      if (report.success) {
        this.logger.log(
          `Scheduled cleanup completed successfully: ${report.totalCleaned} jobs cleaned`,
        );
      } else {
        this.logger.error('Scheduled cleanup completed with errors');
      }
    } catch (error) {
      this.logger.error('Scheduled cleanup failed:', error);
    }
  }

  /**
   * Emergency cleanup for when queues are overloaded
   */
  async emergencyCleanup(queueType?: QueueType): Promise<CleanupReport | CleanupResult> {
    this.logger.warn(`Starting emergency cleanup${queueType ? ` for queue ${queueType}` : ''}`);

    const emergencyConfig: CleanupConfig = {
      maxAge: 60 * 60 * 1000, // 1 hour
      maxCount: 100,
      batchSize: 50,
    };

    if (queueType) {
      return await this.cleanupQueue(queueType, emergencyConfig);
    } else {
      // Override all configs with emergency settings
      const originalConfigs = { ...this.DEFAULT_CLEANUP_CONFIGS };

      try {
        // Set emergency configs
        for (const type of Object.values(QueueType)) {
          this.DEFAULT_CLEANUP_CONFIGS[type] = emergencyConfig;
        }

        const report = await this.performFullCleanup();
        this.logger.warn(`Emergency cleanup completed: ${report.totalCleaned} jobs cleaned`);
        return report;
      } finally {
        // Restore original configs
        Object.assign(this.DEFAULT_CLEANUP_CONFIGS, originalConfigs);
      }
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    lastCleanup?: Date;
    totalCleanupsToday: number;
    averageCleanupDuration: number;
    isRunning: boolean;
  }> {
    // This would typically be stored in a database or cache
    // For now, return basic info
    return {
      totalCleanupsToday: 0, // Would be tracked
      averageCleanupDuration: 0, // Would be calculated from history
      isRunning: this.isCleanupRunning,
    };
  }

  private recordCleanupMetrics(report: CleanupReport) {
    // Record overall cleanup metrics
    this.metricsService.recordQueueJob('cleanup', 'cleanup', 'completed', report.totalDuration);

    // Record per-queue cleanup metrics
    for (const result of report.results) {
      this.metricsService.recordQueueJob(
        result.queueType,
        result.success ? 'cleanup_success' : 'cleanup_failed',
        result.success ? 'completed' : 'failed',
        result.duration,
      );
    }
  }
}
