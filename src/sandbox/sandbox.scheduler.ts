import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SandboxService } from './sandbox.service';

@Injectable()
export class SandboxScheduler {
  private readonly logger = new Logger(SandboxScheduler.name);

  constructor(private readonly sandboxService: SandboxService) {}

  /**
   * Clean up expired sandbox sessions every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions() {
    try {
      this.logger.log('Starting cleanup of expired sandbox sessions');

      const cleanedCount = await this.sandboxService.cleanupExpiredSessions();

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired sandbox sessions`);
      } else {
        this.logger.debug('No expired sandbox sessions found');
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired sandbox sessions', error);
    }
  }

  /**
   * Log sandbox usage statistics every 6 hours
   */
  @Cron('0 */6 * * *') // Every 6 hours
  async logSandboxStatistics() {
    try {
      this.logger.log('Logging sandbox usage statistics');

      // This could be expanded to gather and log more detailed statistics
      const config = this.sandboxService.getSandboxConfig();

      this.logger.log('Current sandbox configuration', {
        enabled: config.enabled,
        maxProjects: config.maxProjects,
        maxApiCalls: config.maxApiCalls,
        maxSyncOperations: config.maxSyncOperations,
        sessionDuration: config.sessionDuration / (60 * 60 * 1000) + ' hours',
        dataRetention: config.dataRetention / (24 * 60 * 60 * 1000) + ' days',
      });
    } catch (error) {
      this.logger.error('Failed to log sandbox statistics', error);
    }
  }
}
