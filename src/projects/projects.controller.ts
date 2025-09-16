import { Controller, Get, Param, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { SyncProjectInput } from './dto/sync-project.input';
import { Project } from './entities/project.entity';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';

@UseGuards(ApiKeyGuard)
@ApiTags('projects')
@ApiSecurity('x-api-key')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Retrieve all projects for the authenticated user.
   */
  @Get()
  @ApiOkResponse({
    description: 'List of projects',
    type: Project,
    isArray: true,
  })
  async findAll(@Req() req: RequestWithUser): Promise<Project[]> {
    return this.projectsService.getAllProjectsForUser(req.user.id);
  }

  @Get(':repoUrl')
  @ApiOkResponse({ description: 'Project data', type: Project })
  async findOne(
    @Param('repoUrl') repoUrl: string,
    @Req() req: RequestWithUser,
  ): Promise<Project | null> {
    return this.projectsService.getProjectByRepoUrl(repoUrl, req.user.id);
  }

  @Post('sync')
  /**
   * Synchronize a single repository. The branch is optional and defaults to
   * `main` if not provided.
   */
  @ApiBody({
    type: SyncProjectInput,
    description: 'Repository URL and optional branch to sync',
  })
  @ApiOkResponse({ schema: { example: { enqueued: true } } })
  async sync(
    @Body() input: SyncProjectInput,
    @Req() req: RequestWithUser,
  ): Promise<{ enqueued: boolean }> {
    await this.projectsService.queueSyncProject(req.user.id, input.repoUrl, input.branch);
    return { enqueued: true };
  }

  @Post('sync-all')
  /**
   * Synchronize every GitHub repository linked to the authenticated user.
   */
  @ApiBody({ description: 'No body required', required: false })
  @ApiOkResponse({ schema: { example: { queued: true } } })
  async syncAll(@Req() req: RequestWithUser): Promise<{ queued: boolean }> {
    await this.projectsService.syncAllReposForUser(req.user.id);
    return { queued: true };
  }
}
