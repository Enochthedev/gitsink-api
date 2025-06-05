import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { SyncProjectInput } from './dto/sync-project.input';

@Resolver(() => Project)
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
