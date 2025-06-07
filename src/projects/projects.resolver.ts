import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { SyncProjectInput } from './dto/sync-project.input';
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ProjectFilterInput } from './dto/project-filter.input';

@UseGuards(ApiKeyGuard)
@Resolver(() => Project)
export class ProjectsResolver {
  constructor(private readonly projectsService: ProjectsService) {}

  @Mutation(() => Project, { name: 'syncProject' })
  async syncProject(
    @Args('input') input: SyncProjectInput,
    @Context() context: { userId?: string },
  ): Promise<{ enqueued: boolean }> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    await this.projectsService.queueSyncProject(
      context.userId,
      input.repoUrl,
      input.branch,
    );
    return { enqueued: true };
  }

  @Query(() => String)
  ping(): string {
    return 'pong';
  }

  @Query(() => [Project])
  async projects(@Context() context: { userId?: string }): Promise<Project[]> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.getAllProjectsForUser(context.userId);
  }

  @Query(() => [Project])
  async filteredProjects(
    @Args('filter', { nullable: true }) filter: ProjectFilterInput,
    @Context() context: { userId?: string },
  ): Promise<Project[]> {
    // Ensure the request is authenticated before filtering projects
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.getFilteredProjectsForUser(
      filter || {},
      context.userId,
    );
  }

  @Query(() => Project, { nullable: true })
  async project(
    @Args('repoUrl') repoUrl: string,
    @Context() context: { userId?: string },
  ): Promise<Project | null> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.getProjectByRepoUrl(repoUrl, context.userId);
  }

  @Mutation(() => String)
  async syncAllProjects(
    @Context() context: { userId?: string },
  ): Promise<string> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    await this.projectsService.syncAllReposForUser(context.userId);
    return 'queued';
  }
}
