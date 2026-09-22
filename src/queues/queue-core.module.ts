import { Global, Module } from '@nestjs/common';
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
      imports: [QueueCoreModule], // Self-reference might be tricky, better to just rely on the service
      inject: [QueueConfigService],
      useFactory: (queueConfigService: QueueConfigService) => {
        return {
          connection: queueConfigService.getRedisConnection(),
        };
      },
    }),
    BullModule.registerQueue({ name: 'email' }, { name: 'sync' }),
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
export class QueueCoreModule {}
