import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { AIAnalysisResult } from '../../ai-enrichment/entities/ai-analysis.entity';
import { UnifiedRepositoryEntity } from '../../platforms/entities/platform-connection.entity';

@ObjectType()
export class Project {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  ownerId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => [String])
  tags!: string[];

  @Field(() => String, { nullable: true })
  icon!: string | null;

  @Field(() => String, { nullable: true })
  image!: string | null;

  @Field(() => String, { nullable: true })
  demoUrl!: string | null;

  @Field(() => String, { nullable: true })
  repoUrl!: string | null;

  @Field(() => Boolean, { nullable: true })
  featured!: boolean | null;

  @Field(() => Boolean, { nullable: true })
  published!: boolean | null;

  @Field(() => Float, { nullable: true })
  order!: number | null;

  @Field(() => String, { nullable: true })
  category!: string | null;

  @Field(() => Boolean, { nullable: true })
  githubSync!: boolean | null;

  @Field(() => Boolean, { nullable: true })
  blacklisted!: boolean | null;

  @Field(() => String, { nullable: true })
  markdown!: string | null;

  @Field(() => Boolean)
  valid!: boolean;

  @Field(() => [String])
  validationErrors!: string[];

  @Field(() => [String])
  collaborators!: string[];

  @Field(() => Date, { nullable: true })
  firstCommitAt!: Date | null;

  @Field(() => Date, { nullable: true })
  lastCommitAt!: Date | null;

  @Field(() => GraphQLJSON, { nullable: true, description: 'GitHub metadata' })
  githubMetadata!: any;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description: 'User-defined custom metadata parsed from Portfolio.md',
  })
  customMetadata!: any;

  @Field(() => Date, { nullable: true })
  syncedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  // Enhanced multi-platform fields
  @Field(() => String, { defaultValue: 'github', nullable: true })
  platform?: string | null;

  @Field(() => String, { nullable: true })
  platformId?: string | null;

  @Field(() => String, { nullable: true })
  defaultBranch?: string | null;

  @Field(() => String, { nullable: true })
  language?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  languages?: any;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  starCount?: number | null;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  forkCount?: number | null;

  @Field(() => Boolean, { defaultValue: false, nullable: true })
  isPrivate?: boolean | null;

  @Field(() => String, { nullable: true })
  license?: string | null;

  @Field(() => [String], { nullable: true })
  topics?: string[] | null;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  size?: number | null;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  openIssues?: number | null;

  @Field(() => Boolean, { defaultValue: false, nullable: true })
  hasWiki?: boolean | null;

  @Field(() => Boolean, { defaultValue: false, nullable: true })
  hasPages?: boolean | null;

  @Field(() => Boolean, { defaultValue: false, nullable: true })
  archived?: boolean | null;

  @Field(() => Boolean, { defaultValue: false, nullable: true })
  disabled?: boolean | null;

  @Field(() => Date, { nullable: true })
  pushedAt?: Date | null;

  // AI Analysis relationship
  @Field(() => AIAnalysisResult, { nullable: true })
  aiAnalysis?: AIAnalysisResult;

  // Repository information
  @Field(() => UnifiedRepositoryEntity, { nullable: true })
  repositoryInfo?: UnifiedRepositoryEntity;

  // Computed fields
  @Field(() => String, { nullable: true })
  activityLevel?: 'high' | 'medium' | 'low' | 'inactive';

  @Field(() => Float, { nullable: true })
  popularityScore?: number;

  // Helper method to get all GitHub keys (keeping backward compatibility)
  @Field(() => [String])
  allGitHubKeys?: string[];

  // Helper method to get GitHub metadata by key (keeping backward compatibility)
  // Note: This is not a GraphQL field, just a helper method
  github?(key: string): string | null {
    if (this.githubMetadata && typeof this.githubMetadata === 'object') {
      return this.githubMetadata[key] || null;
    }
    return null;
  }
}
