import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsArray,
    IsInt,
    IsDateString,
    IsEnum,
    MinLength,
    MaxLength,
    Min,
    Max,
    ArrayMaxSize,
} from 'class-validator';

export enum ApiKeyPermission {
    READ = 'read',
    WRITE = 'write',
    ADMIN = 'admin',
}

export enum ApiKeyEnvironment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production',
}

export class CreateApiKeyDto {
    @ApiProperty({ example: 'Production App', description: 'Name for the API key' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name!: string;

    @ApiPropertyOptional({
        example: ['read', 'write'],
        description: 'Permissions for this key',
        enum: ApiKeyPermission,
        isArray: true,
    })
    @IsOptional()
    @IsArray()
    @IsEnum(ApiKeyPermission, { each: true })
    permissions?: ApiKeyPermission[];

    @ApiPropertyOptional({ example: 1000, description: 'Rate limit (requests per hour)' })
    @IsOptional()
    @IsInt()
    @Min(10)
    @Max(100000)
    rateLimit?: number;

    @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z', description: 'Expiration date' })
    @IsOptional()
    @IsDateString()
    expiresAt?: string;

    @ApiPropertyOptional({
        example: 'production',
        description: 'Environment for this key',
        enum: ApiKeyEnvironment,
    })
    @IsOptional()
    @IsEnum(ApiKeyEnvironment)
    environment?: ApiKeyEnvironment;

    @ApiPropertyOptional({
        example: ['192.168.1.1', '10.0.0.0/8'],
        description: 'Allowed IP addresses',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    allowedIps?: string[];

    @ApiPropertyOptional({
        example: ['https://example.com'],
        description: 'Allowed CORS origins',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    allowedOrigins?: string[];
}

export class UpdateApiKeyDto {
    @ApiPropertyOptional({ example: 'Updated Name' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ example: ['read', 'write'], enum: ApiKeyPermission, isArray: true })
    @IsOptional()
    @IsArray()
    @IsEnum(ApiKeyPermission, { each: true })
    permissions?: ApiKeyPermission[];

    @ApiPropertyOptional({ example: 2000 })
    @IsOptional()
    @IsInt()
    @Min(10)
    @Max(100000)
    rateLimit?: number;

    @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
    @IsOptional()
    @IsDateString()
    expiresAt?: string;

    @ApiPropertyOptional({ example: 'development', enum: ApiKeyEnvironment })
    @IsOptional()
    @IsEnum(ApiKeyEnvironment)
    environment?: ApiKeyEnvironment;

    @ApiPropertyOptional({ example: ['192.168.1.1'] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    allowedIps?: string[];

    @ApiPropertyOptional({ example: ['https://example.com'] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    allowedOrigins?: string[];

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    isActive?: boolean;
}

export class ApiKeyResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
    id!: string;

    @ApiProperty({ example: 'Production App' })
    name!: string;

    @ApiProperty({ example: 'gs_abc12...' })
    keyPrefix!: string;

    @ApiProperty({ example: ['read', 'write'] })
    permissions!: string[];

    @ApiProperty({ example: 1000 })
    rateLimit!: number;

    @ApiPropertyOptional({ example: '2025-12-31T23:59:59.000Z' })
    expiresAt?: Date;

    @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
    lastUsedAt?: Date;

    @ApiProperty({ example: 42 })
    usageCount!: number;

    @ApiProperty({ example: true })
    isActive!: boolean;

    @ApiProperty({ example: 'production' })
    environment!: string;

    @ApiProperty({ example: [] })
    allowedIps!: string[];

    @ApiProperty({ example: [] })
    allowedOrigins!: string[];

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    createdAt!: Date;
}

export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
    @ApiProperty({
        example: 'gs_live_abc123xyz789def456ghi',
        description: 'The full API key. ONLY shown once at creation time!',
    })
    apiKey!: string;
}

export class RevokeApiKeyDto {
    @ApiPropertyOptional({ example: 'Key compromised' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
