import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SandboxSession {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  startedAt!: Date;

  @Field()
  expiresAt!: Date;

  @Field(() => Int)
  projectCount!: number;

  @Field(() => Int)
  apiCallCount!: number;

  @Field(() => Int)
  syncOperationCount!: number;

  @Field()
  isActive!: boolean;

  @Field({ nullable: true })
  metadata?: string;
}

@ObjectType()
export class SandboxUsage {
  @Field(() => Int)
  projectsUsed!: number;

  @Field(() => Int)
  maxProjects!: number;

  @Field(() => Int)
  apiCallsUsed!: number;

  @Field(() => Int)
  maxApiCalls!: number;

  @Field(() => Int)
  syncOperationsUsed!: number;

  @Field(() => Int)
  maxSyncOperations!: number;

  @Field(() => Int)
  sessionTimeRemaining!: number;
}

@ObjectType()
export class SandboxRepository {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  fullName!: string;

  @Field()
  description!: string;

  @Field()
  htmlUrl!: string;

  @Field()
  cloneUrl!: string;

  @Field()
  defaultBranch!: string;

  @Field()
  language!: string;

  @Field(() => [String])
  topics!: string[];

  @Field(() => Int)
  starCount!: number;

  @Field(() => Int)
  forkCount!: number;

  @Field()
  isPrivate!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field()
  pushedAt!: Date;

  @Field()
  platform!: string;

  @Field({ nullable: true })
  portfolioContent?: string;

  @Field({ nullable: true })
  readmeContent?: string;
}
