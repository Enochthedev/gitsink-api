import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserModule } from '../parser/parser.module';
import { ConfigModule } from '@nestjs/config';
import { ProjectFieldsResolver } from './project-fields.resolver';
@Module({
  imports: [PrismaModule, ParserModule, ConfigModule],
  providers: [ProjectsService, ProjectsResolver, ProjectFieldsResolver],
})
export class ProjectsModule {}
