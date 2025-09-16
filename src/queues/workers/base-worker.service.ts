import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job, WorkerOptions } from 'bullmq';
import { QueueConfigService, QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';

export interface WorkerMetrics {
  processed: number;
  completed: number;
  failed: number;
  active: number;
  stalled: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}

export interface JobContext {
  job: Job;
  worker: Worker;
  startTime: number;
  retryCount: number;
}

@Injectable()
export abstract class BaseWorkerService implements OnModuleInit, OnModuleDestroy {
  protected readonly logger = new Logger(this.constructor.name);
  protected worker?: Worker;
  protected metrics: WorkerMetrics = {
    processed: 0,
    completed: 0,
    failed: 0,
    active: 0,
    stalled: 0,
    averageProcessingTime: 0,
  };

  constructor(
    protected readonly queueConfig: QueueConfigService,
    protected readonly metricsService: MetricsService,
    protected readonly queueType: QueueType,
  ) {}

  async onModuleInit() {
    await this.initializeWorker();
    this.logger.log(`Worker for queue ${this.queueType} initialized`);
  }

  async onModuleDestroy() {
    await this.closeWorker();
    this.logger.log(`Worker for queue ${this.queueType} destroyed`);
  }

  /**
   * Abstract method to be implemented by concrete workers
   */
  protected abstract processJob(job: Job, context: JobContext): Promise<any>;

  /**
   * Get worker name for identification
   */
  protected abstract getWorkerName(): string;

  /**
   * Get current worker metrics
   */
  getMetrics(): WorkerMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if worker is healthy
   */
  isHealthy(): boolean {
    if (!this.worker) return false;

    const failureRate =
      this.metrics.processed > 0 ? this.metrics.failed / this.metrics.processed : 0;

    return failureRate < 0.1 && this.metrics.stalled < 10;
  }

  private async initializeWorker() {
    const workerOptions = this.queueConfig.getWorkerOptions(this.queueType);
    const enhancedOptions = this.enhanceWorkerOptions(workerOptions);

    this.worker = new Worker(this.queueType, this.createJobProcessor(), enhancedOptions);

    this.setupEventListeners();
  }

  private createJobProcessor() {
    return async (job: Job) => {
      const startTime = Date.now();
      const context: JobContext = {
        job,
        worker: this.worker!,
        startTime,
        retryCount: job.attemptsMade,
      };

      try {
        this.metrics.active++;
        this.metrics.processed++;

        this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

        const result = await this.processJob(job, context);

        const processingTime = Date.now() - startTime;
        this.updateAverageProcessingTime(processingTime);

        this.metrics.completed++;
        this.metrics.active--;
        this.metrics.lastProcessedAt = new Date();

        this.metricsService.recordQueueJob(this.queueType, 'job', 'completed', processingTime);

        return result;
      } catch (error) {
        const processingTime = Date.now() - startTime;

        this.metrics.failed++;
        this.metrics.active--;

        this.logger.error(`Job ${job.id} failed:`, error);
        this.metricsService.recordQueueJob(this.queueType, 'job', 'failed', processingTime);

        throw error;
      }
    };
  }

  private setupEventListeners() {
    if (!this.worker) return;

    this.worker.on('completed', job => {
      this.logger.debug(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on('stalled', jobId => {
      this.metrics.stalled++;
      this.logger.warn(`Job ${jobId} stalled`);
    });

    this.worker.on('error', err => {
      this.logger.error(`Worker error:`, err);
    });

    this.worker.on('ready', () => {
      this.logger.log(`Worker ${this.getWorkerName()} is ready`);
    });

    this.worker.on('closing', () => {
      this.logger.log(`Worker ${this.getWorkerName()} is closing`);
    });
  }

  private enhanceWorkerOptions(baseOptions: WorkerOptions): WorkerOptions {
    return {
      ...baseOptions,
      // Add worker-specific enhancements
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      settings: {
        stalledInterval: 30 * 1000,
        maxStalledCount: 3,
      } as any,
    };
  }

  private updateAverageProcessingTime(processingTime: number) {
    if (this.metrics.completed === 0) {
      this.metrics.averageProcessingTime = processingTime;
    } else {
      this.metrics.averageProcessingTime =
        (this.metrics.averageProcessingTime * (this.metrics.completed - 1) + processingTime) /
        this.metrics.completed;
    }
  }

  private async closeWorker() {
    if (this.worker) {
      try {
        await this.worker.close();
        this.worker = undefined;
      } catch (error) {
        this.logger.error('Error closing worker:', error);
      }
    }
  }
}
