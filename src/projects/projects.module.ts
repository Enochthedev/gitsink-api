import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserModule } from '../parser/parser.module';
import { ConfigModule } from '@nestjs/config';
import { ProjectFieldsResolver } from './project-fields.resolver';
import { ProjectsController } from './projects.controller';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';

@Module({
  imports: [PrismaModule, ParserModule, ConfigModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsResolver, ProjectFieldsResolver],
})
export class ProjectsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes(ProjectsController, {
      path: 'sync',
      method: RequestMethod.POST,
    });
  }
}
