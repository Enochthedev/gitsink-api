import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiKeyService } from './api-key.service';
import { MetricsService } from '../metrics/metrics.service';
import { Counter } from 'prom-client';

@Injectable()
export class ApiKeyMetricsService {
    private readonly logger = new Logger(ApiKeyMetricsService.name);
    private readonly metricsUpdateCounter: Counter<string>;

    constructor(
        private readonly apiKeyService: ApiKeyService,
        private readonly metricsService: MetricsService,
    ) {
        this.metricsUpdateCounter = this.metricsService.createCustomCounter(
            'api_key_metrics_update_total',
            'Total number of API key metrics updates',
            ['status'],
        );
    }

    /**
     * Update API key metrics every 5 minutes
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async updateApiKeyMetrics(): Promise<void> {
        this.logger.debug('Starting scheduled API key metrics update');

        try {
            await this.apiKeyService.updateActiveKeysMetrics();

            this.logger.debug('Scheduled API key metrics update completed');
            this.metricsUpdateCounter.inc({ status: 'success' });

        } catch (error) {
            this.logger.error('Scheduled API key metrics update failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            this.metricsUpdateCounter.inc({ status: 'failure' });
        }
    }

    /**
     * Log API key statistics every hour for monitoring
     */
    @Cron(CronExpression.EVERY_HOUR)
    async logApiKeyStats(): Promise<void> {
        try {
            const stats = await this.apiKeyService.getApiKeyStats();

            this.logger.log('API key statistics', {
                totalKeys: stats.totalKeys,
                activeKeys: stats.activeKeys,
                revokedKeys: stats.revokedKeys,
                totalUsage: stats.totalUsage,
                recentUsage: stats.recentUsage,
                topUsersCount: stats.topUsers.length,
            });

        } catch (error) {
            this.logger.error('Failed to log API key statistics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}