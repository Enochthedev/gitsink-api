import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { SyncProjectInput } from './dto/sync-project.input';
import { Project } from './entities/project.entity';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';

@UseGuards(ApiKeyGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser): Promise<Project[]> {
    return this.projectsService.getAllProjectsForUser(req.user.id);
  }

  @Get(':repoUrl')
  async findOne(
    @Param('repoUrl') repoUrl: string,
    @Req() req: RequestWithUser,
  ): Promise<Project | null> {
    return this.projectsService.getProjectByRepoUrl(repoUrl, req.user.id);
  }

  @Post('sync')
  async sync(
    @Body() input: SyncProjectInput,
    @Req() req: RequestWithUser,
  ): Promise<Project> {
    // Branch is optional; default handled in service
    return this.projectsService.syncProjectFromGitHub(
      req.user.id,
      input.repoUrl,
      input.branch,
    );
  }

  @Post('sync-all')
  async syncAll(@Req() req: RequestWithUser): Promise<Project[]> {
    return this.projectsService.syncAllReposForUser(req.user.id);
  }
}
