import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Field, InputType, ArgsType, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum SyncOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  SYNC = 'sync',
}

export enum SyncStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Register enums with GraphQL
registerEnumType(SyncOperationType, {
  name: 'SyncOperationType',
  description: 'The type of sync operation',
});

registerEnumType(SyncStatus, {
  name: 'SyncStatus',
  description: 'The status of a sync operation',
});

@InputType()
export class StartSyncOperationInput {
  @Field()
  @IsString()
  userId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  projectId?: string;

  @Field(() => SyncOperationType)
  @IsEnum(SyncOperationType)
  operation!: SyncOperationType;

  @Field()
  @IsString()
  platform!: string;

  @Field()
  @IsString()
  repositoryUrl!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string; // JSON string
}

@InputType()
export class CompleteSyncOperationInput {
  @Field()
  @IsString()
  operationId!: string;

  @Field()
  @IsString()
  syncId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  changes?: string; // JSON string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string; // JSON string
}

@InputType()
export class FailSyncOperationInput {
  @Field()
  @IsString()
  operationId!: string;

  @Field()
  @IsString()
  syncId!: string;

  @Field()
  @IsString()
  error!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string; // JSON string
}

@ArgsType()
export class SyncHistoryFiltersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  projectId?: string;

  @Field(() => [SyncOperationType], { nullable: true })
  @IsOptional()
  @IsEnum(SyncOperationType, { each: true })
  operations?: SyncOperationType[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  platforms?: string[];

  @Field(() => [SyncStatus], { nullable: true })
  @IsOptional()
  @IsEnum(SyncStatus, { each: true })
  statuses?: SyncStatus[];

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  orderBy?: 'startedAt' | 'completedAt' | 'duration' = 'startedAt';

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  orderDirection?: 'asc' | 'desc' = 'desc';
}

@ArgsType()
export class SyncHistoryStatsArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;
}

@ObjectType()
export class ChangeRecordEntity {
  @Field()
  field!: string;

  @Field({ nullable: true })
  oldValue?: string;

  @Field({ nullable: true })
  newValue?: string;

  @Field()
  changeType!: string;
}

@ObjectType()
export class SyncOperationEntity {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field({ nullable: true })
  projectId?: string;

  @Field(() => SyncOperationType)
  operation!: SyncOperationType;

  @Field()
  platform!: string;

  @Field()
  repositoryUrl!: string;

  @Field(() => SyncStatus)
  status!: SyncStatus;

  @Field(() => [ChangeRecordEntity])
  changes!: ChangeRecordEntity[];

  @Field({ nullable: true })
  metadata?: string;

  @Field({ nullable: true })
  error?: string;

  @Field()
  startedAt!: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  duration?: number;

  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  projectTitle?: string;
}

@ObjectType()
export class SyncHistoryConnection {
  @Field(() => [SyncOperationEntity])
  nodes!: SyncOperationEntity[];

  @Field()
  totalCount!: number;

  @Field()
  hasNextPage!: boolean;

  @Field()
  hasPreviousPage!: boolean;
}

@ObjectType()
export class SyncPlatformStats {
  @Field()
  platform!: string;

  @Field()
  count!: number;

  @Field()
  successRate!: number;
}

@ObjectType()
export class OperationStats {
  @Field()
  operation!: string;

  @Field()
  count!: number;

  @Field()
  successRate!: number;
}

@ObjectType()
export class RecentFailure {
  @Field()
  id!: string;

  @Field()
  operation!: string;

  @Field()
  platform!: string;

  @Field()
  error!: string;

  @Field()
  startedAt!: Date;
}

@ObjectType()
export class SyncHistoryStatsEntity {
  @Field()
  totalOperations!: number;

  @Field()
  successfulOperations!: number;

  @Field()
  failedOperations!: number;

  @Field()
  successRate!: number;

  @Field()
  averageDuration!: number;

  @Field(() => [SyncPlatformStats])
  operationsByPlatform!: SyncPlatformStats[];

  @Field(() => [OperationStats])
  operationsByType!: OperationStats[];

  @Field(() => [RecentFailure])
  recentFailures!: RecentFailure[];
}

@ObjectType()
export class FailureAnalysis {
  @Field()
  totalFailures!: number;

  @Field(() => [SyncPlatformStats])
  failuresByPlatform!: SyncPlatformStats[];

  @Field(() => [OperationStats])
  failuresByOperation!: OperationStats[];

  @Field(() => [ErrorStats])
  commonErrors!: ErrorStats[];

  @Field(() => [TrendData])
  failureTrends!: TrendData[];
}

@ObjectType()
export class ErrorStats {
  @Field()
  error!: string;

  @Field()
  count!: number;

  @Field()
  percentage!: number;
}

@ObjectType()
export class TrendData {
  @Field()
  date!: string;

  @Field()
  count!: number;
}

export class SyncHistoryQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(SyncOperationType, { each: true })
  operations?: SyncOperationType[];

  @IsOptional()
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsEnum(SyncStatus, { each: true })
  statuses?: SyncStatus[];

  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  orderBy?: 'startedAt' | 'completedAt' | 'duration' = 'startedAt';

  @IsOptional()
  @IsString()
  orderDirection?: 'asc' | 'desc' = 'desc';
}
