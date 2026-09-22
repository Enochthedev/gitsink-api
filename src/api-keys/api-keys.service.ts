import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyEnvironment,
  ApiKeyPermission,
  ApiKeyResponseDto,
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key with format: gs_{env}_{random}
   */
  private generateApiKey(environment: string = 'live'): string {
    const envPrefix = environment === 'production' ? 'live' : environment.slice(0, 4);
    const randomPart = randomBytes(24).toString('base64url');
    return `gs_${envPrefix}_${randomPart}`;
  }

  /**
   * Hash API key for secure storage
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Extract prefix from API key for display
   */
  private extractPrefix(apiKey: string): string {
    return apiKey.substring(0, 12) + '...';
  }

  /**
   * Get user's tier limit for API keys
   */
  private async getUserApiKeyLimit(userId: string): Promise<number> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { tier: true },
    });

    // Default to free tier limit if no subscription
    return subscription?.tier?.apiKeyLimit ?? 1;
  }

  /**
   * List all API keys for a user
   */
  async listApiKeys(userId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.prisma.apiKeyToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map(this.toResponseDto);
  }

  /**
   * Get a single API key by ID
   */
  async getApiKey(userId: string, keyId: string): Promise<ApiKeyResponseDto> {
    const key = await this.prisma.apiKeyToken.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    return this.toResponseDto(key);
  }

  /**
   * Create a new API key
   */
  async createApiKey(userId: string, dto: CreateApiKeyDto): Promise<ApiKeyCreatedResponseDto> {
    // Check user's limit
    const limit = await this.getUserApiKeyLimit(userId);
    const currentCount = await this.prisma.apiKeyToken.count({
      where: { userId, revokedAt: null, isActive: true },
    });

    if (limit !== -1 && currentCount >= limit) {
      throw new ForbiddenException(
        `You have reached the maximum number of API keys (${limit}). Upgrade your plan to create more.`,
      );
    }

    // Generate the key
    const environment = dto.environment || ApiKeyEnvironment.PRODUCTION;
    const apiKey = this.generateApiKey(environment);
    const keyHash = this.hashApiKey(apiKey);
    const keyPrefix = this.extractPrefix(apiKey);

    // Create in database
    const created = await this.prisma.apiKeyToken.create({
      data: {
        userId,
        name: dto.name,
        keyHash,
        keyPrefix,
        permissions: dto.permissions || [ApiKeyPermission.READ, ApiKeyPermission.WRITE],
        rateLimit: dto.rateLimit || 1000,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        environment,
        allowedIps: dto.allowedIps || [],
        allowedOrigins: dto.allowedOrigins || [],
      },
    });

    return {
      ...this.toResponseDto(created),
      apiKey, // Only returned at creation time!
    };
  }

  /**
   * Update an API key
   */
  async updateApiKey(
    userId: string,
    keyId: string,
    dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    const key = await this.prisma.apiKeyToken.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    const updated = await this.prisma.apiKeyToken.update({
      where: { id: keyId },
      data: {
        name: dto.name,
        permissions: dto.permissions,
        rateLimit: dto.rateLimit,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        environment: dto.environment,
        allowedIps: dto.allowedIps,
        allowedOrigins: dto.allowedOrigins,
        isActive: dto.isActive,
      },
    });

    return this.toResponseDto(updated);
  }

  /**
   * Rotate (regenerate) an API key
   */
  async rotateApiKey(userId: string, keyId: string): Promise<ApiKeyCreatedResponseDto> {
    const key = await this.prisma.apiKeyToken.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    // Generate new key
    const apiKey = this.generateApiKey(key.environment);
    const keyHash = this.hashApiKey(apiKey);
    const keyPrefix = this.extractPrefix(apiKey);

    const updated = await this.prisma.apiKeyToken.update({
      where: { id: keyId },
      data: {
        keyHash,
        keyPrefix,
        usageCount: 0,
        lastUsedAt: null,
        lastUsedIp: null,
      },
    });

    return {
      ...this.toResponseDto(updated),
      apiKey,
    };
  }

  /**
   * Revoke (soft delete) an API key
   */
  async revokeApiKey(userId: string, keyId: string, reason?: string): Promise<void> {
    const key = await this.prisma.apiKeyToken.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKeyToken.update({
      where: { id: keyId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Validate an API key and return user info
   */
  async validateApiKey(
    apiKey: string,
  ): Promise<{ userId: string; permissions: string[]; keyId: string } | null> {
    const keyHash = this.hashApiKey(apiKey);

    const key = await this.prisma.apiKeyToken.findUnique({
      where: { keyHash },
    });

    if (!key || !key.isActive || key.revokedAt) {
      return null;
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) {
      return null;
    }

    // Update usage stats (fire and forget)
    this.prisma.apiKeyToken
      .update({
        where: { id: key.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      })
      .catch(() => {}); // Ignore errors

    return {
      userId: key.userId,
      permissions: key.permissions,
      keyId: key.id,
    };
  }

  /**
   * Get API key usage stats
   */
  async getApiKeyStats(userId: string): Promise<{
    total: number;
    active: number;
    limit: number;
    keys: Array<{ id: string; name: string; usageCount: number; lastUsedAt: Date | null }>;
  }> {
    const limit = await this.getUserApiKeyLimit(userId);
    const keys = await this.prisma.apiKeyToken.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, name: true, usageCount: true, lastUsedAt: true, isActive: true },
    });

    return {
      total: keys.length,
      active: keys.filter(k => k.isActive).length,
      limit: limit === -1 ? Infinity : limit,
      keys: keys.map(k => ({
        id: k.id,
        name: k.name,
        usageCount: k.usageCount,
        lastUsedAt: k.lastUsedAt,
      })),
    };
  }

  /**
   * Convert database record to response DTO
   */
  private toResponseDto(key: any): ApiKeyResponseDto {
    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount,
      isActive: key.isActive,
      environment: key.environment,
      allowedIps: key.allowedIps,
      allowedOrigins: key.allowedOrigins,
      createdAt: key.createdAt,
    };
  }
}
