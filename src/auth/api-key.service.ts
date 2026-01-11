import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, ApiUsage } from '@prisma/client';
import { Counter, Histogram, Gauge } from 'prom-client';

export interface ApiKeyValidationResult {
  user: User;
  isValid: boolean;
  rateLimitExceeded: boolean;
  usageCount: number;
}

export interface ApiKeyUsageInfo {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface ApiKeyStats {
  totalKeys: number;
  activeKeys: number;
  revokedKeys: number;
  totalUsage: number;
  recentUsage: number;
  topUsers: Array<{
    userId: string;
    email: string;
    usageCount: number;
  }>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  tier: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  // Metrics for monitoring API key operations
  private readonly apiKeyOperationsCounter: Counter<string>;
  private readonly apiKeyOperationDuration: Histogram<string>;
  private readonly apiKeyUsageCounter: Counter<string>;
  private readonly apiKeyValidationCounter: Counter<string>;
  private readonly rateLimitCounter: Counter<string>;
  private readonly activeApiKeysGauge: Gauge<string>;

  // Rate limiting configurations by user tier
  private readonly rateLimitConfigs: Map<string, RateLimitConfig> = new Map([
    ['free', { windowMs: 60 * 1000, maxRequests: 100, tier: 'free' }], // 100/min
    ['premium', { windowMs: 60 * 1000, maxRequests: 1000, tier: 'premium' }], // 1000/min
    ['enterprise', { windowMs: 60 * 1000, maxRequests: 10000, tier: 'enterprise' }], // 10000/min
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    // Initialize metrics
    this.apiKeyOperationsCounter = this.metricsService.createCustomCounter(
      'api_key_mgmt_operations_total',
      'Total number of API key operations',
      ['operation', 'status', 'tier'],
    );

    this.apiKeyOperationDuration = this.metricsService.createCustomHistogram(
      'api_key_operation_duration_seconds',
      'Duration of API key operations',
      ['operation'],
      [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    );

    this.apiKeyUsageCounter = this.metricsService.createCustomCounter(
      'api_key_detailed_usage_total',
      'Total API key usage',
      ['user_tier', 'endpoint', 'method', 'status_code'],
    );

    this.apiKeyValidationCounter = this.metricsService.createCustomCounter(
      'api_key_validation_total',
      'Total API key validations',
      ['result', 'tier'],
    );

    this.rateLimitCounter = this.metricsService.createCustomCounter(
      'api_key_rate_limit_total',
      'Total rate limit hits',
      ['tier', 'endpoint'],
    );

    this.activeApiKeysGauge = this.metricsService.createCustomGauge(
      'api_keys_active_total',
      'Number of active API keys',
      ['tier'],
    );
  }

  /**
   * Generate a new secure API key with enhanced security
   */
  async generateApiKey(
    userId: string,
    reason?: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{ user: User; apiKey: string }> {
    const operationStart = Date.now();
    const operation = 'generate_api_key';

    try {
      // Get user to check tier
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.apiKeyOperationsCounter.inc({
          operation,
          status: 'failure',
          tier: 'unknown',
        });
        throw new BadRequestException('User not found');
      }

      // Generate secure API key (64 characters)
      const apiKey = this.generateSecureApiKey();
      const hashedKey = await bcrypt.hash(apiKey, 12);

      // Update user with new API key
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          apiKey: hashedKey,
          apiKeyUpdatedAt: new Date(),
        },
      });

      // Log the operation for audit trail
      await this.logAuditEvent(userId, 'api_key_generated', {
        reason: reason || 'user_requested',
        clientInfo,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyOperationsCounter.inc({
        operation,
        status: 'success',
        tier: user.tier,
      });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      this.logger.log(`API key generated for user ${userId}`, {
        userId,
        tier: user.tier,
        reason,
        clientInfo,
      });

      return { user: updatedUser, apiKey };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyOperationsCounter.inc({
        operation,
        status: 'failure',
        tier: 'unknown',
      });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      this.logger.error(`Failed to generate API key for user ${userId}`, {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId,
      });

      throw error;
    }
  }

  /**
   * Validate API key with enhanced security and rate limiting
   */
  async validateApiKey(
    apiKey: string,
    usageInfo?: ApiKeyUsageInfo,
  ): Promise<ApiKeyValidationResult> {
    const operationStart = Date.now();
    const operation = 'validate_api_key';

    try {
      // Basic format validation
      if (!apiKey || apiKey.length < 32) {
        this.apiKeyValidationCounter.inc({
          result: 'invalid_format',
          tier: 'unknown',
        });
        return {
          user: null as any,
          isValid: false,
          rateLimitExceeded: false,
          usageCount: 0,
        };
      }

      // Check for local development bypass
      const bypass = this.config.get<string>('LOCAL_API_KEY');
      if (bypass && apiKey === bypass) {
        this.apiKeyValidationCounter.inc({ result: 'bypass', tier: 'local' });
        return {
          user: { id: 'local-user', tier: 'enterprise' } as any,
          isValid: true,
          rateLimitExceeded: false,
          usageCount: 0,
        };
      }

      // Fixed: Enhanced timing attack protection with constant-time validation
      const users = await this.prisma.user.findMany({
        where: {
          apiKey: { not: null },
          deletedAt: null, // Exclude soft-deleted users
        },
        select: {
          id: true,
          email: true,
          apiKey: true,
          tier: true,
          lastLoginAt: true,
          deletedAt: true,
        },
      });

      let validUser: User | null = null;
      const validationPromises: Promise<boolean>[] = [];
      const minComparisons = 10; // Minimum number of comparisons to ensure constant time

      // Always perform at least minComparisons hash comparisons
      // This prevents timing attacks based on the number of users
      for (let i = 0; i < Math.max(users.length, minComparisons); i++) {
        if (i < users.length && users[i].apiKey) {
          validationPromises.push(bcrypt.compare(apiKey, users[i].apiKey!));
        } else {
          // Add dummy comparison to maintain constant time
          validationPromises.push(this.simulateHash());
        }
      }

      // Wait for all comparisons to complete simultaneously
      const validationResults = await Promise.all(validationPromises);

      // Find the valid user (if any) after all comparisons are done
      for (let i = 0; i < users.length; i++) {
        if (validationResults[i] && users[i].apiKey) {
          validUser = users[i] as User;
          break;
        }
      }

      // Add additional delay to normalize response time regardless of result
      await this.normalizeResponseTime(Date.now() - operationStart);

      if (!validUser) {
        this.apiKeyValidationCounter.inc({
          result: 'invalid',
          tier: 'unknown',
        });
        this.logger.warn('Invalid API key attempted', {
          keyPrefix: apiKey.substring(0, 8) + '...',
          usageInfo,
        });
        return {
          user: null as any,
          isValid: false,
          rateLimitExceeded: false,
          usageCount: 0,
        };
      }

      // Check rate limiting
      const rateLimitResult = await this.checkRateLimit(validUser, usageInfo);

      if (rateLimitResult.exceeded) {
        this.apiKeyValidationCounter.inc({
          result: 'rate_limited',
          tier: validUser.tier,
        });
        this.rateLimitCounter.inc({
          tier: validUser.tier,
          endpoint: usageInfo?.endpoint || 'unknown',
        });

        this.logger.warn(`Rate limit exceeded for user ${validUser.id}`, {
          userId: validUser.id,
          tier: validUser.tier,
          usageCount: rateLimitResult.currentUsage,
          limit: rateLimitResult.limit,
          usageInfo,
        });

        return {
          user: validUser,
          isValid: true,
          rateLimitExceeded: true,
          usageCount: rateLimitResult.currentUsage,
        };
      }

      // Track API usage
      if (usageInfo) {
        await this.trackApiUsage(validUser.id, apiKey, usageInfo);
      }

      // Update last login time
      await this.prisma.user.update({
        where: { id: validUser.id },
        data: { lastLoginAt: new Date() },
      });

      // Record successful validation
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyValidationCounter.inc({
        result: 'valid',
        tier: validUser.tier,
      });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      return {
        user: validUser,
        isValid: true,
        rateLimitExceeded: false,
        usageCount: rateLimitResult.currentUsage,
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyValidationCounter.inc({ result: 'error', tier: 'unknown' });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('API key validation error', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        usageInfo,
      });

      return {
        user: null as any,
        isValid: false,
        rateLimitExceeded: false,
        usageCount: 0,
      };
    }
  }

  /**
   * Revoke an API key with audit logging
   */
  async revokeApiKey(
    userId: string,
    reason?: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<User> {
    const operationStart = Date.now();
    const operation = 'revoke_api_key';

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.apiKeyOperationsCounter.inc({
          operation,
          status: 'failure',
          tier: 'unknown',
        });
        throw new BadRequestException('User not found');
      }

      // Revoke the API key
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          apiKey: null,
          apiKeyUpdatedAt: new Date(),
        },
      });

      // Log the operation for audit trail
      await this.logAuditEvent(userId, 'api_key_revoked', {
        reason: reason || 'user_requested',
        clientInfo,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyOperationsCounter.inc({
        operation,
        status: 'success',
        tier: user.tier,
      });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      this.logger.log(`API key revoked for user ${userId}`, {
        userId,
        tier: user.tier,
        reason,
        clientInfo,
      });

      return updatedUser;
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.apiKeyOperationsCounter.inc({
        operation,
        status: 'failure',
        tier: 'unknown',
      });
      this.apiKeyOperationDuration.observe({ operation }, operationDuration);

      this.logger.error(`Failed to revoke API key for user ${userId}`, {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId,
      });

      throw error;
    }
  }

  /**
   * Get API key statistics for monitoring and analytics
   */
  async getApiKeyStats(timeRange?: { from: Date; to: Date }): Promise<ApiKeyStats> {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const from = timeRange?.from || defaultFrom;
    const to = timeRange?.to || now;

    const [totalKeys, activeKeys, revokedKeys, totalUsage, recentUsage, topUsersData] =
      await Promise.all([
        // Total API keys ever created
        this.prisma.user.count({
          where: { apiKeyUpdatedAt: { not: null } },
        }),

        // Currently active API keys
        this.prisma.user.count({
          where: {
            apiKey: { not: null },
            deletedAt: null,
          },
        }),

        // Revoked API keys
        this.prisma.user.count({
          where: {
            apiKey: null,
            apiKeyUpdatedAt: { not: null },
            deletedAt: null,
          },
        }),

        // Total API usage
        this.prisma.apiUsage.count(),

        // Recent API usage (within time range)
        this.prisma.apiUsage.count({
          where: {
            timestamp: { gte: from, lte: to },
          },
        }),

        // Top users by API usage
        this.prisma.apiUsage.groupBy({
          by: ['userId'],
          _count: { userId: true },
          where: {
            timestamp: { gte: from, lte: to },
            userId: { not: null },
          },
          orderBy: { _count: { userId: 'desc' } },
          take: 10,
        }),
      ]);

    // Get user details for top users
    const topUsers = await Promise.all(
      topUsersData.map(async item => {
        const user = await this.prisma.user.findUnique({
          where: { id: item.userId! },
          select: { id: true, email: true },
        });
        return {
          userId: item.userId!,
          email: user?.email || 'unknown',
          usageCount: item._count.userId,
        };
      }),
    );

    return {
      totalKeys,
      activeKeys,
      revokedKeys,
      totalUsage,
      recentUsage,
      topUsers,
    };
  }

  /**
   * Update active API keys gauge metrics
   */
  async updateActiveKeysMetrics(): Promise<void> {
    try {
      const tiers = ['free', 'premium', 'enterprise'];

      for (const tier of tiers) {
        const count = await this.prisma.user.count({
          where: {
            apiKey: { not: null },
            tier,
            deletedAt: null,
          },
        });

        this.activeApiKeysGauge.set({ tier }, count);
      }
    } catch (error) {
      this.logger.error('Failed to update active keys metrics', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      });
    }
  }

  // Private helper methods

  private generateSecureApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  private async checkRateLimit(
    user: User,
    usageInfo?: ApiKeyUsageInfo,
  ): Promise<{ exceeded: boolean; currentUsage: number; limit: number }> {
    const config = this.rateLimitConfigs.get(user.tier) || this.rateLimitConfigs.get('free')!;
    const windowStart = new Date(Date.now() - config.windowMs);

    const currentUsage = await this.prisma.apiUsage.count({
      where: {
        userId: user.id,
        timestamp: { gte: windowStart },
      },
    });

    return {
      exceeded: currentUsage >= config.maxRequests,
      currentUsage,
      limit: config.maxRequests,
    };
  }

  private async trackApiUsage(
    userId: string,
    apiKey: string,
    usageInfo: ApiKeyUsageInfo,
  ): Promise<void> {
    try {
      // Store usage record
      await this.prisma.apiUsage.create({
        data: {
          userId,
          apiKey: apiKey.substring(0, 8) + '...', // Store only prefix for security
          endpoint: usageInfo.endpoint,
          method: usageInfo.method,
          statusCode: usageInfo.statusCode,
          duration: usageInfo.duration,
          ipAddress: usageInfo.ipAddress,
          userAgent: usageInfo.userAgent,
          timestamp: usageInfo.timestamp,
        },
      });

      // Update user's API call count
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          apiCallCount: { increment: 1 },
          monthlyApiCalls: { increment: 1 },
        },
      });

      // Record metrics
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tier: true },
      });

      if (user) {
        this.apiKeyUsageCounter.inc({
          user_tier: user.tier,
          endpoint: usageInfo.endpoint,
          method: usageInfo.method,
          status_code: usageInfo.statusCode.toString(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to track API usage', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId,
        usageInfo,
      });
    }
  }

  private async logAuditEvent(
    userId: string,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resource: 'api_key',
          details,
          ipAddress: details.clientInfo?.ip,
          userAgent: details.clientInfo?.userAgent,
          success: true,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to log audit event', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        action,
      });
    }
  }

  /**
   * Simulates a hash operation to maintain constant time for security
   */
  private async simulateHash(): Promise<boolean> {
    await bcrypt.hash('dummy', 12);
    return false;
  }

  /**
   * Fixed: Normalize response time to prevent timing attacks
   */
  private async normalizeResponseTime(elapsedMs: number): Promise<void> {
    const targetMs = 100; // Target response time of 100ms
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    if (remainingMs > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingMs));
    }
  }
}
