import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseWorkerService, WorkerMetrics } from '../workers/base-worker.service';
import { EmailWorkerService } from '../workers/email-worker.service';
import { SyncWorkerService } from '../workers/sync-worker.service';
import { AIEnrichmentWorkerService } from '../workers/ai-enrichment-worker.service';
import { QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';

export interface WorkerStatus {
  queueType: QueueType;
  workerName: string;
  isHealthy: boolean;
  metrics: WorkerMetrics;
  lastHealthCheck: Date;
}

export interface WorkerRegistryHealth {
  totalWorkers: number;
  healthyWorkers: number;
  unhealthyWorkers: number;
  workers: WorkerStatus[];
  overallHealth: 'healthy' | 'degraded' | 'critical';
}

@Injectable()
export class WorkerRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRegistryService.name);
  private workers = new Map<QueueType, BaseWorkerService>();
  private workerInstances: BaseWorkerService[] = [];
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly emailWorker: EmailWorkerService,
    private readonly syncWorker: SyncWorkerService,
    private readonly aiEnrichmentWorker: AIEnrichmentWorkerService,
  ) {}

  async onModuleInit() {
    await this.registerWorkers();
    this.startHealthChecking();
    this.logger.log('Worker Registry initialized with all workers');
  }

  async onModuleDestroy() {
    await this.shutdownAllWorkers();
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.logger.log('Worker Registry destroyed');
  }

  /**
   * Register all available workers
   */
  private async registerWorkers() {
    // Register email worker
    this.workers.set(QueueType.EMAIL, this.emailWorker);
    this.workerInstances.push(this.emailWorker);

    // Register sync worker
    this.workers.set(QueueType.SYNC, this.syncWorker);
    this.workerInstances.push(this.syncWorker);

    // Register AI enrichment worker
    this.workers.set(QueueType.AI_ENRICHMENT, this.aiEnrichmentWorker);
    this.workerInstances.push(this.aiEnrichmentWorker);

    this.logger.log(`Registered ${this.workerInstances.length} workers`);
  }

  /**
   * Get worker for a specific queue type
   */
  getWorker(queueType: QueueType): BaseWorkerService | undefined {
    return this.workers.get(queueType);
  }

  /**
   * Get all registered workers
   */
  getAllWorkers(): Map<QueueType, BaseWorkerService> {
    return new Map(this.workers);
  }

  /**
   * Get worker status for a specific queue type
   */
  getWorkerStatus(queueType: QueueType): WorkerStatus | undefined {
    const worker = this.workers.get(queueType);
    if (!worker) return undefined;

    return {
      queueType,
      workerName: (worker as any).getWorkerName(),
      isHealthy: worker.isHealthy(),
      metrics: worker.getMetrics(),
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Get status for all workers
   */
  getAllWorkerStatuses(): WorkerStatus[] {
    const statuses: WorkerStatus[] = [];

    for (const [queueType, worker] of this.workers) {
      statuses.push({
        queueType,
        workerName: (worker as any).getWorkerName(),
        isHealthy: worker.isHealthy(),
        metrics: worker.getMetrics(),
        lastHealthCheck: new Date(),
      });
    }

    return statuses;
  }

  /**
   * Get overall worker registry health
   */
  getWorkerRegistryHealth(): WorkerRegistryHealth {
    const workers = this.getAllWorkerStatuses();
    const healthyWorkers = workers.filter(w => w.isHealthy).length;
    const unhealthyWorkers = workers.length - healthyWorkers;

    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (unhealthyWorkers > 0) {
      const unhealthyRatio = unhealthyWorkers / workers.length;
      if (unhealthyRatio >= 0.5) {
        overallHealth = 'critical';
      } else {
        overallHealth = 'degraded';
      }
    }

    return {
      totalWorkers: workers.length,
      healthyWorkers,
      unhealthyWorkers,
      workers,
      overallHealth,
    };
  }

  /**
   * Restart a specific worker
   */
  async restartWorker(queueType: QueueType): Promise<boolean> {
    const worker = this.workers.get(queueType);
    if (!worker) {
      this.logger.error(`Worker for queue ${queueType} not found`);
      return false;
    }

    try {
      this.logger.log(`Restarting worker for queue ${queueType}`);

      // Destroy and reinitialize the worker
      await worker.onModuleDestroy();
      await worker.onModuleInit();

      this.logger.log(`Successfully restarted worker for queue ${queueType}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to restart worker for queue ${queueType}:`, error);
      return false;
    }
  }

  /**
   * Restart all unhealthy workers
   */
  async restartUnhealthyWorkers(): Promise<{
    restarted: QueueType[];
    failed: QueueType[];
  }> {
    const restarted: QueueType[] = [];
    const failed: QueueType[] = [];

    for (const [queueType, worker] of this.workers) {
      if (!worker.isHealthy()) {
        const success = await this.restartWorker(queueType);
        if (success) {
          restarted.push(queueType);
        } else {
          failed.push(queueType);
        }
      }
    }

    if (restarted.length > 0) {
      this.logger.log(`Restarted unhealthy workers: ${restarted.join(', ')}`);
    }
    if (failed.length > 0) {
      this.logger.error(`Failed to restart workers: ${failed.join(', ')}`);
    }

    return { restarted, failed };
  }

  /**
   * Get aggregated metrics from all workers
   */
  getAggregatedMetrics(): {
    totalProcessed: number;
    totalCompleted: number;
    totalFailed: number;
    totalActive: number;
    averageProcessingTime: number;
    workerMetrics: Record<QueueType, WorkerMetrics>;
  } {
    let totalProcessed = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalActive = 0;
    let totalProcessingTime = 0;
    let workersWithProcessingTime = 0;

    const workerMetrics: Record<string, WorkerMetrics> = {};

    for (const [queueType, worker] of this.workers) {
      const metrics = worker.getMetrics();
      workerMetrics[queueType] = metrics;

      totalProcessed += metrics.processed;
      totalCompleted += metrics.completed;
      totalFailed += metrics.failed;
      totalActive += metrics.active;

      if (metrics.averageProcessingTime > 0) {
        totalProcessingTime += metrics.averageProcessingTime;
        workersWithProcessingTime++;
      }
    }

    const averageProcessingTime =
      workersWithProcessingTime > 0 ? totalProcessingTime / workersWithProcessingTime : 0;

    return {
      totalProcessed,
      totalCompleted,
      totalFailed,
      totalActive,
      averageProcessingTime,
      workerMetrics: workerMetrics as Record<QueueType, WorkerMetrics>,
    };
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking() {
    const healthCheckInterval = this.configService.get<number>(
      'WORKER_HEALTH_CHECK_INTERVAL',
      60000,
    );

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Worker health check failed:', error);
      }
    }, healthCheckInterval);

    this.logger.log(`Started worker health checking with ${healthCheckInterval}ms interval`);
  }

  /**
   * Perform health check on all workers
   */
  private async performHealthCheck() {
    const health = this.getWorkerRegistryHealth();

    // Record metrics
    this.metricsService.recordQueueJob('worker_registry', 'health_check', 'completed');

    // Log warnings for unhealthy workers
    if (health.overallHealth !== 'healthy') {
      this.logger.warn(
        `Worker registry health: ${health.overallHealth} ` +
          `(${health.unhealthyWorkers}/${health.totalWorkers} unhealthy)`,
      );

      // Auto-restart unhealthy workers if enabled
      const autoRestart = this.configService.get<boolean>('WORKER_AUTO_RESTART', true);
      if (autoRestart && health.unhealthyWorkers > 0) {
        await this.restartUnhealthyWorkers();
      }
    }

    // Record individual worker metrics
    for (const workerStatus of health.workers) {
      this.metricsService.recordQueueJob(
        workerStatus.queueType,
        workerStatus.isHealthy ? 'worker_healthy' : 'worker_unhealthy',
        workerStatus.isHealthy ? 'completed' : 'failed',
      );
    }
  }

  /**
   * Shutdown all workers gracefully
   */
  private async shutdownAllWorkers() {
    this.logger.log('Shutting down all workers...');

    const shutdownPromises = this.workerInstances.map(async worker => {
      try {
        await worker.onModuleDestroy();
      } catch (error) {
        this.logger.error('Error shutting down worker:', error);
      }
    });

    await Promise.all(shutdownPromises);
    this.workers.clear();
    this.workerInstances = [];

    this.logger.log('All workers shut down');
  }
}
