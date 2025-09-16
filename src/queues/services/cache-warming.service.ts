import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EnhancedCacheService } from './enhanced-cache.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface WarmingStrategy {
  name: string;
  enabled: boolean;
  schedule?: string;
  priority: number;
  execute: () => Promise<Array<{ key: string; value: any; ttl?: number }>>;
}

export interface WarmingResult {
  strategy: string;
  entriesWarmed: number;
  duration: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmingService.name);
  private strategies = new Map<string, WarmingStrategy>();
  private isWarming = false;

  constructor(
    private readonly cacheService: EnhancedCacheService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    await this.registerDefaultStrategies();
    this.logger.log('Cache Warming Service initialized');
  }

  /**
   * Register a cache warming strategy
   */
  registerStrategy(strategy: WarmingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.log(`Registered cache warming strategy: ${strategy.name}`);
  }

  /**
   * Execute a specific warming strategy
   */
  async executeStrategy(strategyName: string): Promise<WarmingResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Warming strategy '${strategyName}' not found`);
    }

    if (!strategy.enabled) {
      return {
        strategy: strategyName,
        entriesWarmed: 0,
        duration: 0,
        success: false,
        error: 'Strategy is disabled',
      };
    }

    const startTime = Date.now();
    this.logger.log(`Executing warming strategy: ${strategyName}`);

    try {
      const entries = await strategy.execute();
      await this.cacheService.warmCache(entries);

      const duration = Date.now() - startTime;
      const result: WarmingResult = {
        strategy: strategyName,
        entriesWarmed: entries.length,
        duration,
        success: true,
      };

      this.logger.log(
        `Warming strategy '${strategyName}' completed: ${entries.length} entries in ${duration}ms`,
      );

      // Record metrics
      this.metricsService.recordQueueJob('cache_warming', 'warming', 'completed', duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: WarmingResult = {
        strategy: strategyName,
        entriesWarmed: 0,
        duration,
        success: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      };

      this.logger.error(`Warming strategy '${strategyName}' failed:`, error);
      this.metricsService.recordQueueJob('cache_warming', 'warming', 'failed', duration);

      return result;
    }
  }

  /**
   * Execute all enabled warming strategies
   */
  async executeAllStrategies(): Promise<WarmingResult[]> {
    if (this.isWarming) {
      throw new Error('Cache warming is already in progress');
    }

    this.isWarming = true;
    const results: WarmingResult[] = [];

    try {
      // Sort strategies by priority (higher priority first)
      const sortedStrategies = Array.from(this.strategies.values())
        .filter(s => s.enabled)
        .sort((a, b) => b.priority - a.priority);

      for (const strategy of sortedStrategies) {
        const result = await this.executeStrategy(strategy.name);
        results.push(result);
      }

      const totalEntries = results.reduce((sum, r) => sum + r.entriesWarmed, 0);
      const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

      this.logger.log(
        `Cache warming completed: ${totalEntries} entries warmed in ${totalDuration}ms`,
      );

      return results;
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Get warming statistics
   */
  getWarmingStats(): {
    totalStrategies: number;
    enabledStrategies: number;
    isWarming: boolean;
    strategies: Array<{ name: string; enabled: boolean; priority: number }>;
  } {
    const strategies = Array.from(this.strategies.values()).map(s => ({
      name: s.name,
      enabled: s.enabled,
      priority: s.priority,
    }));

    return {
      totalStrategies: this.strategies.size,
      enabledStrategies: strategies.filter(s => s.enabled).length,
      isWarming: this.isWarming,
      strategies,
    };
  }

  /**
   * Scheduled cache warming - runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledWarming() {
    if (!this.configService.get<boolean>('CACHE_WARMING_ENABLED', true)) {
      return;
    }

    try {
      this.logger.log('Starting scheduled cache warming');
      await this.executeAllStrategies();
    } catch (error) {
      this.logger.error('Scheduled cache warming failed:', error);
    }
  }

  /**
   * Register default warming strategies
   */
  private async registerDefaultStrategies() {
    // Strategy 1: Warm frequently accessed user data
    this.registerStrategy({
      name: 'user-profiles',
      enabled: this.configService.get<boolean>('CACHE_WARM_USER_PROFILES', true),
      priority: 10,
      execute: async () => {
        // This would typically fetch from database
        // For now, return mock data
        return [
          {
            key: 'user:active:list',
            value: ['user1', 'user2', 'user3'],
            ttl: 300000,
          },
          {
            key: 'user:stats:global',
            value: { totalUsers: 1000, activeUsers: 500 },
            ttl: 600000,
          },
        ];
      },
    });

    // Strategy 2: Warm popular project data
    this.registerStrategy({
      name: 'popular-projects',
      enabled: this.configService.get<boolean>('CACHE_WARM_POPULAR_PROJECTS', true),
      priority: 8,
      execute: async () => {
        // This would typically fetch popular projects from database
        return [
          {
            key: 'projects:popular:list',
            value: ['proj1', 'proj2', 'proj3'],
            ttl: 600000,
          },
          {
            key: 'projects:trending:weekly',
            value: ['proj4', 'proj5'],
            ttl: 3600000,
          },
        ];
      },
    });

    // Strategy 3: Warm system configuration
    this.registerStrategy({
      name: 'system-config',
      enabled: this.configService.get<boolean>('CACHE_WARM_SYSTEM_CONFIG', true),
      priority: 9,
      execute: async () => {
        return [
          {
            key: 'system:config:features',
            value: {
              aiEnrichment: true,
              multiPlatform: true,
              publicProfiles: true,
            },
            ttl: 1800000, // 30 minutes
          },
          {
            key: 'system:limits:default',
            value: {
              apiCallsPerHour: 1000,
              projectsPerUser: 100,
            },
            ttl: 1800000,
          },
        ];
      },
    });

    // Strategy 4: Warm API response templates
    this.registerStrategy({
      name: 'api-templates',
      enabled: this.configService.get<boolean>('CACHE_WARM_API_TEMPLATES', true),
      priority: 5,
      execute: async () => {
        return [
          {
            key: 'api:response:error:templates',
            value: {
              400: 'Bad Request',
              401: 'Unauthorized',
              403: 'Forbidden',
              404: 'Not Found',
              500: 'Internal Server Error',
            },
            ttl: 3600000, // 1 hour
          },
          {
            key: 'api:response:success:templates',
            value: {
              200: 'OK',
              201: 'Created',
              202: 'Accepted',
              204: 'No Content',
            },
            ttl: 3600000,
          },
        ];
      },
    });

    // Strategy 5: Warm frequently used queries
    this.registerStrategy({
      name: 'frequent-queries',
      enabled: this.configService.get<boolean>('CACHE_WARM_FREQUENT_QUERIES', true),
      priority: 7,
      execute: async () => {
        return [
          {
            key: 'query:languages:popular',
            value: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go'],
            ttl: 1800000,
          },
          {
            key: 'query:frameworks:trending',
            value: ['React', 'Vue', 'Angular', 'Express', 'FastAPI'],
            ttl: 1800000,
          },
        ];
      },
    });

    this.logger.log(`Registered ${this.strategies.size} default warming strategies`);
  }
}
