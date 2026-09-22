import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { SyncProjectInput } from './dto/sync-project.input';
import { Project } from './entities/project.entity';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';
import { PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';

@UseGuards(ApiKeyGuard)
@ApiTags('Projects')
@ApiSecurity('x-api-key')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * Retrieve all projects for the authenticated user.
   */
  @Get()
  @ApiOperation({
    summary: 'Get all projects',
    description:
      'Retrieve a paginated list of all projects associated with the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Paginated list of projects retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API Key' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async findAll(
    @Req() req: RequestWithUser,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<Project>> {
    return this.projectsService.getPaginatedProjectsForUser(req.user.id, pagination);
  }

  @Get(':repoUrl')
  @ApiOperation({
    summary: 'Get project by URL',
    description: 'Retrieve detailed information about a specific project by its repository URL.',
  })
  @ApiOkResponse({ description: 'Project data retrieved successfully', type: Project })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
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
  @ApiOperation({
    summary: 'Sync a project',
    description:
      'Trigger a synchronization job for a specific repository. This is an asynchronous operation.',
  })
  @ApiBody({
    type: SyncProjectInput,
    description: 'Repository URL and optional branch to sync',
  })
  @ApiOkResponse({
    description: 'Sync job enqueued successfully',
    schema: { example: { enqueued: true } },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
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
  @ApiOperation({
    summary: 'Sync all projects',
    description: 'Trigger synchronization for all repositories linked to the user account.',
  })
  @ApiBody({
    description: 'No body required',
    required: false,
    schema: { type: 'object', nullable: true },
  })
  @ApiOkResponse({
    description: 'Sync all jobs enqueued successfully',
    schema: { example: { queued: true } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async syncAll(
    @Req() req: RequestWithUser,
    @Body() _body?: Record<string, unknown>, // Accept optional body to prevent parse errors
  ): Promise<{ queued: boolean }> {
    await this.projectsService.syncAllReposForUser(req.user.id);
    return { queued: true };
  }
}
