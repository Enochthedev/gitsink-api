import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from '@prisma/client';
import { RequestWithUser } from '../auth/request-with-user';

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('projects')
  getProjects(@Req() req: RequestWithUser): Promise<Project[]> {
    return this.projectsService.getAllProjectsForUser(req.user.id);
  }

  @Get('projects/:id')
  getProject(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<Project | null> {
    return this.projectsService.getProjectById(id, req.user.id);
  }

  @Post('sync')
  sync(@Req() req: RequestWithUser): Promise<Project[]> {
    // user id can be derived from req.user once GitHub auth is wired up
    return this.projectsService.syncAllReposForUser(req.user.id);
  }
}
