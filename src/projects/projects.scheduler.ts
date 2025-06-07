import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class ProjectsScheduler {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ProjectsScheduler.name);
  }


  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron(): Promise<void> {
    this.logger.log('Running daily repository sync');
    const users = await this.prisma.user.findMany();
    for (const user of users) {
      try {
        await this.projectsService.syncAllReposForUser(user.id);
      } catch (err) {
        this.logger.warn(`Failed to sync repos for user ${user.id}`);
        this.logger.debug(err);
      }
    }
  }
}
