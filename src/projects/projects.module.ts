import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserModule } from '../parser/parser.module';
import { ConfigModule } from '@nestjs/config';
import { ProjectFieldsResolver } from './project-fields.resolver';
import { ProjectsScheduler } from './projects.scheduler';
import { GitHubWebhookController } from './github-webhook.controller';
@Module({
  imports: [PrismaModule, ParserModule, ConfigModule],
  providers: [
    ProjectsService,
    ProjectsResolver,
    ProjectFieldsResolver,
    ProjectsScheduler,
  ],
  controllers: [GitHubWebhookController],
import { ProjectsController } from './projects.controller';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { ApiKeyAuthGuard } from '../auth/api-key-auth.guard';
@Module({
  imports: [PrismaModule, ParserModule, ConfigModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsResolver, ProjectFieldsResolver, ApiKeyAuthGuard],
})
export class ProjectsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes(ProjectsController, {
      path: 'sync',
      method: RequestMethod.POST,
    });
  }
}
