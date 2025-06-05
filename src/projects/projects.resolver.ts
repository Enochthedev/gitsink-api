import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { SyncProjectInput } from './dto/sync-project.input';

@Resolver(() => Project)
export class ProjectsResolver {
  constructor(private readonly projectsService: ProjectsService) {}

  @Mutation(() => Project, { name: 'syncProject' })
  async syncProject(@Args('input') input: SyncProjectInput): Promise<Project> {
    return this.projectsService.syncProjectFromGitHub(
      input.repoUrl,
      input.branch,
      'mock-user-id',
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

  @Query(() => Project, { nullable: true })
  async project(@Args('repoUrl') repoUrl: string): Promise<Project | null> {
    return this.projectsService.getProjectByRepoUrl(repoUrl, 'mock-user-id');
  }

  @Mutation(() => [Project])
  async syncAllProjects(): Promise<Project[]> {
    return this.projectsService.syncAllReposForUser('mock-user-id');
  }
}
