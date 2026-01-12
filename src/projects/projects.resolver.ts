import { Resolver, Mutation, Args, Query, Context, Subscription } from '@nestjs/graphql';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { SyncProjectInput } from './dto/sync-project.input';
import { UseGuards, Inject } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ProjectFilterInput } from './dto/project-filter.input';
import {
  EnhancedProjectFilterInput,
  ProjectSortInput,
  PaginationInput,
} from './dto/enhanced-project-filter.input';
import { ProjectConnection, ProjectAggregation } from './dto/project-connection.output';
import { PubSub } from 'graphql-subscriptions';
import { SyncStatusUpdate } from '../common/dto/subscription.dto';

@UseGuards(ApiKeyGuard)
@Resolver(() => Project)
export class ProjectsResolver {
  constructor(
    private readonly projectsService: ProjectsService,
    @Inject('PUB_SUB') private pubSub: PubSub,
  ) { }

  @Mutation(() => Project, { name: 'syncProject' })
  async syncProject(
    @Args('input') input: SyncProjectInput,
    @Context() context: { userId?: string },
  ): Promise<{ enqueued: boolean }> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    await this.projectsService.queueSyncProject(context.userId, input.repoUrl, input.branch);
    return { enqueued: true };
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
    return this.projectsService.getFilteredProjectsForUser(filter || {}, context.userId);
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
  async syncAllProjects(@Context() context: { userId?: string }): Promise<string> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    await this.projectsService.syncAllReposForUser(context.userId);
    return 'queued';
  }

  // Enhanced Queries
  @Query(() => ProjectConnection)
  async enhancedProjects(
    @Context() context: { userId?: string },
    @Args('filter', { nullable: true }) filter?: EnhancedProjectFilterInput,
    @Args('sort', { nullable: true }) sort?: ProjectSortInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<ProjectConnection> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.getEnhancedProjects(
      context.userId,
      filter || {},
      sort,
      pagination || { offset: 0, limit: 20 },
    );
  }

  @Query(() => [Project])
  async searchProjects(
    @Args('query') query: string,
    @Context() context: { userId?: string },
    @Args('filter', { nullable: true }) filter?: EnhancedProjectFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<Project[]> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.searchProjects(
      context.userId,
      query,
      filter || {},
      pagination || { offset: 0, limit: 20 },
    );
  }

  @Query(() => ProjectAggregation)
  async projectStatistics(
    @Context() context: { userId?: string },
    @Args('filter', { nullable: true }) filter?: EnhancedProjectFilterInput,
  ): Promise<ProjectAggregation> {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return this.projectsService.getProjectStatistics(context.userId, filter || {});
  }

  @Query(() => [Project])
  async trendingProjects(
    @Args('timeframe', { defaultValue: '7d' }) timeframe: string,
    @Args('limit', { defaultValue: 10 }) limit: number,
  ): Promise<Project[]> {
    return this.projectsService.getTrendingProjects(timeframe, limit);
  }

  @Query(() => [Project])
  async featuredProjects(@Args('limit', { defaultValue: 10 }) limit: number): Promise<Project[]> {
    return this.projectsService.getFeaturedProjects(limit);
  }

  // Subscriptions
  @Subscription(() => SyncStatusUpdate, {
    filter: (payload, variables, context) => {
      return payload.syncStatusUpdate.userId === context.userId;
    },
  })
  syncStatusUpdates(@Context() context: { userId?: string }) {
    if (!context.userId) {
      throw new Error('Unauthorized');
    }
    return (this.pubSub as any).asyncIterator('syncStatusUpdate');
  }
}
