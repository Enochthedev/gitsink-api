import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ArgsType, Field, InputType } from '@nestjs/graphql';
import { AuditAction, AuditResource } from '../interfaces/audit.interface';

@InputType()
export class CreateAuditLogInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field(() => AuditAction)
  @IsEnum(AuditAction)
  action!: AuditAction;

  @Field(() => AuditResource, { nullable: true })
  @IsOptional()
  @IsEnum(AuditResource)
  resource?: AuditResource;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  details?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  error?: string;
}

@ArgsType()
export class AuditLogFiltersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field(() => [AuditAction], { nullable: true })
  @IsOptional()
  @IsEnum(AuditAction, { each: true })
  actions?: AuditAction[];

  @Field(() => [AuditResource], { nullable: true })
  @IsOptional()
  @IsEnum(AuditResource, { each: true })
  resources?: AuditResource[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @Field({ defaultValue: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 50;

  @Field({ defaultValue: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @Field({ defaultValue: 'timestamp' })
  @IsOptional()
  @IsString()
  orderBy?: 'timestamp' | 'action' | 'resource' = 'timestamp';

  @Field({ defaultValue: 'desc' })
  @IsOptional()
  @IsString()
  orderDirection?: 'asc' | 'desc' = 'desc';
}

@ArgsType()
export class AuditSummaryArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field({ defaultValue: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  topLimit?: number = 10;
}

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(AuditAction, { each: true })
  actions?: AuditAction[];

  @IsOptional()
  @IsEnum(AuditResource, { each: true })
  resources?: AuditResource[];

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  orderBy?: 'timestamp' | 'action' | 'resource' = 'timestamp';

  @IsOptional()
  @IsString()
  orderDirection?: 'asc' | 'desc' = 'desc';
}
