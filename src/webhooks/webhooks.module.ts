import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { ProjectsModule } from '../projects/projects.module';
import { QueueType } from '../queues/config/queue.config';

// Controllers
import { WebhookController } from './controllers/webhook.controller';

// Services
import { WebhookHandlerService } from './services/webhook-handler.service';
import { WebhookStorageService } from './services/webhook-storage.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookQueueService } from './services/webhook-queue.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { WebhookSyncService } from './services/webhook-sync.service';
import { WebhookFailureHandlerService } from './services/webhook-failure-handler.service';

// Workers
import { WebhookWorkerService } from './workers/webhook-worker.service';
import { WebhookSyncWorkerService } from './workers/webhook-sync-worker.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PlatformsModule,
    ProjectsModule,
    BullModule.registerQueue({
      name: QueueType.WEBHOOK,
    }),
  ],
  controllers: [WebhookController],
  providers: [
    // Services
    WebhookHandlerService,
    WebhookStorageService,
    WebhookSignatureService,
    WebhookQueueService,
    WebhookProcessorService,
    WebhookSyncService,
    WebhookFailureHandlerService,

    // Workers
    WebhookWorkerService,
    WebhookSyncWorkerService,
  ],
  exports: [
    WebhookHandlerService,
    WebhookStorageService,
    WebhookSignatureService,
    WebhookQueueService,
    WebhookProcessorService,
    WebhookSyncService,
    WebhookFailureHandlerService,
  ],
})
export class WebhooksModule {}
