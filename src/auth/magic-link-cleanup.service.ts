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
   * Cleanup expired magic link tokens every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredTokens(): Promise<void> {
    this.logger.log('Starting scheduled cleanup of expired magic link tokens');

    try {
      const count = await this.magicLinkService.cleanupExpiredTokens();

      this.logger.log(
        `Scheduled cleanup completed: removed ${count} expired tokens`,
      );
      this.cleanupCounter.inc({ status: 'success' });
    } catch (error) {
      this.logger.error('Scheduled cleanup failed', error);
      this.cleanupCounter.inc({ status: 'failure' });
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
