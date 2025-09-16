import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueueManagerService, QueueMetrics } from './queue-manager.service';
import { QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';

export interface QueueHealthStatus {
  queueType: QueueType;
  healthy: boolean;
  metrics: QueueMetrics;
  issues: string[];
  lastChecked: Date;
}

export interface QueueHealthReport {
  overallHealth: 'healthy' | 'warning' | 'critical';
  queues: QueueHealthStatus[];
  summary: {
    totalQueues: number;
    healthyQueues: number;
    warningQueues: number;
    criticalQueues: number;
  };
  recommendations: string[];
  generatedAt: Date;
}

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);
  private lastHealthReport?: QueueHealthReport;

  // Health thresholds
  private readonly THRESHOLDS = {
    MAX_WAITING_JOBS: 1000,
    MAX_FAILED_RATE: 0.1, // 10%
    MAX_STALLED_JOBS: 50,
    MAX_ACTIVE_JOBS: 100,
    MIN_COMPLETION_RATE: 0.8, // 80%
  };

  constructor(
    private readonly queueManager: QueueManagerService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Perform comprehensive health check on all queues
   */
  async performHealthCheck(): Promise<QueueHealthReport> {
    this.logger.debug('Performing queue health check');

    try {
      const allMetrics = await this.queueManager.getAllQueueMetrics();
      const queueStatuses: QueueHealthStatus[] = [];

      for (const [queueType, metrics] of Object.entries(allMetrics)) {
        const status = this.analyzeQueueHealth(queueType as QueueType, metrics);
        queueStatuses.push(status);
      }

      const report = this.generateHealthReport(queueStatuses);
      this.lastHealthReport = report;

      // Record metrics
      this.recordHealthMetrics(report);

      // Log warnings for unhealthy queues
      this.logHealthWarnings(report);

      return report;
    } catch (error) {
      this.logger.error('Failed to perform queue health check:', error);
      throw error;
    }
  }

  /**
   * Get the last health report
   */
  getLastHealthReport(): QueueHealthReport | undefined {
    return this.lastHealthReport;
  }

  /**
   * Check if a specific queue is healthy
   */
  async isQueueHealthy(queueType: QueueType): Promise<boolean> {
    try {
      const metrics = await this.queueManager.getQueueMetrics(queueType);
      const status = this.analyzeQueueHealth(queueType, metrics);
      return status.healthy;
    } catch (error) {
      this.logger.error(`Failed to check health for queue ${queueType}:`, error);
      return false;
    }
  }

  /**
   * Get health status for a specific queue
   */
  async getQueueHealthStatus(queueType: QueueType): Promise<QueueHealthStatus> {
    try {
      const metrics = await this.queueManager.getQueueMetrics(queueType);
      return this.analyzeQueueHealth(queueType, metrics);
    } catch (error) {
      this.logger.error(`Failed to get health status for queue ${queueType}:`, error);
      return {
        queueType,
        healthy: false,
        metrics: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        },
        issues: ['Failed to retrieve queue metrics'],
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Scheduled health check every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledHealthCheck() {
    try {
      await this.performHealthCheck();
    } catch (error) {
      this.logger.error('Scheduled health check failed:', error);
    }
  }

  /**
   * Scheduled queue cleanup every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledQueueCleanup() {
    this.logger.log('Starting scheduled queue cleanup');

    for (const queueType of Object.values(QueueType)) {
      try {
        await this.queueManager.cleanQueue(queueType);
        this.logger.debug(`Cleaned queue ${queueType}`);
      } catch (error) {
        this.logger.error(`Failed to clean queue ${queueType}:`, error);
      }
    }

    this.logger.log('Scheduled queue cleanup completed');
  }

  /**
   * Auto-recovery for unhealthy queues
   */
  async attemptAutoRecovery(queueType: QueueType): Promise<boolean> {
    this.logger.log(`Attempting auto-recovery for queue ${queueType}`);

    try {
      const status = await this.getQueueHealthStatus(queueType);

      if (!status.healthy) {
        // Try to resume if paused
        if (status.metrics.paused > 0) {
          await this.queueManager.resumeQueue(queueType);
          this.logger.log(`Resumed paused queue ${queueType}`);
        }

        // Clean up old jobs if too many waiting
        if (status.metrics.waiting > this.THRESHOLDS.MAX_WAITING_JOBS) {
          await this.queueManager.cleanQueue(queueType, 60 * 60 * 1000, 500); // 1 hour grace, 500 limit
          this.logger.log(`Cleaned up waiting jobs in queue ${queueType}`);
        }

        // Wait a bit and check again
        await new Promise(resolve => setTimeout(resolve, 5000));
        const newStatus = await this.getQueueHealthStatus(queueType);

        if (newStatus.healthy) {
          this.logger.log(`Auto-recovery successful for queue ${queueType}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Auto-recovery failed for queue ${queueType}:`, error);
      return false;
    }
  }

  private analyzeQueueHealth(queueType: QueueType, metrics: QueueMetrics): QueueHealthStatus {
    const issues: string[] = [];
    let healthy = true;

    // Check if queue is paused
    if (metrics.paused > 0) {
      issues.push('Queue is paused');
      healthy = false;
    }

    // Check waiting jobs
    if (metrics.waiting > this.THRESHOLDS.MAX_WAITING_JOBS) {
      issues.push(
        `Too many waiting jobs: ${metrics.waiting} (threshold: ${this.THRESHOLDS.MAX_WAITING_JOBS})`,
      );
      healthy = false;
    }

    // Check active jobs
    if (metrics.active > this.THRESHOLDS.MAX_ACTIVE_JOBS) {
      issues.push(
        `Too many active jobs: ${metrics.active} (threshold: ${this.THRESHOLDS.MAX_ACTIVE_JOBS})`,
      );
      healthy = false;
    }

    // Check failure rate
    const totalProcessed = metrics.completed + metrics.failed;
    if (totalProcessed > 0) {
      const failureRate = metrics.failed / totalProcessed;
      if (failureRate > this.THRESHOLDS.MAX_FAILED_RATE) {
        issues.push(
          `High failure rate: ${(failureRate * 100).toFixed(1)}% (threshold: ${(this.THRESHOLDS.MAX_FAILED_RATE * 100).toFixed(1)}%)`,
        );
        healthy = false;
      }
    }

    // Check for stalled jobs (approximated by delayed jobs)
    if (metrics.delayed > this.THRESHOLDS.MAX_STALLED_JOBS) {
      issues.push(
        `Too many delayed/stalled jobs: ${metrics.delayed} (threshold: ${this.THRESHOLDS.MAX_STALLED_JOBS})`,
      );
      healthy = false;
    }

    return {
      queueType,
      healthy,
      metrics,
      issues,
      lastChecked: new Date(),
    };
  }

  private generateHealthReport(queueStatuses: QueueHealthStatus[]): QueueHealthReport {
    const summary = {
      totalQueues: queueStatuses.length,
      healthyQueues: queueStatuses.filter(q => q.healthy).length,
      warningQueues: 0,
      criticalQueues: queueStatuses.filter(q => !q.healthy).length,
    };

    // Determine overall health
    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (summary.criticalQueues > 0) {
      overallHealth = 'critical';
    } else if (summary.criticalQueues > summary.totalQueues * 0.3) {
      overallHealth = 'warning';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(queueStatuses);

    return {
      overallHealth,
      queues: queueStatuses,
      summary,
      recommendations,
      generatedAt: new Date(),
    };
  }

  private generateRecommendations(queueStatuses: QueueHealthStatus[]): string[] {
    const recommendations: string[] = [];

    const unhealthyQueues = queueStatuses.filter(q => !q.healthy);

    if (unhealthyQueues.length > 0) {
      recommendations.push(`${unhealthyQueues.length} queue(s) require attention`);
    }

    // Check for common issues
    const pausedQueues = queueStatuses.filter(q => q.metrics.paused > 0);
    if (pausedQueues.length > 0) {
      recommendations.push(
        `Resume paused queues: ${pausedQueues.map(q => q.queueType).join(', ')}`,
      );
    }

    const overloadedQueues = queueStatuses.filter(
      q => q.metrics.waiting > this.THRESHOLDS.MAX_WAITING_JOBS,
    );
    if (overloadedQueues.length > 0) {
      recommendations.push(
        `Consider increasing worker concurrency for overloaded queues: ${overloadedQueues.map(q => q.queueType).join(', ')}`,
      );
    }

    const highFailureQueues = queueStatuses.filter(q => {
      const total = q.metrics.completed + q.metrics.failed;
      return total > 0 && q.metrics.failed / total > this.THRESHOLDS.MAX_FAILED_RATE;
    });
    if (highFailureQueues.length > 0) {
      recommendations.push(
        `Investigate high failure rates in queues: ${highFailureQueues.map(q => q.queueType).join(', ')}`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All queues are operating normally');
    }

    return recommendations;
  }

  private recordHealthMetrics(report: QueueHealthReport) {
    // Record overall health metrics
    this.metricsService.recordQueueJob('health_check', 'check', 'completed');

    // Record per-queue metrics
    for (const queueStatus of report.queues) {
      const labels = { queue: queueStatus.queueType };

      // Record queue health status
      this.metricsService.recordQueueJob(
        queueStatus.queueType,
        queueStatus.healthy ? 'healthy' : 'unhealthy',
        queueStatus.healthy ? 'completed' : 'failed',
      );
    }
  }

  private logHealthWarnings(report: QueueHealthReport) {
    if (report.overallHealth === 'critical') {
      this.logger.error(
        `Queue health is CRITICAL: ${report.summary.criticalQueues}/${report.summary.totalQueues} queues unhealthy`,
      );
    } else if (report.overallHealth === 'warning') {
      this.logger.warn(
        `Queue health is WARNING: ${report.summary.criticalQueues}/${report.summary.totalQueues} queues unhealthy`,
      );
    }

    // Log specific queue issues
    for (const queueStatus of report.queues) {
      if (!queueStatus.healthy) {
        this.logger.warn(
          `Queue ${queueStatus.queueType} is unhealthy: ${queueStatus.issues.join(', ')}`,
        );
      }
    }

    // Log recommendations
    if (report.recommendations.length > 1 || !report.recommendations[0]?.includes('normally')) {
      this.logger.log(`Queue health recommendations: ${report.recommendations.join('; ')}`);
    }
  }
}
