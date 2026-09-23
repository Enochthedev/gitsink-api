import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, QueueEvents } from 'bullmq';
import {
  EnhancedJobOptions,
  JobPriority,
  QueueConfigService,
  QueueType,
} from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface SystemLoad {
  cpu: number;
  memory: number;
  queueLoad: number;
}

@Injectable()
export class QueueManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueManagerService.name);
  private queues = new Map<QueueType, Queue>();
  private queueEvents = new Map<QueueType, QueueEvents>();
  private systemLoad: SystemLoad = { cpu: 0, memory: 0, queueLoad: 0 };
  private loadCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly queueConfig: QueueConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    await this.initializeQueues();
    this.startSystemLoadMonitoring();
    this.logger.log('Queue Manager initialized successfully');
  }

  async onModuleDestroy() {
    await this.closeAllQueues();
    if (this.loadCheckInterval) {
      clearInterval(this.loadCheckInterval);
    }
    this.logger.log('Queue Manager destroyed');
  }

  private async initializeQueues() {
    for (const queueType of Object.values(QueueType)) {
      await this.createQueue(queueType);
    }
  }

  private async createQueue(queueType: QueueType) {
    try {
      const queueOptions = this.queueConfig.getQueueOptions(queueType);
      const queue = new Queue(queueType, queueOptions);

      // Create queue events for monitoring - REUSE the same connection as the queue
      // This prevents creating 6 additional Redis connections (one per queue type)
      const queueEvents = new QueueEvents(queueType, {
        connection: this.queueConfig.getRedisConnection(), // Reuse singleton connection
      });

      this.queues.set(queueType, queue);
      this.queueEvents.set(queueType, queueEvents);

      // Set up event listeners
      this.setupQueueEventListeners(queueType, queue, queueEvents);

      this.logger.log(`Queue ${queueType} initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize queue ${queueType}:`, error);
      throw error;
    }
  }

  private setupQueueEventListeners(queueType: QueueType, queue: Queue, queueEvents: QueueEvents) {
    // Job completion events
    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      this.logger.debug(`Job ${jobId} in queue ${queueType} completed`);
      this.metricsService.recordQueueJob(queueType, 'job', 'completed');
    });

    // Job failure events
    queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(`Job ${jobId} in queue ${queueType} failed: ${failedReason}`);
      this.metricsService.recordQueueJob(queueType, 'job', 'failed');
    });

    // Job stalled events
    queueEvents.on('stalled', ({ jobId }) => {
      this.logger.warn(`Job ${jobId} in queue ${queueType} stalled`);
      this.metricsService.recordQueueJob(queueType, 'job', 'retried');
    });

    // Job progress events
    queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Job ${jobId} in queue ${queueType} progress: ${data}%`);
    });

    // Queue error events
    queue.on('error', error => {
      this.logger.error(`Queue ${queueType} error:`, error);
    });
  }

  /**
   * Add a job to a specific queue with intelligent scheduling
   */
  async addJob<T = any>(
    queueType: QueueType,
    jobName: string,
    data: T,
    options: EnhancedJobOptions = {},
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    try {
      // Get enhanced job options with intelligent scheduling
      const jobOptions = this.queueConfig.getEnhancedJobOptions(queueType, {
        ...options,
        delay: options.delay || this.calculateIntelligentDelay(options),
      });

      const job = await queue.add(jobName, data, jobOptions);

      this.logger.debug(
        `Job ${job.id} added to queue ${queueType} with priority ${jobOptions.priority}`,
      );
      this.metricsService.recordQueueJob(queueType, 'job', 'started');

      return job;
    } catch (error) {
      this.logger.error(`Failed to add job to queue ${queueType}:`, error);
      throw error;
    }
  }

  /**
   * Add multiple jobs in bulk with optimized batching
   */
  async addBulkJobs<T = any>(
    queueType: QueueType,
    jobs: Array<{ name: string; data: T; opts?: EnhancedJobOptions }>,
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    try {
      const bulkJobs = jobs.map(({ name, data, opts = {} }) => ({
        name,
        data,
        opts: this.queueConfig.getEnhancedJobOptions(queueType, opts),
      }));

      const addedJobs = await queue.addBulk(bulkJobs);

      this.logger.log(`Added ${addedJobs.length} jobs to queue ${queueType}`);
      this.metricsService.recordQueueJob(queueType, 'bulk_added', 'started');

      return addedJobs;
    } catch (error) {
      this.logger.error(`Failed to add bulk jobs to queue ${queueType}:`, error);
      throw error;
    }
  }

  /**
   * Get queue metrics for monitoring
   */
  /** The Queue instance for a type, if it has been registered. */
  getQueue(queueType: QueueType): Queue | undefined {
    return this.queues.get(queueType);
  }

  async getQueueMetrics(queueType: QueueType): Promise<QueueMetrics> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.isPaused(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused ? 1 : 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get metrics for queue ${queueType}:`, error);
      throw error;
    }
  }

  /**
   * Get metrics for all queues
   */
  async getAllQueueMetrics(): Promise<Record<QueueType, QueueMetrics>> {
    const metrics: Record<string, QueueMetrics> = {};

    for (const queueType of this.queues.keys()) {
      try {
        metrics[queueType] = await this.getQueueMetrics(queueType);
      } catch (error) {
        this.logger.error(`Failed to get metrics for queue ${queueType}:`, error);
        metrics[queueType] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        };
      }
    }

    return metrics as Record<QueueType, QueueMetrics>;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueType: QueueType): Promise<void> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    await queue.pause();
    this.logger.log(`Queue ${queueType} paused`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueType: QueueType): Promise<void> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    await queue.resume();
    this.logger.log(`Queue ${queueType} resumed`);
  }

  /**
   * Clean up completed and failed jobs
   */
  async cleanQueue(
    queueType: QueueType,
    grace: number = 24 * 60 * 60 * 1000, // 24 hours
    limit: number = 100,
  ): Promise<number> {
    const queue = this.queues.get(queueType);
    if (!queue) {
      throw new Error(`Queue ${queueType} not found`);
    }

    try {
      const [completedCount, failedCount] = await Promise.all([
        queue.clean(grace, limit, 'completed'),
        queue.clean(grace, limit, 'failed'),
      ]);

      const totalCleaned =
        (Array.isArray(completedCount) ? completedCount.length : completedCount || 0) +
        (Array.isArray(failedCount) ? failedCount.length : failedCount || 0);

      this.logger.log(
        `Cleaned queue ${queueType}: ${completedCount} completed, ${failedCount} failed jobs`,
      );

      return totalCleaned;
    } catch (error) {
      this.logger.error(`Failed to clean queue ${queueType}:`, error);
      throw error;
    }
  }

  /**
   * Get system health status for all queues
   */
  async getQueueHealth(): Promise<{
    healthy: boolean;
    queues: Record<QueueType, { healthy: boolean; metrics: QueueMetrics }>;
    systemLoad: SystemLoad;
  }> {
    const queueHealth: Record<string, { healthy: boolean; metrics: QueueMetrics }> = {};
    let overallHealthy = true;

    for (const queueType of this.queues.keys()) {
      try {
        const metrics = await this.getQueueMetrics(queueType);
        const healthy = this.isQueueHealthy(metrics);

        queueHealth[queueType] = { healthy, metrics };

        if (!healthy) {
          overallHealthy = false;
        }
      } catch (error) {
        this.logger.error(`Health check failed for queue ${queueType}:`, error);
        queueHealth[queueType] = {
          healthy: false,
          metrics: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: 0,
          },
        };
        overallHealthy = false;
      }
    }

    return {
      healthy: overallHealthy,
      queues: queueHealth as Record<QueueType, { healthy: boolean; metrics: QueueMetrics }>,
      systemLoad: this.systemLoad,
    };
  }

  private calculateIntelligentDelay(options: EnhancedJobOptions): number {
    return this.queueConfig.calculateJobDelay(
      options.priority || JobPriority.NORMAL,
      options.userTier || 'free',
      this.systemLoad.queueLoad,
    );
  }

  private isQueueHealthy(metrics: QueueMetrics): boolean {
    // Consider queue unhealthy if:
    // - Too many failed jobs (>10% of total processed)
    // - Too many waiting jobs (>1000)
    // - Queue is paused
    const totalProcessed = metrics.completed + metrics.failed;
    const failureRate = totalProcessed > 0 ? metrics.failed / totalProcessed : 0;

    return failureRate < 0.1 && metrics.waiting < 1000 && metrics.paused === 0;
  }

  private startSystemLoadMonitoring() {
    this.loadCheckInterval = setInterval(async () => {
      try {
        await this.updateSystemLoad();
      } catch (error) {
        this.logger.error('Failed to update system load:', error);
      }
    }, 30000); // Update every 30 seconds
  }

  private async updateSystemLoad() {
    try {
      // Calculate queue load based on all queue metrics
      const allMetrics = await this.getAllQueueMetrics();
      let totalWaiting = 0;
      let totalActive = 0;

      for (const metrics of Object.values(allMetrics)) {
        totalWaiting += metrics.waiting;
        totalActive += metrics.active;
      }

      // Simple queue load calculation (0-1 scale)
      const queueLoad = Math.min((totalWaiting + totalActive) / 1000, 1);

      // Update system load (simplified - in production, you'd get actual CPU/memory metrics)
      this.systemLoad = {
        cpu: Math.random() * 0.5 + 0.2, // Simulated CPU load
        memory: Math.random() * 0.3 + 0.3, // Simulated memory load
        queueLoad,
      };

      // Log high load warnings
      if (this.systemLoad.queueLoad > 0.8) {
        this.logger.warn(
          `High queue load detected: ${(this.systemLoad.queueLoad * 100).toFixed(1)}%`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to calculate system load:', error);
    }
  }

  private async closeAllQueues() {
    const closePromises: Promise<void>[] = [];

    // Close all queues
    for (const [queueType, queue] of this.queues) {
      closePromises.push(
        queue.close().catch(error => {
          this.logger.error(`Failed to close queue ${queueType}:`, error);
        }),
      );
    }

    // Close all queue events
    for (const [queueType, queueEvents] of this.queueEvents) {
      closePromises.push(
        queueEvents.close().catch(error => {
          this.logger.error(`Failed to close queue events ${queueType}:`, error);
        }),
      );
    }

    await Promise.all(closePromises);
    this.queues.clear();
    this.queueEvents.clear();
  }
}
