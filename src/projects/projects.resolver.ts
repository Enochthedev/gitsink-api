import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
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
  async syncProject(@Args('input') input: SyncProjectInput): Promise<Project> {
    return this.projectsService.syncProjectFromGitHub(
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
  async projects(): Promise<Project[]> {
    return this.projectsService.getAllProjectsForUser('mock-user-id');
  }

  @Query(() => [Project])
  async filteredProjects(
    @Args('filter', { nullable: true }) filter: ProjectFilterInput,
  ): Promise<Project[]> {
    return this.projectsService.getFilteredProjectsForUser(
      filter || {},
      'mock-user-id',
    );
  }

  @Query(() => Project, { nullable: true })
  async project(@Args('repoUrl') repoUrl: string): Promise<Project | null> {
    return this.projectsService.getProjectByRepoUrl(repoUrl, 'mock-user-id');
  }

  @Mutation(() => [Project])

  async syncAllProjects(@Args('userId') userId: string): Promise<Project[]> {
    return this.projectsService.syncAllReposForUser(userId);

  }
}
