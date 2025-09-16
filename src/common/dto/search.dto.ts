import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsOptional,
    IsString,
    IsArray,
    IsBoolean,
    MinLength,
    MaxLength,
    IsIn,
    ArrayMaxSize,
    IsDateString
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class SearchDto extends PaginationDto {
    @ApiPropertyOptional({
        description: 'Search query string',
        minLength: 1,
        maxLength: 200,
        example: 'react typescript',
    })
    @IsOptional()
    @IsString({ message: 'Query must be a string' })
    @MinLength(1, { message: 'Query must be at least 1 character long' })
    @MaxLength(200, { message: 'Query cannot exceed 200 characters' })
    query?: string;

    @ApiPropertyOptional({
        description: 'Tags to filter by',
        type: [String],
        example: ['react', 'typescript', 'nodejs'],
    })
    @IsOptional()
    @IsArray({ message: 'Tags must be an array' })
    @IsString({ each: true, message: 'Each tag must be a string' })
    @ArrayMaxSize(20, { message: 'Cannot filter by more than 20 tags' })
    tags?: string[];

    @ApiPropertyOptional({
        description: 'Categories to filter by',
        type: [String],
        example: ['web', 'mobile', 'api'],
    })
    @IsOptional()
    @IsArray({ message: 'Categories must be an array' })
    @IsString({ each: true, message: 'Each category must be a string' })
    @ArrayMaxSize(10, { message: 'Cannot filter by more than 10 categories' })
    categories?: string[];

    @ApiPropertyOptional({
        description: 'Programming languages to filter by',
        type: [String],
        example: ['TypeScript', 'JavaScript', 'Python'],
    })
    @IsOptional()
    @IsArray({ message: 'Languages must be an array' })
    @IsString({ each: true, message: 'Each language must be a string' })
    @ArrayMaxSize(15, { message: 'Cannot filter by more than 15 languages' })
    languages?: string[];

    @ApiPropertyOptional({
        description: 'Whether to include private repositories',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include private must be a boolean' })
    includePrivate?: boolean = false;

    @ApiPropertyOptional({
        description: 'Whether to include archived repositories',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Include archived must be a boolean' })
    includeArchived?: boolean = false;

    @ApiPropertyOptional({
        description: 'Minimum star count',
        minimum: 0,
        example: 10,
    })
    @IsOptional()
    @Type(() => Number)
    minStars?: number;

    @ApiPropertyOptional({
        description: 'Maximum star count',
        minimum: 0,
        example: 1000,
    })
    @IsOptional()
    @Type(() => Number)
    maxStars?: number;

    @ApiPropertyOptional({
        description: 'Date range start (ISO 8601)',
        example: '2023-01-01T00:00:00Z',
    })
    @IsOptional()
    @IsDateString({}, { message: 'Date from must be a valid ISO 8601 date' })
    dateFrom?: string;

    @ApiPropertyOptional({
        description: 'Date range end (ISO 8601)',
        example: '2023-12-31T23:59:59Z',
    })
    @IsOptional()
    @IsDateString({}, { message: 'Date to must be a valid ISO 8601 date' })
    dateTo?: string;

    @ApiPropertyOptional({
        description: 'Search scope',
        enum: ['all', 'title', 'description', 'readme', 'tags'],
        default: 'all',
        example: 'all',
    })
    @IsOptional()
    @IsIn(['all', 'title', 'description', 'readme', 'tags'], {
        message: 'Search scope must be one of: all, title, description, readme, tags',
    })
    scope?: 'all' | 'title' | 'description' | 'readme' | 'tags' = 'all';

    @ApiPropertyOptional({
        description: 'Search mode',
        enum: ['fuzzy', 'exact', 'prefix'],
        default: 'fuzzy',
        example: 'fuzzy',
    })
    @IsOptional()
    @IsIn(['fuzzy', 'exact', 'prefix'], {
        message: 'Search mode must be one of: fuzzy, exact, prefix',
    })
    mode?: 'fuzzy' | 'exact' | 'prefix' = 'fuzzy';
}

export class ProjectSearchDto extends SearchDto {
    @ApiPropertyOptional({
        description: 'Owner username to filter by',
        example: 'johndoe',
    })
    @IsOptional()
    @IsString({ message: 'Owner must be a string' })
    @MinLength(1, { message: 'Owner must be at least 1 character long' })
    @MaxLength(50, { message: 'Owner cannot exceed 50 characters' })
    owner?: string;

    @ApiPropertyOptional({
        description: 'Platform to filter by',
        enum: ['github', 'gitlab', 'bitbucket'],
        example: 'github',
    })
    @IsOptional()
    @IsIn(['github', 'gitlab', 'bitbucket'], {
        message: 'Platform must be one of: github, gitlab, bitbucket',
    })
    platform?: 'github' | 'gitlab' | 'bitbucket';

    @ApiPropertyOptional({
        description: 'Whether to include featured projects only',
        default: false,
        example: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Featured only must be a boolean' })
    featuredOnly?: boolean = false;

    @ApiPropertyOptional({
        description: 'Whether to include published projects only',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Published only must be a boolean' })
    publishedOnly?: boolean = true;
}

export class UserSearchDto extends SearchDto {
    @ApiPropertyOptional({
        description: 'Location to filter by',
        example: 'San Francisco, CA',
    })
    @IsOptional()
    @IsString({ message: 'Location must be a string' })
    @MaxLength(100, { message: 'Location cannot exceed 100 characters' })
    location?: string;

    @ApiPropertyOptional({
        description: 'Company to filter by',
        example: 'GitHub',
    })
    @IsOptional()
    @IsString({ message: 'Company must be a string' })
    @MaxLength(100, { message: 'Company cannot exceed 100 characters' })
    company?: string;

    @ApiPropertyOptional({
        description: 'Whether to include users with public profiles only',
        default: true,
        example: true,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean({ message: 'Public only must be a boolean' })
    publicOnly?: boolean = true;

    @ApiPropertyOptional({
        description: 'Minimum number of public repositories',
        minimum: 0,
        example: 5,
    })
    @IsOptional()
    @Type(() => Number)
    minRepos?: number;

    @ApiPropertyOptional({
        description: 'Minimum number of followers',
        minimum: 0,
        example: 10,
    })
    @IsOptional()
    @Type(() => Number)
    minFollowers?: number;
}