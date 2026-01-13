import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
        BullModule.registerQueue({
            name: 'email',
        }),
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
    ],
})
export class QueueCoreModule { }
