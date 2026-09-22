import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class LanguageInfo {
  @Field(() => String)
  name!: string;

  @Field(() => Float)
  percentage!: number;

  @Field(() => Int)
  bytes!: number;

  @Field(() => Float)
  confidence!: number;
}

@ObjectType()
export class FrameworkInfo {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  version?: string;

  @Field(() => Float)
  confidence!: number;

  @Field(() => String)
  category!: 'web' | 'mobile' | 'desktop' | 'backend' | 'ml' | 'game' | 'other';
}

@ObjectType()
export class TechnologyStack {
  @Field(() => [LanguageInfo])
  languages!: LanguageInfo[];

  @Field(() => [FrameworkInfo])
  frameworks!: FrameworkInfo[];

  @Field(() => [String])
  databases!: string[];

  @Field(() => [String])
  tools!: string[];

  @Field(() => [String])
  platforms!: string[];

  @Field(() => [String])
  buildTools!: string[];

  @Field(() => [String])
  testingFrameworks!: string[];
}

@ObjectType()
export class ProjectCategory {
  @Field(() => String)
  primary!: string;

  @Field(() => [String], { nullable: true })
  secondary?: string[];

  @Field(() => Float)
  confidence!: number;

  @Field(() => [String])
  tags!: string[];
}

@ObjectType()
export class AIAnalysisResult {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  projectId!: string;

  @Field(() => String)
  description!: string;

  @Field(() => TechnologyStack)
  technologies!: TechnologyStack;

  @Field(() => ProjectCategory)
  category!: ProjectCategory;

  @Field(() => String)
  complexity!: 'simple' | 'moderate' | 'complex' | 'enterprise';

  @Field(() => [String])
  suggestedTags!: string[];

  @Field(() => [String])
  keyFeatures!: string[];

  @Field(() => Float)
  confidence!: number;

  @Field(() => String)
  model!: string;

  @Field(() => Int)
  version!: number;

  @Field(() => Date)
  analysisDate!: Date;

  @Field(() => Date)
  createdAt!: Date;
}
