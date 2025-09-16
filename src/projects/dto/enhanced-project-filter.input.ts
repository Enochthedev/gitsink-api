import { InputType, Field, Int, Float, registerEnumType } from '@nestjs/graphql';
import { IsOptional, IsArray, IsString, IsBoolean, IsNumber, IsEnum } from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum ProjectSortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  TITLE = 'title',
  STARS = 'starCount',
  FORKS = 'forkCount',
  LAST_COMMIT = 'lastCommitAt',
  POPULARITY = 'popularityScore',
}

// Register enums with GraphQL
registerEnumType(SortOrder, {
  name: 'SortOrder',
});

registerEnumType(ProjectSortField, {
  name: 'ProjectSortField',
});

@InputType()
export class DateRangeInput {
  @Field(() => Date, { nullable: true })
  @IsOptional()
  from?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  to?: Date;
}

@InputType()
export class NumberRangeInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  min?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  max?: number;
}

@InputType()
export class ProjectSortInput {
  @Field(() => ProjectSortField)
  @IsEnum(ProjectSortField)
  field!: ProjectSortField;

  @Field(() => SortOrder, { defaultValue: SortOrder.DESC })
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;
}

@InputType()
export class PaginationInput {
  @Field(() => Int, { defaultValue: 0 })
  @IsNumber()
  offset: number = 0;

  @Field(() => Int, { defaultValue: 20 })
  @IsNumber()
  limit: number = 20;
}

@InputType()
export class EnhancedProjectFilterInput {
  // Basic filters
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  // Platform filters
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  // Date filters
  @Field(() => DateRangeInput, { nullable: true })
  @IsOptional()
  createdAt?: DateRangeInput;

  @Field(() => DateRangeInput, { nullable: true })
  @IsOptional()
  updatedAt?: DateRangeInput;

  @Field(() => DateRangeInput, { nullable: true })
  @IsOptional()
  lastCommitAt?: DateRangeInput;

  // Numeric filters
  @Field(() => NumberRangeInput, { nullable: true })
  @IsOptional()
  starCount?: NumberRangeInput;

  @Field(() => NumberRangeInput, { nullable: true })
  @IsOptional()
  forkCount?: NumberRangeInput;

  @Field(() => NumberRangeInput, { nullable: true })
  @IsOptional()
  size?: NumberRangeInput;

  // AI Analysis filters
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complexityLevels?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  minConfidence?: number;

  // Repository features
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  hasWiki?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  hasPages?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  hasIssues?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  // Activity filters
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activityLevels?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  minPopularityScore?: number;

  // User-specific filters
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  includeCollaborations?: boolean;
}
