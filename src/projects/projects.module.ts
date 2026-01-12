import { Module, forwardRef } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { EnhancedProjectsService } from './enhanced-projects.service';
import { ProjectsResolver } from './projects.resolver';
import { ProjectFieldsResolver } from './project-fields.resolver';
import { ProjectsController } from './projects.controller';
import { GitHubWebhookController } from './github-webhook.controller';
import { ProjectsScheduler } from './projects.scheduler';
import { SyncQueueService } from './sync-queue.service';

import { PrismaModule } from '../prisma/prisma.module';
import { ParserModule } from '../parser/parser.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { ErrorHandlingModule } from '../common/error-handling.module';
import { PubSubProvider } from '../common/providers/pubsub.provider';

@Module({
  imports: [PrismaModule, ParserModule, ConfigModule, forwardRef(() => AuthModule), PlatformsModule, ErrorHandlingModule],
  controllers: [ProjectsController, GitHubWebhookController],
  providers: [
    ProjectsService,
    EnhancedProjectsService,
    ProjectsResolver,
    ProjectFieldsResolver,
    ProjectsScheduler,
    SyncQueueService,
    PubSubProvider,
  ],
  exports: [ProjectsService, EnhancedProjectsService, SyncQueueService],
})
export class ProjectsModule { }
