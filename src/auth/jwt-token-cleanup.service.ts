import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtTokenService } from './jwt-token.service';
import { MetricsService } from '../metrics/metrics.service';
import { Counter } from 'prom-client';

@Injectable()
export class JwtTokenCleanupService {
    private readonly logger = new Logger(JwtTokenCleanupService.name);
    private readonly cleanupCounter: Counter<string>;

    constructor(
        private readonly jwtTokenService: JwtTokenService,
        private readonly metricsService: MetricsService,
    ) {
        this.cleanupCounter = this.metricsService.createCustomCounter(
            'jwt_token_cleanup_total',
            'Total number of JWT token cleanup operations',
            ['status'],
        );
    }

    /**
     * Clean up expired tokens every hour
     */
    @Cron(CronExpression.EVERY_HOUR)
    async cleanupExpiredTokens(): Promise<void> {
        this.logger.log('Starting scheduled JWT token cleanup');

        try {
            const result = await this.jwtTokenService.cleanupExpiredTokens();

            this.logger.log('Scheduled JWT token cleanup completed', {
                refreshTokens: result.refreshTokens,
                blacklistEntries: result.blacklistEntries,
            });

            this.cleanupCounter.inc({ status: 'success' });

        } catch (error) {
            this.logger.error('Scheduled JWT token cleanup failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            this.cleanupCounter.inc({ status: 'failure' });
        }
    }

    /**
     * Update token metrics every 10 minutes
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async updateTokenMetrics(): Promise<void> {
        try {
            await this.jwtTokenService.updateTokenMetrics();

            this.logger.debug('JWT token metrics updated');

        } catch (error) {
            this.logger.error('Failed to update JWT token metrics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Log token statistics every hour for monitoring
     */
    @Cron(CronExpression.EVERY_HOUR)
    async logTokenStats(): Promise<void> {
        try {
            const stats = await this.jwtTokenService.getTokenStats();

            this.logger.log('JWT token statistics', {
                totalTokensIssued: stats.totalTokensIssued,
                activeRefreshTokens: stats.activeRefreshTokens,
                blacklistedTokens: stats.blacklistedTokens,
                expiredTokens: stats.expiredTokens,
                recentTokens: stats.recentTokens,
            });

        } catch (error) {
            this.logger.error('Failed to log JWT token statistics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}