import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class StartSandboxSessionInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Optional session name' })
  sessionName?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @ApiProperty({
    required: false,
    description: 'Maximum number of projects (1-50)',
    minimum: 1,
    maximum: 50,
  })
  maxProjects?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  @ApiProperty({
    required: false,
    description: 'Maximum API calls (100-10000)',
    minimum: 100,
    maximum: 10000,
  })
  maxApiCalls?: number;
}

@ObjectType()
export class SandboxSessionDto {
  @Field()
  @ApiProperty({ description: 'Session ID' })
  id!: string;

  @Field()
  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @Field()
  @ApiProperty({ description: 'Session start time' })
  startedAt!: Date;

  @Field()
  @ApiProperty({ description: 'Session expiration time' })
  expiresAt!: Date;

  @Field(() => Int)
  @ApiProperty({ description: 'Current project count' })
  projectCount!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Current API call count' })
  apiCallCount!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Current sync operation count' })
  syncOperationCount!: number;

  @Field()
  @ApiProperty({ description: 'Whether session is active' })
  isActive!: boolean;

  @Field({ nullable: true })
  @ApiProperty({ required: false, description: 'Session metadata' })
  metadata?: string;
}

@ObjectType()
export class SandboxUsageDto {
  @Field(() => Int)
  @ApiProperty({ description: 'Projects used in current session' })
  projectsUsed!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Maximum projects allowed' })
  maxProjects!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'API calls used in current session' })
  apiCallsUsed!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Maximum API calls allowed' })
  maxApiCalls!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Sync operations used in current session' })
  syncOperationsUsed!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Maximum sync operations allowed' })
  maxSyncOperations!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Session time remaining in milliseconds' })
  sessionTimeRemaining!: number;
}

@ObjectType()
export class SandboxRepositoryDto {
  @Field()
  @ApiProperty({ description: 'Repository ID' })
  id!: string;

  @Field()
  @ApiProperty({ description: 'Repository name' })
  name!: string;

  @Field()
  @ApiProperty({ description: 'Full repository name (owner/repo)' })
  fullName!: string;

  @Field()
  @ApiProperty({ description: 'Repository description' })
  description!: string;

  @Field()
  @ApiProperty({ description: 'Repository HTML URL' })
  htmlUrl!: string;

  @Field()
  @ApiProperty({ description: 'Repository clone URL' })
  cloneUrl!: string;

  @Field()
  @ApiProperty({ description: 'Default branch name' })
  defaultBranch!: string;

  @Field()
  @ApiProperty({ description: 'Primary programming language' })
  language!: string;

  @Field(() => [String])
  @ApiProperty({ description: 'Repository topics/tags' })
  topics!: string[];

  @Field(() => Int)
  @ApiProperty({ description: 'Star count' })
  starCount!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Fork count' })
  forkCount!: number;

  @Field()
  @ApiProperty({ description: 'Whether repository is private' })
  isPrivate!: boolean;

  @Field()
  @ApiProperty({ description: 'Repository creation date' })
  createdAt!: Date;

  @Field()
  @ApiProperty({ description: 'Repository last update date' })
  updatedAt!: Date;

  @Field()
  @ApiProperty({ description: 'Repository last push date' })
  pushedAt!: Date;

  @Field()
  @ApiProperty({ description: 'Platform (github, gitlab, bitbucket)' })
  platform!: string;

  @Field({ nullable: true })
  @ApiProperty({ required: false, description: 'Portfolio.md content' })
  portfolioContent?: string;

  @Field({ nullable: true })
  @ApiProperty({ required: false, description: 'README content' })
  readmeContent?: string;
}

@InputType()
export class MigrateSandboxDataInput {
  @Field()
  @IsBoolean()
  @ApiProperty({ description: 'Include projects in migration' })
  includeProjects!: boolean;

  @Field()
  @IsBoolean()
  @ApiProperty({ description: 'Include profile data in migration' })
  includeProfile!: boolean;

  @Field()
  @IsBoolean()
  @ApiProperty({ description: 'Include user settings in migration' })
  includeSettings!: boolean;

  @Field()
  @IsBoolean()
  @ApiProperty({ description: 'Overwrite existing data' })
  overwriteExisting!: boolean;
}

@ObjectType()
export class SandboxMigrationResultDto {
  @Field()
  @ApiProperty({ description: 'Whether migration was successful' })
  success!: boolean;

  @Field(() => Int)
  @ApiProperty({ description: 'Number of projects migrated' })
  projectsMigrated!: number;

  @Field()
  @ApiProperty({ description: 'Whether profile was migrated' })
  profileMigrated!: boolean;

  @Field()
  @ApiProperty({ description: 'Whether settings were migrated' })
  settingsMigrated!: boolean;

  @Field(() => [String])
  @ApiProperty({ description: 'Any errors encountered during migration' })
  errors!: string[];
}

@InputType()
export class ResetSandboxInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Confirmation token' })
  confirmationToken?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    required: false,
    description: 'Keep session active after reset',
  })
  keepSession?: boolean;
}
