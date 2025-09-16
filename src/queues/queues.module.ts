import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailService } from '@mail/mail.service';
import { EnqueueService } from './email/enqueue/enqueue.service';
import { ProcessorService } from './email/processor/processor.service';
import { MailModule } from 'src/mail/mail.module';
// New enhanced queue services
import { QueueConfigService } from './config/queue.config';
import { QueueManagerService } from './services/queue-manager.service';
import { QueueHealthService } from './services/queue-health.service';
import { QueueCleanupService } from './services/queue-cleanup.service';
import { WorkerRegistryService } from './services/worker-registry.service';
import { EnhancedCacheService } from './services/enhanced-cache.service';
import { CacheWarmingService } from './services/cache-warming.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';

// Worker services
import { EmailWorkerService } from './workers/email-worker.service';
import { SyncWorkerService } from './workers/sync-worker.service';
import { AIEnrichmentWorkerService } from './workers/ai-enrichment-worker.service';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), MailModule],
  providers: [
    // Existing services
    MailService,
    EnqueueService,
    ProcessorService,

    // New enhanced queue services
    QueueConfigService,
    QueueManagerService,
    QueueHealthService,
    QueueCleanupService,
    WorkerRegistryService,
    EnhancedCacheService,
    CacheWarmingService,
    CacheInvalidationService,

    // Worker services
    EmailWorkerService,
    SyncWorkerService,
    AIEnrichmentWorkerService,
  ],
  exports: [
    EnqueueService,
    QueueManagerService,
    QueueHealthService,
    QueueCleanupService,
    QueueConfigService,
    WorkerRegistryService,
    EmailWorkerService,
    SyncWorkerService,
    AIEnrichmentWorkerService,
    EnhancedCacheService,
    CacheWarmingService,
    CacheInvalidationService,
  ],
})
export class QueuesModule {}
