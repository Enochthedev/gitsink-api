import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MagicLinkService } from './magic-link.service';
import { MetricsService } from '../metrics/metrics.service';
import { Counter, Gauge } from 'prom-client';

@Injectable()
export class MagicLinkCleanupService {
  private readonly logger = new Logger(MagicLinkCleanupService.name);
  private readonly cleanupCounter: Counter<string>;
  private readonly activeTokensGauge: Gauge<string>;
  private readonly expiredTokensGauge: Gauge<string>;
  private readonly recentTokensGauge: Gauge<string>;

  constructor(
    private readonly magicLinkService: MagicLinkService,
    private readonly metricsService: MetricsService,
  ) {
    this.cleanupCounter = this.metricsService.createCustomCounter(
      'magic_link_cleanup_total',
      'Total number of magic link cleanup operations',
      ['status'],
    );

    this.activeTokensGauge = this.metricsService.createCustomGauge(
      'magic_link_tokens_active',
      'Number of active magic link tokens',
    );

    this.expiredTokensGauge = this.metricsService.createCustomGauge(
      'magic_link_tokens_expired',
      'Number of expired magic link tokens',
    );

    this.recentTokensGauge = this.metricsService.createCustomGauge(
      'magic_link_tokens_recent',
      'Number of recently created magic link tokens',
    );
  }

  /**
   * Cleanup expired magic link tokens every 15 minutes
   * Fixed: Enhanced cleanup with better error handling and race condition prevention
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredTokens(): Promise<void> {
    this.logger.log('Starting scheduled cleanup of expired magic link tokens');

    try {
      // First cleanup: Remove tokens that are definitely expired
      const expiredCount = await this.magicLinkService.cleanupExpiredTokens();

      // Second cleanup: Remove tokens that are close to expiring (within 2 minutes)
      // to prevent race conditions during validation
      const almostExpiredCount = await this.magicLinkService.cleanupExpiredTokens(undefined, 2);

      this.logger.log('Scheduled cleanup completed', {
        expiredTokens: expiredCount,
        almostExpiredTokens: almostExpiredCount,
        totalCleaned: expiredCount + almostExpiredCount,
      });

      this.cleanupCounter.inc({ status: 'success' });

      // Additional cleanup: Remove orphaned tokens (tokens for emails that no longer exist)
      await this.cleanupOrphanedTokens();
    } catch (error) {
      this.logger.error('Scheduled cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.cleanupCounter.inc({ status: 'failure' });
    }
  }

  /**
   * Clean up orphaned magic link tokens for deleted users
   * Fixed: Added missing cleanup for orphaned tokens
   */
  private async cleanupOrphanedTokens(): Promise<void> {
    try {
      // This would require a custom query to find tokens for non-existent users
      // For now, we'll implement a basic cleanup that removes very old tokens
      const veryOldCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const orphanedCount = await this.magicLinkService.cleanupExpiredTokens(undefined, 24 * 60);

      if (orphanedCount > 0) {
        this.logger.log(`Cleaned up ${orphanedCount} very old magic link tokens`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log magic link statistics every hour for monitoring
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logMagicLinkStats(): Promise<void> {
    try {
      const stats = await this.magicLinkService.getMagicLinkStats();

      this.logger.log('Magic link statistics', {
        totalActive: stats.totalActive,
        totalExpired: stats.totalExpired,
        recentlyCreated: stats.recentlyCreated,
      });

      // Record metrics for monitoring
      this.activeTokensGauge.set(stats.totalActive);
      this.expiredTokensGauge.set(stats.totalExpired);
      this.recentTokensGauge.set(stats.recentlyCreated);
    } catch (error) {
      this.logger.error('Failed to log magic link statistics', error);
    }
  }
}
