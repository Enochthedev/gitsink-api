import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    maximum: 1000,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  @Max(1000, { message: 'Page cannot exceed 1000' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString({ message: 'Sort field must be a string' })
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'Sort direction must be either "asc" or "desc"' })
  sortDirection?: 'asc' | 'desc' = 'desc';

  // Computed properties for database queries
  get skip(): number {
    return (this.page! - 1) * this.limit!;
  }

  get take(): number {
    return this.limit!;
  }
}

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination (base64 encoded)',
    example: 'eyJpZCI6IjEyMzQ1Njc4OTAifQ==',
  })
  @IsOptional()
  @IsString({ message: 'Cursor must be a string' })
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items to fetch',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'First must be an integer' })
  @Min(1, { message: 'First must be at least 1' })
  @Max(100, { message: 'First cannot exceed 100' })
  first?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of items to fetch before cursor',
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Last must be an integer' })
  @Min(1, { message: 'Last must be at least 1' })
  @Max(100, { message: 'Last cannot exceed 100' })
  last?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorPaginationMeta {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface CursorPaginatedResult<T> {
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: CursorPaginationMeta;
}
