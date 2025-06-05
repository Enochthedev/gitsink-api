import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { SyncProjectInput } from './dto/sync-project.input';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { Project } from './entities/project.entity';

@Controller('projects')
@UseGuards(ApiKeyGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(): Promise<Project[]> {
    return this.projectsService.getAllProjectsForUser('mock-user-id');
  }

  @Get(':repoUrl')
  async findOne(@Param('repoUrl') repoUrl: string): Promise<Project | null> {
    return this.projectsService.getProjectByRepoUrl(repoUrl, 'mock-user-id');
  }

  @Post('sync')
  async sync(@Body() input: SyncProjectInput): Promise<Project> {
    return this.projectsService.syncProjectFromGitHub(input.repoUrl, input.branch);
  }

  @Post('sync-all')
  async syncAll(): Promise<Project[]> {
    return this.projectsService.syncAllReposForUser();
  }
}
