import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QueueConfigService } from './config/queue.config';
import { QueueManagerService } from './services/queue-manager.service';
import { QueueHealthService } from './services/queue-health.service';
import { QueueCleanupService } from './services/queue-cleanup.service';
import { EnhancedCacheService } from './services/enhanced-cache.service';
import { CacheWarmingService } from './services/cache-warming.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';
import { EnqueueService } from './email/enqueue/enqueue.service';

@Global()
@Module({
    imports: [
        ConfigModule,
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const redisUrl = process.env.REDIS_URL;
                let connection: any;

                if (redisUrl) {
                    try {
                        const url = new URL(redisUrl);
                        connection = {
                            host: url.hostname,
                            port: parseInt(url.port, 10) || 6379,
                            password: url.password || undefined,
                            username: url.username || undefined,
                            maxRetriesPerRequest: null, // Critical: BullMQ requires this to be null
                            lazyConnect: true,
                            retryDelayOnFailover: 100,
                            enableReadyCheck: false,
                        };
                    } catch (error) {
                        console.warn('Failed to parse REDIS_URL in BullModule, falling back to individual config');
                    }
                }

                if (!connection) {
                    connection = {
                        host: process.env.REDIS_HOST || 'localhost',
                        port: parseInt(process.env.REDIS_PORT || '6379'),
                        password: process.env.REDIS_PASSWORD,
                        db: parseInt(process.env.REDIS_DB || '0'),
                        maxRetriesPerRequest: null, // Critical: BullMQ requires this to be null
                        lazyConnect: true,
                        retryDelayOnFailover: 100,
                        enableReadyCheck: false,
                    };
                }

                return { connection };
            },
        }),
        BullModule.registerQueue(
            { name: 'email' },
            { name: 'sync' },
        ),
    ],
    providers: [
        QueueConfigService,
        QueueManagerService,
        QueueHealthService,
        QueueCleanupService,
        EnhancedCacheService,
        CacheWarmingService,
        CacheInvalidationService,
        EnqueueService,
    ],
    exports: [
        QueueConfigService,
        QueueManagerService,
        QueueHealthService,
        QueueCleanupService,
        EnhancedCacheService,
        CacheWarmingService,
        CacheInvalidationService,
        EnqueueService,
        BullModule,
    ],
})
export class QueueCoreModule { }
