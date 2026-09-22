import { Injectable, Logger } from '@nestjs/common';
import { EnhancedCacheService } from './enhanced-cache.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface InvalidationRule {
  name: string;
  pattern: string | RegExp;
  tags?: string[];
  cascade?: boolean; // Whether to invalidate related entries
  priority: number;
}

export interface InvalidationResult {
  rule: string;
  keysInvalidated: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface InvalidationEvent {
  type: 'user_update' | 'project_update' | 'system_config' | 'manual' | 'scheduled';
  entityId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private rules = new Map<string, InvalidationRule>();
  private invalidationHistory: Array<{
    event: InvalidationEvent;
    results: InvalidationResult[];
    timestamp: Date;
  }> = [];

  constructor(
    private readonly cacheService: EnhancedCacheService,
    private readonly metricsService: MetricsService,
  ) {
    this.registerDefaultRules();
  }

  /**
   * Register an invalidation rule
   */
  registerRule(rule: InvalidationRule): void {
    this.rules.set(rule.name, rule);
    this.logger.log(`Registered cache invalidation rule: ${rule.name}`);
  }

  /**
   * Invalidate cache based on an event
   */
  async invalidateByEvent(event: InvalidationEvent): Promise<InvalidationResult[]> {
    this.logger.log(`Processing invalidation event: ${event.type}`);

    const applicableRules = this.getApplicableRules(event);
    const results: InvalidationResult[] = [];

    for (const rule of applicableRules) {
      const result = await this.executeRule(rule, event);
      results.push(result);
    }

    // Store in history
    this.invalidationHistory.push({
      event,
      results,
      timestamp: new Date(),
    });

    // Keep only last 1000 entries
    if (this.invalidationHistory.length > 1000) {
      this.invalidationHistory = this.invalidationHistory.slice(-1000);
    }

    const totalInvalidated = results.reduce((sum, r) => sum + r.keysInvalidated, 0);
    this.logger.log(`Invalidation completed: ${totalInvalidated} keys invalidated`);

    // Record metrics
    this.metricsService.recordQueueJob('cache_invalidation', 'invalidation', 'completed');

    return results;
  }

  /**
   * Invalidate cache by specific keys
   */
  async invalidateKeys(keys: string[]): Promise<void> {
    this.logger.log(`Invalidating ${keys.length} specific keys`);

    const promises = keys.map(key =>
      this.cacheService
        .del(key)
        .catch(error => this.logger.error(`Failed to invalidate key ${key}:`, error)),
    );

    await Promise.all(promises);
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    this.logger.log(`Invalidating cache by tags: ${tags.join(', ')}`);

    const cleared = await this.cacheService.clearByTags(tags);

    // Record metrics
    this.metricsService.recordQueueJob('cache_tag_invalidation', 'tag_invalidation', 'completed');

    return cleared;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string | RegExp): Promise<number> {
    this.logger.log(`Invalidating cache by pattern: ${pattern}`);

    // This is a simplified implementation
    // In a real scenario, you'd need to scan Redis keys matching the pattern
    const invalidated = 0;

    try {
      // For now, we'll just log the pattern
      // In production, you'd implement Redis SCAN with pattern matching
      this.logger.debug(`Pattern invalidation not fully implemented: ${pattern}`);

      // Record metrics
      this.metricsService.recordQueueJob(
        'cache_pattern_invalidation',
        'pattern_invalidation',
        'completed',
      );

      return invalidated;
    } catch (error) {
      this.logger.error('Pattern invalidation failed:', error);
      throw error;
    }
  }

  /**
   * Get invalidation statistics
   */
  getInvalidationStats(): {
    totalRules: number;
    recentInvalidations: number;
    averageKeysPerInvalidation: number;
    history: Array<{
      eventType: string;
      keysInvalidated: number;
      timestamp: Date;
    }>;
  } {
    const recentInvalidations = this.invalidationHistory.filter(
      entry => Date.now() - entry.timestamp.getTime() < 24 * 60 * 60 * 1000, // Last 24 hours
    );

    const totalKeys = recentInvalidations.reduce(
      (sum, entry) => sum + entry.results.reduce((s, r) => s + r.keysInvalidated, 0),
      0,
    );

    const averageKeysPerInvalidation =
      recentInvalidations.length > 0 ? totalKeys / recentInvalidations.length : 0;

    const history = this.invalidationHistory.slice(-50).map(entry => ({
      eventType: entry.event.type,
      keysInvalidated: entry.results.reduce((sum, r) => sum + r.keysInvalidated, 0),
      timestamp: entry.timestamp,
    }));

    return {
      totalRules: this.rules.size,
      recentInvalidations: recentInvalidations.length,
      averageKeysPerInvalidation,
      history,
    };
  }

  /**
   * Handle user-related cache invalidation
   */
  async invalidateUserCache(
    userId: string,
    updateType: 'profile' | 'projects' | 'settings' = 'profile',
  ): Promise<void> {
    const event: InvalidationEvent = {
      type: 'user_update',
      entityId: userId,
      userId,
      metadata: { updateType },
      timestamp: new Date(),
    };

    await this.invalidateByEvent(event);
  }

  /**
   * Handle project-related cache invalidation
   */
  async invalidateProjectCache(
    projectId: string,
    userId: string,
    updateType: 'metadata' | 'sync' | 'delete' = 'metadata',
  ): Promise<void> {
    const event: InvalidationEvent = {
      type: 'project_update',
      entityId: projectId,
      userId,
      metadata: { updateType },
      timestamp: new Date(),
    };

    await this.invalidateByEvent(event);
  }

  /**
   * Handle system configuration cache invalidation
   */
  async invalidateSystemCache(configType: string): Promise<void> {
    const event: InvalidationEvent = {
      type: 'system_config',
      metadata: { configType },
      timestamp: new Date(),
    };

    await this.invalidateByEvent(event);
  }

  private getApplicableRules(event: InvalidationEvent): InvalidationRule[] {
    const rules: InvalidationRule[] = [];

    for (const rule of this.rules.values()) {
      if (this.isRuleApplicable(rule, event)) {
        rules.push(rule);
      }
    }

    // Sort by priority (higher priority first)
    return rules.sort((a, b) => b.priority - a.priority);
  }

  private isRuleApplicable(rule: InvalidationRule, event: InvalidationEvent): boolean {
    // Simple rule matching based on rule name and event type
    const ruleName = rule.name.toLowerCase();
    const eventType = event.type.toLowerCase();

    return (
      ruleName.includes(eventType) ||
      ruleName.includes('all') ||
      (event.metadata ? Object.keys(event.metadata).some(key => ruleName.includes(key)) : false)
    );
  }

  private async executeRule(
    rule: InvalidationRule,
    event: InvalidationEvent,
  ): Promise<InvalidationResult> {
    const startTime = Date.now();

    try {
      let keysInvalidated = 0;

      // Invalidate by tags if specified
      if (rule.tags && rule.tags.length > 0) {
        keysInvalidated += await this.invalidateByTags(rule.tags);
      }

      // Invalidate by pattern if specified
      if (rule.pattern) {
        keysInvalidated += await this.invalidateByPattern(rule.pattern);
      }

      // Handle cascade invalidation
      if (rule.cascade && event.entityId) {
        keysInvalidated += await this.handleCascadeInvalidation(rule, event);
      }

      const duration = Date.now() - startTime;

      return {
        rule: rule.name,
        keysInvalidated,
        duration,
        success: true,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`Rule execution failed for ${rule.name}:`, error);

      return {
        rule: rule.name,
        keysInvalidated: 0,
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

  private async handleCascadeInvalidation(
    rule: InvalidationRule,
    event: InvalidationEvent,
  ): Promise<number> {
    // Implement cascade invalidation logic
    // This would invalidate related cache entries based on the entity
    let invalidated = 0;

    if (event.type === 'user_update' && event.userId) {
      // Invalidate user-related caches
      const userKeys = [
        `user:${event.userId}:profile`,
        `user:${event.userId}:projects`,
        `user:${event.userId}:stats`,
      ];
      await this.invalidateKeys(userKeys);
      invalidated += userKeys.length;
    }

    if (event.type === 'project_update' && event.entityId) {
      // Invalidate project-related caches
      const projectKeys = [
        `project:${event.entityId}:metadata`,
        `project:${event.entityId}:analysis`,
        `project:${event.entityId}:stats`,
      ];
      await this.invalidateKeys(projectKeys);
      invalidated += projectKeys.length;
    }

    return invalidated;
  }

  private registerDefaultRules(): void {
    // Rule 1: User profile updates
    this.registerRule({
      name: 'user-profile-update',
      pattern: /^user:.*:profile$/,
      tags: ['user', 'profile'],
      cascade: true,
      priority: 10,
    });

    // Rule 2: Project updates
    this.registerRule({
      name: 'project-update',
      pattern: /^project:.*$/,
      tags: ['project', 'metadata'],
      cascade: true,
      priority: 9,
    });

    // Rule 3: System configuration updates
    this.registerRule({
      name: 'system-config-update',
      pattern: /^system:.*$/,
      tags: ['system', 'config'],
      cascade: false,
      priority: 8,
    });

    // Rule 4: API response cache invalidation
    this.registerRule({
      name: 'api-response-update',
      pattern: /^api:response:.*$/,
      tags: ['api', 'response'],
      cascade: false,
      priority: 5,
    });

    // Rule 5: Statistics cache invalidation
    this.registerRule({
      name: 'stats-update',
      pattern: /^.*:stats$/,
      tags: ['stats', 'analytics'],
      cascade: false,
      priority: 6,
    });

    this.logger.log(`Registered ${this.rules.size} default invalidation rules`);
  }
}
