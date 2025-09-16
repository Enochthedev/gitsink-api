import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUrl, MinLength, MaxLength } from 'class-validator';
import { IsGitHubRepoUrl } from '../../common/validation/validation.decorators';

export class SyncProjectDto {
    @ApiProperty({
        description: 'GitHub repository URL to sync',
        example: 'https://github.com/user/repository',
        format: 'url',
    })
    @IsString({ message: 'Repository URL must be a string' })
    @IsUrl({}, { message: 'Repository URL must be a valid URL' })
    @IsGitHubRepoUrl({ message: 'Must be a valid GitHub repository URL' })
    repoUrl!: string;

    @ApiPropertyOptional({
        description: 'Branch to sync from',
        default: 'main',
        example: 'main',
        minLength: 1,
        maxLength: 100,
    })
    @IsOptional()
    @IsString({ message: 'Branch must be a string' })
    @MinLength(1, { message: 'Branch name cannot be empty' })
    @MaxLength(100, { message: 'Branch name cannot exceed 100 characters' })
    branch?: string = 'main';

    @ApiPropertyOptional({
        description: 'Whether to mark the repository as blacklisted',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean({ message: 'Blacklisted must be a boolean value' })
    blacklisted?: boolean = false;

    @ApiPropertyOptional({
        description: 'Whether to force sync even if already up to date',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean({ message: 'Force sync must be a boolean value' })
    forceSync?: boolean = false;
}

export class BulkSyncProjectsDto {
    @ApiProperty({
        description: 'Array of repository URLs to sync',
        type: [String],
        example: [
            'https://github.com/user/repo1',
            'https://github.com/user/repo2',
        ],
        minItems: 1,
        maxItems: 50,
    })
    @IsString({ each: true, message: 'Each repository URL must be a string' })
    @IsUrl({}, { each: true, message: 'Each repository URL must be a valid URL' })
    @IsGitHubRepoUrl({ each: true, message: 'Each URL must be a valid GitHub repository URL' })
    repoUrls!: string[];

    @ApiPropertyOptional({
        description: 'Default branch to sync from for all repositories',
        default: 'main',
        example: 'main',
    })
    @IsOptional()
    @IsString({ message: 'Branch must be a string' })
    @MinLength(1, { message: 'Branch name cannot be empty' })
    @MaxLength(100, { message: 'Branch name cannot exceed 100 characters' })
    branch?: string = 'main';

    @ApiPropertyOptional({
        description: 'Whether to force sync even if repositories are already up to date',
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean({ message: 'Force sync must be a boolean value' })
    forceSync?: boolean = false;
}

export class SyncProjectResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true,
    })
    success!: boolean;

    @ApiProperty({
        description: 'Status message',
        example: 'Project sync initiated successfully',
    })
    message!: string;

    @ApiProperty({
        description: 'Sync job ID for tracking',
        example: 'sync_job_123456789',
    })
    jobId!: string;

    @ApiProperty({
        description: 'Estimated completion time',
        example: '2024-01-15T10:35:00Z',
    })
    estimatedCompletion!: string;
}

export class BulkSyncResponseDto {
    @ApiProperty({
        description: 'Success status',
        example: true,
    })
    success!: boolean;

    @ApiProperty({
        description: 'Status message',
        example: 'Bulk sync initiated for 5 repositories',
    })
    message!: string;

    @ApiProperty({
        description: 'Array of sync job IDs',
        type: [String],
        example: ['sync_job_123', 'sync_job_124', 'sync_job_125'],
    })
    jobIds!: string[];

    @ApiProperty({
        description: 'Number of repositories queued for sync',
        example: 5,
    })
    queuedCount!: number;

    @ApiProperty({
        description: 'Estimated completion time for all jobs',
        example: '2024-01-15T10:40:00Z',
    })
    estimatedCompletion!: string;
}