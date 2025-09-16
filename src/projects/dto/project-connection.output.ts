import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { Project } from '../entities/project.entity';
import { PageInfo } from '../../common/dto/graphql-common.dto';

@ObjectType()
export class ProjectEdge {
  @Field(() => Project)
  node!: Project;

  @Field(() => String)
  cursor!: string;
}

@ObjectType()
export class ProjectConnection {
  @Field(() => [ProjectEdge])
  edges!: ProjectEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field(() => Int)
  totalCount!: number;
}

@ObjectType()
export class ProjectAggregation {
  @Field(() => Int)
  totalProjects!: number;

  @Field(() => Int)
  publicProjects!: number;

  @Field(() => Int)
  privateProjects!: number;

  @Field(() => Int)
  featuredProjects!: number;

  @Field(() => Int)
  totalStars!: number;

  @Field(() => Int)
  totalForks!: number;

  @Field(() => [LanguageStats])
  languageStats!: LanguageStats[];

  @Field(() => [CategoryStats])
  categoryStats!: CategoryStats[];

  @Field(() => [PlatformStats])
  platformStats!: PlatformStats[];
}

@ObjectType()
export class LanguageStats {
  @Field(() => String)
  language!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => Int)
  totalBytes!: number;

  @Field(() => Float)
  percentage!: number;
}

@ObjectType()
export class CategoryStats {
  @Field(() => String)
  category!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => Float)
  percentage!: number;
}

@ObjectType()
export class PlatformStats {
  @Field(() => String)
  platform!: string;

  @Field(() => Int)
  count!: number;

  @Field(() => Float)
  percentage!: number;
}
