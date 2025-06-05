
import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { SyncProjectInput } from './dto/sync-project.input';
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ProjectFilterInput } from './dto/project-filter.input';

import { ApiKeyAuthGuard } from '../auth/api-key-auth.guard';

@UseGuards(ApiKeyAuthGuard)
@Resolver(() => Project)
@UseGuards(ApiKeyGuard)
export class ProjectsResolver {
  constructor(private readonly projectsService: ProjectsService) {}

  @Mutation(() => Project, { name: 'syncProject' })
  async syncProject(
    @Args('input') input: SyncProjectInput,
    @Context() context: { userId?: string },
  ): Promise<Project> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.syncProjectFromGitHub(
      context.userId,
      input.repoUrl,
      input.branch,
      false,
    );
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

  @Mutation(() => [Project])
  async syncAllProjects(
    @Context() context: { userId?: string },
  ): Promise<Project[]> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.syncAllReposForUser(context.userId);
  }
}
