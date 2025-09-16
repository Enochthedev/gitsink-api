import { Resolver, Query, Subscription } from '@nestjs/graphql';
import { Inject, Logger } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { SystemHealthStatus, ServiceHealthStatus } from '../common/dto/subscription.dto';
import { HealthService } from './health.service';

@Resolver()
export class HealthResolver {
  private readonly logger = new Logger(HealthResolver.name);

  constructor(
    @Inject('PUB_SUB') private pubSub: PubSub,
    private readonly healthService: HealthService,
  ) {
    // Start publishing health updates periodically
    this.startHealthUpdates();
  }

  @Query(() => SystemHealthStatus)
  async systemHealth(): Promise<SystemHealthStatus> {
    try {
      const health = await this.healthService.getOverallHealth();

      // Convert service health to GraphQL format
      const services: ServiceHealthStatus[] = Object.entries(health.services).map(
        ([name, status]) => ({
          name,
          status: status.status,
          responseTime: status.responseTime,
          lastCheck: status.lastCheck,
          error: status.error,
          details: status.details,
        }),
      );

      return {
        status: health.status,
        services,
        metrics: {
          cpuUsage: health.metrics.cpuUsage,
          memoryUsage: health.metrics.memoryUsage,
          diskUsage: health.metrics.diskUsage,
          activeConnections: health.metrics.activeConnections,
          queueSize: health.metrics.queueSize,
          averageResponseTime: health.metrics.averageResponseTime,
          errorRate: health.metrics.errorRate,
          throughput: health.metrics.throughput,
        },
        timestamp: health.timestamp,
        uptime: health.uptime,
        version: health.version,
      };
    } catch (error) {
      this.logger.error('Failed to get system health for GraphQL', error);

      // Return a fallback health status
      return {
        status: 'unhealthy',
        services: [],
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          activeConnections: 0,
          queueSize: 0,
          averageResponseTime: 0,
          errorRate: 100,
          throughput: 0,
        },
        timestamp: new Date(),
        uptime: process.uptime(),
        version: process.env.APP_VERSION || '1.0.0',
      };
    }
  }

  @Query(() => ServiceHealthStatus)
  async serviceHealth(name: string): Promise<ServiceHealthStatus> {
    try {
      let status;
      switch (name.toLowerCase()) {
        case 'database':
          status = await this.healthService.checkDatabase();
          break;
        case 'redis':
          status = await this.healthService.checkRedis();
          break;
        case 'queues':
          status = await this.healthService.checkQueues();
          break;
        default:
          throw new Error(`Unknown service: ${name}`);
      }

      return {
        name,
        status: status.status,
        responseTime: status.responseTime,
        lastCheck: status.lastCheck,
        error: status.error,
        details: status.details,
      };
    } catch (error) {
      this.logger.error(`Failed to get health for service ${name}`, error);
      return {
        name,
        status: 'down',
        responseTime: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Subscription(() => SystemHealthStatus)
  systemHealthUpdates() {
    return (this.pubSub as any).asyncIterator('systemHealth');
  }

  @Subscription(() => ServiceHealthStatus)
  serviceHealthUpdates() {
    return (this.pubSub as any).asyncIterator('serviceHealth');
  }

  private startHealthUpdates() {
    // Publish health updates every 30 seconds
    setInterval(async () => {
      try {
        const health = await this.systemHealth();
        await this.pubSub.publish('systemHealth', {
          systemHealthUpdates: health,
        });

        // Publish individual service updates
        for (const service of health.services) {
          await this.pubSub.publish('serviceHealth', {
            serviceHealthUpdates: service,
          });
        }
      } catch (error) {
        this.logger.error('Failed to publish health updates', error);
      }
    }, 30000);
  }
}
