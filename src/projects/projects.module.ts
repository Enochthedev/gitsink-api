import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { ProjectFieldsResolver } from './project-fields.resolver';
import { ProjectsController } from './projects.controller';
import { GitHubWebhookController } from './github-webhook.controller';
import { ProjectsScheduler } from './projects.scheduler';
import { ApiKeyAuthGuard } from '../auth/api-key-auth.guard';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';

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
    ApiKeyAuthGuard,
  ],
})
export class ProjectsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes(
      { path: 'projects/sync', method: RequestMethod.POST },
      { path: 'projects/sync-all', method: RequestMethod.POST },
    );
  }
}