import {
  IsString,
  IsObject,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMetadataDto {
  @ApiProperty({ description: 'Project ID to associate metadata with' })
  @IsString()
  projectId!: string;

  @ApiProperty({
    description: 'Custom metadata object',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  metadata!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Specific version number (auto-incremented if not provided)',
  })
  @IsOptional()
  @IsNumber()
  version?: number;
}

export class UpdateMetadataDto {
  @ApiProperty({
    description: 'Updated custom metadata object',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  metadata!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Specific version number (auto-incremented if not provided)',
  })
  @IsOptional()
  @IsNumber()
  version?: number;
}

export class MetadataSearchDto {
  @ApiProperty({ description: 'Field name to search in' })
  @IsString()
  field!: string;

  @ApiProperty({ description: 'Value to search for' })
  value!: any;

  @ApiPropertyOptional({
    description: 'Search operator',
    enum: ['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'exists'],
    default: 'equals',
  })
  @IsOptional()
  @IsEnum(['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'exists'])
  operator?: 'equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists';

  @ApiPropertyOptional({
    description: 'Data type of the field',
    enum: ['string', 'number', 'boolean', 'array', 'object'],
    default: 'string',
  })
  @IsOptional()
  @IsEnum(['string', 'number', 'boolean', 'array', 'object'])
  dataType?: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

export class MetadataResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Metadata entry data' })
  data?: {
    id: string;
    projectId: string;
    userId: string;
    version: number;
    metadata: Record<string, any>;
    hash: string;
    size: number;
    fieldCount: number;
    createdAt: Date;
  };

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Warning messages' })
  warnings?: string[];
}

export class MetadataHistoryResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Array of metadata versions' })
  data?: Array<{
    id: string;
    version: number;
    hash: string;
    size: number;
    fieldCount: number;
    createdAt: Date;
    userId: string;
  }>;

  @ApiPropertyOptional({ description: 'Total number of versions' })
  total?: number;

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  error?: string;
}

export class MetadataComparisonResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Comparison result' })
  data?: {
    added: Record<string, any>;
    removed: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
  };

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  error?: string;
}

export class MetadataSearchResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Array of matching project IDs' })
  data?: string[];

  @ApiPropertyOptional({ description: 'Total number of matches' })
  total?: number;

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  error?: string;
}

export class MetadataStatisticsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Metadata statistics' })
  data?: {
    projectsWithMetadata: number;
    totalMetadataEntries: number;
    averageFieldCount: number;
    mostCommonFields: Array<{ field: string; count: number }>;
    averageSize: number;
    maxSize: number;
    minSize: number;
  };

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  error?: string;
}

export class MetadataFieldDefinitionDto {
  @ApiProperty({ description: 'Field name' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Field data type',
    enum: ['string', 'number', 'boolean', 'array', 'object'],
  })
  @IsEnum(['string', 'number', 'boolean', 'array', 'object'])
  type!: 'string' | 'number' | 'boolean' | 'array' | 'object';

  @ApiPropertyOptional({ description: 'Whether field is required' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Field description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Validation rules',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };

  @ApiPropertyOptional({ description: 'Example values', type: 'array' })
  @IsOptional()
  @IsArray()
  examples?: any[];
}

export class MetadataSchemaDto {
  @ApiProperty({ description: 'Schema version' })
  @IsString()
  version!: string;

  @ApiProperty({ description: 'Schema name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Schema description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Field definitions',
    type: [MetadataFieldDefinitionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetadataFieldDefinitionDto)
  fields!: MetadataFieldDefinitionDto[];
}

export class MetadataTemplateDto {
  @ApiProperty({ description: 'Template ID' })
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Template name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Template description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Template category' })
  @IsString()
  category!: string;

  @ApiProperty({ description: 'Template schema', type: MetadataSchemaDto })
  @ValidateNested()
  @Type(() => MetadataSchemaDto)
  schema!: MetadataSchemaDto;

  @ApiProperty({ description: 'Whether template is public' })
  @IsBoolean()
  isPublic!: boolean;

  @ApiProperty({ description: 'Usage count' })
  @IsNumber()
  usageCount!: number;

  @ApiProperty({ description: 'Created by user ID' })
  @IsString()
  createdBy!: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt!: Date;
}
