import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailService } from '../mail/mail.service';
import { ProcessorService } from './email/processor/processor.service';
import { MailModule } from '../mail/mail.module';
import { ProjectsModule } from '../projects/projects.module';
import { AIEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { QueueCoreModule } from './queue-core.module';

// Worker services
import { EmailWorkerService } from './workers/email-worker.service';
import { SyncWorkerService } from './workers/sync-worker.service';
import { AIEnrichmentWorkerService } from './workers/ai-enrichment-worker.service';

import { WorkerRegistryService } from './services/worker-registry.service';

@Module({
  imports: [
    ConfigModule,
    QueueCoreModule,
    MailModule,
    forwardRef(() => ProjectsModule),
    forwardRef(() => AIEnrichmentModule),
  ],
  providers: [
    // Existing services
    MailService,
    ProcessorService,
    WorkerRegistryService,

    // Worker services
    EmailWorkerService,
    SyncWorkerService,
    AIEnrichmentWorkerService,
  ],
  exports: [
    EmailWorkerService,
    SyncWorkerService,
    AIEnrichmentWorkerService,
    WorkerRegistryService,
  ],
})
export class QueuesModule {}
