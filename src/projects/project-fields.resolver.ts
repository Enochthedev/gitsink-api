import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Project } from './entities/project.entity';

@Resolver(() => Project)
export class ProjectFieldsResolver {
  @ResolveField(() => String, { nullable: true })
  github(@Parent() project: Project, @Args('key') key: string): string | null {
    const metadata = project.githubMetadata as Record<string, unknown> | null | undefined;
    const value = metadata ? metadata[key] : undefined;

    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  @ResolveField(() => [String])
  allGitHubKeys(@Parent() project: Project): string[] {
    return typeof project.githubMetadata === 'object' && project.githubMetadata !== null
      ? Object.keys(project.githubMetadata as Record<string, unknown>)
      : [];
  }
}
