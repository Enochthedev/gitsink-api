import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
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

@Module({
  imports: [PrismaModule, ParserModule, ConfigModule, AuthModule],
  controllers: [ProjectsController, GitHubWebhookController],
  providers: [
    ProjectsService,
    ProjectsResolver,
    ProjectFieldsResolver,
    ProjectsScheduler,
    SyncQueueService,
  ],
})
export class ProjectsModule {}
