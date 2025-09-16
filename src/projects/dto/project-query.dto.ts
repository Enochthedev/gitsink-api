import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsBoolean, IsString, IsArray, IsIn, ArrayMaxSize } from 'class-validator';
import { ProjectSearchDto } from '../../common/dto/search.dto';

export class ProjectQueryDto extends ProjectSearchDto {
    @ApiPropertyOptional({
        description: 'Filter by project visibility',
        enum: ['public', 'private', 'all'],
        default: 'public',
        example: 'public',
    })
    @IsOptional()
    @IsIn(['public', 'private', 'all'], {
        message: 'Visibility must be one of: public, private, all',
    })
    visibility?: 'public' | 'private' | 'all' = 'public';

    @ApiPropertyOptional({
        description: 'Filter by project status',
        enum: ['active', 'archived', 'all'],
        default: 'active',
        example: 'active',
    })
    @IsOptional()
    @IsIn(['active', 'archived', 'all'], {
        message: 'Status must be one of: active, archived, all',
    })
    status?: 'active' | 'archived' | 'all' = 'active';

    @ApiPropertyOptional({
        description: 'Filter by sync status',
        enum: ['synced', 'pending', 'failed', 'all'],
        default: 'all',
        example: 'synced',
    })
    @IsOptional()
    @IsIn(['synced', 'pending', 'failed', 'all'], {
        message: 'Sync status must be one of: synced, pending, failed, all',
    })
    syncStatus?: 'synced' | 'pending' | 'failed' | 'all' = 'all';

    @ApiPropertyOptional({
        description: 'Whether to include AI analysis data',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include AI analysis must be a boolean' })
    includeAiAnalysis?: boolean = false;

    @ApiPropertyOptional({
        description: 'Whether to include sync history',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include sync history must be a boolean' })
    includeSyncHistory?: boolean = false;

    @ApiPropertyOptional({
        description: 'Whether to include project statistics',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include stats must be a boolean' })
    includeStats?: boolean = true;

    @ApiPropertyOptional({
        description: 'Specific fields to include in response',
        type: [String],
        example: ['id', 'title', 'description', 'tags'],
    })
    @IsOptional()
    @IsArray({ message: 'Fields must be an array' })
    @IsString({ each: true, message: 'Each field must be a string' })
    @ArrayMaxSize(20, { message: 'Cannot specify more than 20 fields' })
    fields?: string[];

    @ApiPropertyOptional({
        description: 'Specific fields to exclude from response',
        type: [String],
        example: ['readme', 'metadata'],
    })
    @IsOptional()
    @IsArray({ message: 'Exclude fields must be an array' })
    @IsString({ each: true, message: 'Each exclude field must be a string' })
    @ArrayMaxSize(20, { message: 'Cannot exclude more than 20 fields' })
    excludeFields?: string[];
}

export class ProjectStatsQueryDto {
    @ApiPropertyOptional({
        description: 'Group statistics by time period',
        enum: ['day', 'week', 'month', 'year'],
        default: 'month',
        example: 'month',
    })
    @IsOptional()
    @IsIn(['day', 'week', 'month', 'year'], {
        message: 'Group by must be one of: day, week, month, year',
    })
    groupBy?: 'day' | 'week' | 'month' | 'year' = 'month';

    @ApiPropertyOptional({
        description: 'Include language statistics',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include languages must be a boolean' })
    includeLanguages?: boolean = true;

    @ApiPropertyOptional({
        description: 'Include technology stack statistics',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include technologies must be a boolean' })
    includeTechnologies?: boolean = true;

    @ApiPropertyOptional({
        description: 'Include category statistics',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include categories must be a boolean' })
    includeCategories?: boolean = true;

    @ApiPropertyOptional({
        description: 'Include activity statistics',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include activity must be a boolean' })
    includeActivity?: boolean = false;
}