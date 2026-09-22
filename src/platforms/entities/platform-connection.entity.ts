import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PlatformConnection {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  userId!: string;

  @Field(() => String)
  platform!: 'github' | 'gitlab' | 'bitbucket';

  @Field(() => String)
  platformUserId!: string;

  @Field(() => String, { nullable: true })
  platformUsername?: string;

  @Field(() => [String])
  scopes!: string[];

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => Date, { nullable: true })
  lastSyncAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class RepositoryOwner {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  username!: string;

  @Field(() => String)
  type!: 'user' | 'organization';

  @Field(() => String, { nullable: true })
  avatar?: string;
}

@ObjectType()
export class RepositoryStatistics {
  @Field(() => Number)
  stars!: number;

  @Field(() => Number)
  forks!: number;

  @Field(() => Number)
  openIssues!: number;

  @Field(() => Number)
  size!: number;

  @Field(() => String, { nullable: true })
  language?: string;

  @Field(() => [String])
  topics!: string[];
}

@ObjectType()
export class RepositoryUrls {
  @Field(() => String)
  repository!: string;

  @Field(() => String, { nullable: true })
  issues?: string;

  @Field(() => String, { nullable: true })
  wiki?: string;

  @Field(() => String, { nullable: true })
  releases?: string;
}

@ObjectType()
export class UnifiedRepositoryEntity {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  fullName!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String)
  htmlUrl!: string;

  @Field(() => String)
  cloneUrl!: string;

  @Field(() => String, { nullable: true })
  sshUrl?: string;

  @Field(() => String)
  defaultBranch!: string;

  @Field(() => String)
  platform!: 'github' | 'gitlab' | 'bitbucket';

  @Field(() => String, { nullable: true })
  language?: string;

  @Field(() => String, { nullable: true })
  license?: string;

  @Field(() => Boolean)
  isPrivate!: boolean;

  @Field(() => Boolean)
  isFork!: boolean;

  @Field(() => Boolean)
  isArchived!: boolean;

  @Field(() => Boolean)
  isDisabled!: boolean;

  @Field(() => Boolean)
  hasWiki!: boolean;

  @Field(() => Boolean)
  hasPages!: boolean;

  @Field(() => Boolean)
  hasIssues!: boolean;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date)
  pushedAt!: Date;

  @Field(() => RepositoryOwner)
  owner!: RepositoryOwner;

  @Field(() => RepositoryStatistics)
  statistics!: RepositoryStatistics;

  @Field(() => RepositoryUrls)
  webUrls!: RepositoryUrls;

  @Field(() => String)
  activityLevel!: 'high' | 'medium' | 'low' | 'inactive';

  @Field(() => Number)
  popularityScore!: number;
}
