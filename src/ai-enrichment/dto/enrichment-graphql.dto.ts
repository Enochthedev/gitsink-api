import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';

@InputType()
export class TriggerEnrichmentInput {
  @Field(() => String)
  @IsString()
  projectId!: string;

  @Field(() => Boolean, { defaultValue: false })
  @IsBoolean()
  forceReanalysis: boolean = false;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  analysisTypes?: string[];
}

@InputType()
export class BulkEnrichmentInput {
  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  projectIds!: string[];

  @Field(() => Boolean, { defaultValue: false })
  @IsBoolean()
  forceReanalysis: boolean = false;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  analysisTypes?: string[];
}

@ObjectType()
export class EnrichmentJob {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  projectId!: string;

  @Field(() => String)
  status!: 'pending' | 'processing' | 'completed' | 'failed';

  @Field(() => String, { nullable: true })
  error?: string;

  @Field(() => Int, { nullable: true })
  progress?: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  completedAt?: Date;
}

@ObjectType()
export class BulkEnrichmentResult {
  @Field(() => [EnrichmentJob])
  jobs!: EnrichmentJob[];

  @Field(() => Int)
  totalJobs!: number;

  @Field(() => Int)
  successfulJobs!: number;

  @Field(() => Int)
  failedJobs!: number;
}
