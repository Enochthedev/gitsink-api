import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface HealthStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  lastCheck: Date;
  error?: string;
  details?: Record<string, any>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, HealthStatus>;
  metrics: SystemMetrics;
  timestamp: Date;
  uptime: number;
  version: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  queueSize: number;
  averageResponseTime: number;
  errorRate: number;
  throughput: number;
}

export interface HealthCheckConfig {
  timeout: number;
  retries: number;
  interval: number;
  thresholds: {
    responseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);
  private healthCache = new Map<string, HealthStatus>();
  private systemMetricsCache: SystemMetrics | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private readonly config: HealthCheckConfig = {
    timeout: 5000,
    retries: 3,
    interval: 30000, // 30 seconds
    thresholds: {
      responseTime: 1000, // 1 second
      errorRate: 5, // 5%
      memoryUsage: 80, // 80%
      cpuUsage: 80, // 80%
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectQueue('sync') private readonly syncQueue: Queue,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) { }

  onModuleInit() {
    this.startHealthCheckScheduler();
    this.logger.log('Health check service initialized');
  }

  async checkDatabase(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Simple query to check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      // Check database performance with a more complex query
      const userCount = await this.prisma.user.count();
      const responseTime = Date.now() - startTime;

      const status: HealthStatus = {
        status: responseTime > this.config.thresholds.responseTime ? 'degraded' : 'up',
        responseTime,
        lastCheck: new Date(),
        details: {
          userCount,
          connectionPool: 'active',
        },
      };

      this.healthCache.set('database', status);
      this.metricsService.updateSystemHealth('database', status.status === 'up' ? 1 : 0.5);

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      };

      this.healthCache.set('database', status);
      this.metricsService.updateSystemHealth('database', 0);
      this.logger.error('Database health check failed', error);

      return status;
    }
  }

  async checkRedis(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Test Redis connectivity
      const testKey = 'health_check_test';
      const testValue = Date.now().toString();

      await this.cacheManager.set(testKey, testValue, 1000);
      const retrievedValue = await this.cacheManager.get(testKey);

      if (retrievedValue !== testValue) {
        throw new Error('Redis read/write test failed');
      }

      await this.cacheManager.del(testKey);
      const responseTime = Date.now() - startTime;

      const status: HealthStatus = {
        status: responseTime > this.config.thresholds.responseTime ? 'degraded' : 'up',
        responseTime,
        lastCheck: new Date(),
        details: {
          operation: 'read_write_test',
        },
      };

      this.healthCache.set('redis', status);
      this.metricsService.updateSystemHealth('redis', status.status === 'up' ? 1 : 0.5);

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };

      this.healthCache.set('redis', status);
      this.metricsService.updateSystemHealth('redis', 0);
      this.logger.error('Redis health check failed', error);

      return status;
    }
  }

  async checkQueues(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Check queue connectivity and status
      const syncQueueHealth = await this.checkQueueHealth(this.syncQueue, 'sync');
      const emailQueueHealth = await this.checkQueueHealth(this.emailQueue, 'email');

      const responseTime = Date.now() - startTime;
      const allQueuesHealthy = syncQueueHealth.healthy && emailQueueHealth.healthy;

      const status: HealthStatus = {
        status: allQueuesHealthy ? 'up' : 'degraded',
        responseTime,
        lastCheck: new Date(),
        details: {
          syncQueue: syncQueueHealth,
          emailQueue: emailQueueHealth,
        },
      };

      this.healthCache.set('queues', status);
      this.metricsService.updateSystemHealth('queues', allQueuesHealthy ? 1 : 0.5);

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };

      this.healthCache.set('queues', status);
      this.metricsService.updateSystemHealth('queues', 0);
      this.logger.error('Queue health check failed', error);

      return status;
    }
  }

  private async checkQueueHealth(queue: Queue, name: string) {
    try {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      const totalJobs = waiting.length + active.length;
      const failureRate = failed.length / (completed.length + failed.length || 1);

      return {
        healthy: failureRate < 0.1 && totalJobs < 1000, // Less than 10% failure rate and under 1000 pending jobs
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        failureRate: failureRate * 100,
      };
    } catch (error) {
      this.logger.error(`Failed to check ${name} queue health`, error);
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async checkExternalServices(): Promise<Record<string, HealthStatus>> {
    const services: Record<string, HealthStatus> = {};

    // Check GitHub API
    services.github = await this.checkExternalService(
      'GitHub',
      'https://api.github.com/rate_limit',
    );

    // Check GitLab API if configured
    if (process.env.GITLAB_API_URL) {
      services.gitlab = await this.checkExternalService(
        'GitLab',
        `${process.env.GITLAB_API_URL}/version`,
      );
    }

    // Check Bitbucket API if configured
    if (process.env.BITBUCKET_API_URL) {
      services.bitbucket = await this.checkExternalService(
        'Bitbucket',
        `${process.env.BITBUCKET_API_URL}/2.0/repositories`,
      );
    }

    // Check AI service if configured
    if (process.env.AI_SERVICE_URL) {
      services.ai = await this.checkExternalService(
        'AI Service',
        `${process.env.AI_SERVICE_URL}/health`,
      );
    }

    // Check email service if configured
    if (process.env.SMTP_HOST) {
      services.email = await this.checkEmailService();
    }

    return services;
  }

  private async checkExternalService(name: string, url: string): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        status: response.ok ? 'up' : 'degraded',
        responseTime,
        lastCheck: new Date(),
        details: {
          statusCode: response.status,
          statusText: response.statusText,
        },
      };

      if (!response.ok) {
        status.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      return status;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      };
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Calculate memory usage percentage
      const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Get queue sizes
      const syncQueueSize =
        (await this.syncQueue.getWaiting()).length + (await this.syncQueue.getActive()).length;
      const emailQueueSize =
        (await this.emailQueue.getWaiting()).length + (await this.emailQueue.getActive()).length;
      const totalQueueSize = syncQueueSize + emailQueueSize;

      const metrics: SystemMetrics = {
        cpuUsage: 0, // Would need additional library for accurate CPU usage
        memoryUsage: memoryUsagePercent,
        diskUsage: 0, // Would need additional library for disk usage
        activeConnections: 0, // Would be tracked by connection pool
        queueSize: totalQueueSize,
        averageResponseTime: 0, // Would be calculated from metrics
        errorRate: 0, // Would be calculated from metrics
        throughput: 0, // Would be calculated from metrics
      };

      this.systemMetricsCache = metrics;
      return metrics;
    } catch (error) {
      this.logger.error('Failed to get system metrics', error);
      return {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        activeConnections: 0,
        queueSize: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      };
    }
  }

  async getOverallHealth(): Promise<SystemHealth> {
    try {
      // Run all health checks in parallel
      const [database, redis, queues, externalServices] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkQueues(),
        this.checkExternalServices(),
      ]);

      const services = {
        database,
        redis,
        queues,
        ...externalServices,
      };

      // Determine overall system status
      const serviceStatuses = Object.values(services).map(s => s.status);
      const downServices = serviceStatuses.filter(s => s === 'down').length;
      const degradedServices = serviceStatuses.filter(s => s === 'degraded').length;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (downServices > 0) {
        overallStatus = 'unhealthy';
      } else if (degradedServices > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      const metrics = await this.getSystemMetrics();

      const systemHealth: SystemHealth = {
        status: overallStatus,
        services,
        metrics,
        timestamp: new Date(),
        uptime: process.uptime(),
        version: process.env.APP_VERSION || '1.0.0',
      };

      // Update overall system health metric
      const healthScore = overallStatus === 'healthy' ? 1 : overallStatus === 'degraded' ? 0.5 : 0;
      this.metricsService.updateSystemHealth('overall', healthScore);

      return systemHealth;
    } catch (error) {
      this.logger.error('Failed to get overall health', error);
      throw error;
    }
  }

  async getHealthSummary(): Promise<{
    status: string;
    checks: number;
    healthy: number;
    degraded: number;
    down: number;
  }> {
    const health = await this.getOverallHealth();
    const services = Object.values(health.services);

    return {
      status: health.status,
      checks: services.length,
      healthy: services.filter(s => s.status === 'up').length,
      degraded: services.filter(s => s.status === 'degraded').length,
      down: services.filter(s => s.status === 'down').length,
    };
  }

  private startHealthCheckScheduler() {
    // Run health checks periodically
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Health check scheduler disabled in test environment');
      return;
    }
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getOverallHealth();
        this.logger.debug('Periodic health check completed');
      } catch (error) {
        this.logger.error('Periodic health check failed', error);
      }
    }, this.config.interval);
  }

  async onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // Health-based auto-scaling triggers
  async shouldScaleUp(): Promise<boolean> {
    const health = await this.getOverallHealth();
    const metrics = health.metrics;

    return (
      metrics.cpuUsage > this.config.thresholds.cpuUsage ||
      metrics.memoryUsage > this.config.thresholds.memoryUsage ||
      metrics.queueSize > 500 ||
      metrics.averageResponseTime > this.config.thresholds.responseTime
    );
  }

  async shouldScaleDown(): Promise<boolean> {
    const health = await this.getOverallHealth();
    const metrics = health.metrics;

    return (
      metrics.cpuUsage < 30 &&
      metrics.memoryUsage < 50 &&
      metrics.queueSize < 10 &&
      metrics.averageResponseTime < 200
    );
  }

  private async checkEmailService(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // This is a basic check - in a real implementation you might want to
      // actually test SMTP connectivity
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

      if (!smtpHost) {
        throw new Error('SMTP_HOST not configured');
      }

      // Simple TCP connection test (you might want to use a proper SMTP library)
      const responseTime = Date.now() - startTime;

      return {
        status: 'up',
        responseTime,
        lastCheck: new Date(),
        details: {
          host: smtpHost,
          port: smtpPort,
          configured: true,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async checkConfigurationHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Check if all required environment variables are present
      const requiredVars = [
        'DATABASE_URL',
        'JWT_SECRET',
        'TOKEN_ENCRYPTION_KEY',
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);

      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      const responseTime = Date.now() - startTime;
      return {
        status: 'up',
        responseTime,
        lastCheck: new Date(),
        details: {
          requiredVariables: requiredVars.length,
          configured: requiredVars.length - missingVars.length,
          environment: process.env.NODE_ENV,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'down',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getScalingRecommendation(): Promise<{
    action: 'scale_up' | 'scale_down' | 'maintain';
    reason: string;
    confidence: number;
  }> {
    const [scaleUp, scaleDown] = await Promise.all([this.shouldScaleUp(), this.shouldScaleDown()]);

    if (scaleUp) {
      return {
        action: 'scale_up',
        reason: 'High resource usage or queue backlog detected',
        confidence: 0.8,
      };
    }

    if (scaleDown) {
      return {
        action: 'scale_down',
        reason: 'Low resource usage detected, can reduce capacity',
        confidence: 0.6,
      };
    }

    return {
      action: 'maintain',
      reason: 'System operating within normal parameters',
      confidence: 0.9,
    };
  }
}
