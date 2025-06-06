import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { ProjectFieldsResolver } from './project-fields.resolver';
import { ProjectsController } from './projects.controller';
import { GitHubWebhookController } from './github-webhook.controller';
import { ProjectsScheduler } from './projects.scheduler';

import { PrismaModule } from '../prisma/prisma.module';
import { ParserModule } from '../parser/parser.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ParserModule, ConfigModule],
  controllers: [ProjectsController, GitHubWebhookController],
  providers: [
    ProjectsService,
    ProjectsResolver,
    ProjectFieldsResolver,
    ProjectsScheduler,
  ],
})
export class ProjectsModule {}
