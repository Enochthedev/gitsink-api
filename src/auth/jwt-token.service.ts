import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MetricsService } from '../metrics/metrics.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, RefreshToken } from '@prisma/client';
import { Counter, Histogram, Gauge } from 'prom-client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface TokenValidationResult {
  user: User;
  isValid: boolean;
  isBlacklisted: boolean;
  payload: any;
}

export interface EnhancedJwtPayload {
  sub: string; // User ID
  email: string;
  username?: string;
  type: 'access' | 'refresh';
  tier: string;
  iat: number;
  exp: number;
  jti: string; // JWT ID for tracking
  sessionId?: string;
  permissions?: string[];
  deviceId?: string;
  ipAddress?: string;
}

export interface TokenStats {
  totalTokensIssued: number;
  activeRefreshTokens: number;
  blacklistedTokens: number;
  expiredTokens: number;
  recentTokens: number;
}

@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);

  // Token configuration
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly MAX_REFRESH_TOKENS_PER_USER = 5;

  // Metrics for monitoring JWT operations
  private readonly tokenOperationsCounter: Counter<string>;
  private readonly tokenOperationDuration: Histogram<string>;
  private readonly tokenValidationCounter: Counter<string>;
  private readonly activeRefreshTokensGauge: Gauge<string>;
  private readonly blacklistedTokensGauge: Gauge<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly metricsService: MetricsService,
  ) {
    // Initialize metrics
    this.tokenOperationsCounter = this.metricsService.createCustomCounter(
      'jwt_token_operations_total',
      'Total number of JWT token operations',
      ['operation', 'status', 'token_type'],
    );

    this.tokenOperationDuration = this.metricsService.createCustomHistogram(
      'jwt_token_operation_duration_seconds',
      'Duration of JWT token operations',
      ['operation'],
      [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    );

    this.tokenValidationCounter = this.metricsService.createCustomCounter(
      'jwt_token_validation_total',
      'Total JWT token validations',
      ['result', 'token_type'],
    );

    this.activeRefreshTokensGauge = this.metricsService.createCustomGauge(
      'jwt_refresh_tokens_active_total',
      'Number of active refresh tokens',
      ['user_tier'],
    );

    this.blacklistedTokensGauge = this.metricsService.createCustomGauge(
      'jwt_tokens_blacklisted_total',
      'Number of blacklisted tokens',
    );
  }

  /**
   * Generate a new token pair (access + refresh tokens)
   */
  async generateTokenPair(
    user: User,
    deviceInfo?: { deviceId?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const operationStart = Date.now();
    const operation = 'generate_token_pair';

    try {
      // Clean up old refresh tokens for this user
      await this.cleanupOldRefreshTokens(user.id);

      // Generate unique session ID
      const sessionId = randomBytes(16).toString('hex');
      const jti = randomBytes(16).toString('hex');

      // Create enhanced JWT payload
      const basePayload: Partial<EnhancedJwtPayload> = {
        sub: user.id,
        email: user.email,
        username: user.username || undefined,
        tier: user.tier,
        sessionId,
        deviceId: deviceInfo?.deviceId,
        ipAddress: deviceInfo?.ipAddress,
        permissions: this.getUserPermissions(user),
      };

      // Generate access token
      const accessPayload: EnhancedJwtPayload = {
        ...basePayload,
        type: 'access',
        jti: jti + '_access',
      } as EnhancedJwtPayload;

      const accessToken = this.jwtService.sign(accessPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      });

      // Generate refresh token
      const refreshJti = jti + '_refresh';
      const refreshPayload: EnhancedJwtPayload = {
        ...basePayload,
        type: 'refresh',
        jti: refreshJti,
      } as EnhancedJwtPayload;

      const refreshToken = this.jwtService.sign(refreshPayload, {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
      });

      // Store refresh token in database
      await this.storeRefreshToken(user.id, refreshToken, refreshJti, deviceInfo);

      // Log the operation for audit trail
      await this.logTokenEvent(user.id, 'token_pair_generated', {
        sessionId,
        deviceInfo,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'success',
        token_type: 'pair',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.log(`Token pair generated for user ${user.id}`, {
        userId: user.id,
        sessionId,
        deviceInfo,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
        refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'failure',
        token_type: 'pair',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.error(`Failed to generate token pair for user ${user.id}`, {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId: user.id,
      });

      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * Fixed: Enhanced validation with better edge case handling
   */
  async refreshAccessToken(
    refreshToken: string,
    deviceInfo?: { deviceId?: string; ipAddress?: string },
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const operationStart = Date.now();
    const operation = 'refresh_access_token';

    try {
      // Basic format validation
      if (!refreshToken || typeof refreshToken !== 'string') {
        this.tokenValidationCounter.inc({
          result: 'invalid_format',
          token_type: 'refresh',
        });
        throw new UnauthorizedException('Invalid refresh token format');
      }

      // Validate refresh token
      const payload = await this.validateToken(refreshToken);

      if (!payload.isValid) {
        this.tokenValidationCounter.inc({
          result: 'invalid',
          token_type: 'refresh',
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (payload.isBlacklisted) {
        this.tokenValidationCounter.inc({
          result: 'blacklisted',
          token_type: 'refresh',
        });
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      if (!payload.payload || payload.payload.type !== 'refresh') {
        this.tokenValidationCounter.inc({
          result: 'wrong_type',
          token_type: 'refresh',
        });
        throw new UnauthorizedException('Invalid token type');
      }

      // Validate payload structure
      if (!payload.payload.jti || !payload.payload.sub) {
        this.tokenValidationCounter.inc({
          result: 'malformed_payload',
          token_type: 'refresh',
        });
        throw new UnauthorizedException('Malformed token payload');
      }

      // Check if refresh token exists in database with additional validation
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          id: payload.payload.jti,
          userId: payload.user.id,
          expiresAt: { gt: new Date() },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              tier: true,
              deletedAt: true, // Check if user is soft-deleted
            },
          },
        },
      });

      if (!storedToken) {
        this.tokenValidationCounter.inc({
          result: 'not_found',
          token_type: 'refresh',
        });
        this.logger.warn('Refresh token not found in database', {
          jti: payload.payload.jti,
          userId: payload.user.id,
        });
        throw new UnauthorizedException('Refresh token not found or expired');
      }

      // Check if user account is still active
      if (storedToken.user.deletedAt) {
        this.tokenValidationCounter.inc({
          result: 'user_deleted',
          token_type: 'refresh',
        });
        this.logger.warn('Refresh token used for deleted user', {
          userId: storedToken.user.id,
          jti: payload.payload.jti,
        });
        throw new UnauthorizedException('User account no longer exists');
      }

      // Validate refresh token hash with timing-safe comparison
      const isValidToken = await bcrypt.compare(refreshToken, storedToken.tokenHash);
      if (!isValidToken) {
        this.tokenValidationCounter.inc({
          result: 'hash_mismatch',
          token_type: 'refresh',
        });
        this.logger.warn('Refresh token hash mismatch - possible attack', {
          userId: payload.user.id,
          jti: payload.payload.jti,
          ipAddress: deviceInfo?.ipAddress,
          deviceId: deviceInfo?.deviceId,
        });

        // Revoke all tokens for this user as a security measure
        await this.revokeAllUserTokens(payload.user.id, 'security_hash_mismatch');

        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check for suspicious usage patterns
      const now = new Date();
      const timeSinceLastUse = storedToken.lastUsedAt
        ? now.getTime() - storedToken.lastUsedAt.getTime()
        : 0;

      // If token was used very recently (within 1 second), it might be a replay attack
      if (timeSinceLastUse < 1000 && storedToken.lastUsedAt) {
        this.logger.warn('Potential refresh token replay attack detected', {
          userId: storedToken.user.id,
          jti: payload.payload.jti,
          timeSinceLastUse,
          ipAddress: deviceInfo?.ipAddress,
        });
      }

      // Check usage count for anomalies
      if (storedToken.usageCount > 1000) {
        // Arbitrary high limit
        this.logger.warn('Refresh token with unusually high usage count', {
          userId: storedToken.user.id,
          jti: payload.payload.jti,
          usageCount: storedToken.usageCount,
        });
      }

      // Generate new access token
      const newJti = randomBytes(16).toString('hex') + '_access';
      const accessPayload: EnhancedJwtPayload = {
        sub: storedToken.user.id,
        email: storedToken.user.email,
        username: storedToken.user.username || undefined,
        type: 'access',
        tier: storedToken.user.tier,
        jti: newJti,
        sessionId: payload.payload.sessionId,
        deviceId: deviceInfo?.deviceId || payload.payload.deviceId,
        ipAddress: deviceInfo?.ipAddress || payload.payload.ipAddress,
        permissions: this.getUserPermissions(storedToken.user as any),
      } as EnhancedJwtPayload;

      const accessToken = this.jwtService.sign(accessPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      });

      // Update last used timestamp for refresh token
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });

      // Log the operation
      await this.logTokenEvent(storedToken.user.id, 'access_token_refreshed', {
        sessionId: payload.payload.sessionId,
        deviceInfo,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'success',
        token_type: 'access',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      return {
        accessToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'failure',
        token_type: 'access',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('Failed to refresh access token', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      });

      throw error;
    }
  }

  /**
   * Validate any JWT token (access or refresh)
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    const operationStart = Date.now();
    const operation = 'validate_token';

    try {
      // Decode and verify JWT
      const payload = await this.jwtService.verifyAsync(token);

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        this.tokenValidationCounter.inc({
          result: 'blacklisted',
          token_type: payload.type,
        });
        return {
          user: null as any,
          isValid: false,
          isBlacklisted: true,
          payload,
        };
      }

      // Get user from database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        this.tokenValidationCounter.inc({
          result: 'user_not_found',
          token_type: payload.type,
        });
        return {
          user: null as any,
          isValid: false,
          isBlacklisted: false,
          payload,
        };
      }

      // Record successful validation
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenValidationCounter.inc({
        result: 'valid',
        token_type: payload.type,
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      return {
        user,
        isValid: true,
        isBlacklisted: false,
        payload,
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenValidationCounter.inc({
        result: 'invalid',
        token_type: 'unknown',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      return {
        user: null as any,
        isValid: false,
        isBlacklisted: false,
        payload: null,
      };
    }
  }

  /**
   * Blacklist a token (for logout functionality)
   */
  async blacklistToken(token: string, reason?: string): Promise<void> {
    const operationStart = Date.now();
    const operation = 'blacklist_token';

    try {
      const payload = this.jwtService.decode(token);

      if (!payload || !payload.jti) {
        throw new BadRequestException('Invalid token format');
      }

      // Add token to blacklist
      await this.prisma.tokenBlacklist.create({
        data: {
          jti: payload.jti,
          tokenType: payload.type,
          userId: payload.sub,
          reason: reason || 'user_logout',
          expiresAt: new Date(payload.exp * 1000),
          createdAt: new Date(),
        },
      });

      // If it's a refresh token, also remove from refresh tokens table
      if (payload.type === 'refresh') {
        await this.prisma.refreshToken.deleteMany({
          where: { id: payload.jti },
        });
      }

      // Log the operation
      await this.logTokenEvent(payload.sub, 'token_blacklisted', {
        jti: payload.jti,
        tokenType: payload.type,
        reason,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'success',
        token_type: payload.type,
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.log(`Token blacklisted`, {
        jti: payload.jti,
        tokenType: payload.type,
        userId: payload.sub,
        reason,
      });
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'failure',
        token_type: 'unknown',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('Failed to blacklist token', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      });

      throw error;
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string, reason?: string): Promise<number> {
    const operationStart = Date.now();
    const operation = 'revoke_all_user_tokens';

    try {
      // Get all active refresh tokens for user
      const refreshTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
      });

      // Blacklist all refresh tokens
      const blacklistPromises = refreshTokens.map(token =>
        this.prisma.tokenBlacklist.create({
          data: {
            jti: token.id,
            tokenType: 'refresh',
            userId,
            reason: reason || 'revoke_all_sessions',
            expiresAt: token.expiresAt,
            createdAt: new Date(),
          },
        }),
      );

      await Promise.all(blacklistPromises);

      // Delete all refresh tokens
      const deleteResult = await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Log the operation
      await this.logTokenEvent(userId, 'all_tokens_revoked', {
        count: deleteResult.count,
        reason,
        timestamp: new Date(),
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'success',
        token_type: 'all',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.log(`All tokens revoked for user ${userId}`, {
        userId,
        count: deleteResult.count,
        reason,
      });

      return deleteResult.count;
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'failure',
        token_type: 'all',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.error(`Failed to revoke all tokens for user ${userId}`, {
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
   * Clean up expired tokens and blacklist entries
   */
  async cleanupExpiredTokens(): Promise<{
    refreshTokens: number;
    blacklistEntries: number;
  }> {
    const operationStart = Date.now();
    const operation = 'cleanup_expired_tokens';

    try {
      const now = new Date();

      // Clean up expired refresh tokens
      const expiredRefreshTokens = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      // Clean up expired blacklist entries
      const expiredBlacklistEntries = await this.prisma.tokenBlacklist.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'success',
        token_type: 'cleanup',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.log('Token cleanup completed', {
        expiredRefreshTokens: expiredRefreshTokens.count,
        expiredBlacklistEntries: expiredBlacklistEntries.count,
      });

      return {
        refreshTokens: expiredRefreshTokens.count,
        blacklistEntries: expiredBlacklistEntries.count,
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.tokenOperationsCounter.inc({
        operation,
        status: 'failure',
        token_type: 'cleanup',
      });
      this.tokenOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('Token cleanup failed', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
      });

      throw new InternalServerErrorException('Token cleanup failed');
    }
  }

  /**
   * Get token statistics for monitoring
   */
  async getTokenStats(): Promise<TokenStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalTokensIssued, activeRefreshTokens, blacklistedTokens, expiredTokens, recentTokens] =
      await Promise.all([
        // Total tokens issued (from audit logs)
        this.prisma.auditLog.count({
          where: { action: 'token_pair_generated' },
        }),

        // Active refresh tokens
        this.prisma.refreshToken.count({
          where: { expiresAt: { gt: now } },
        }),

        // Blacklisted tokens
        this.prisma.tokenBlacklist.count(),

        // Expired refresh tokens
        this.prisma.refreshToken.count({
          where: { expiresAt: { lte: now } },
        }),

        // Recent tokens (last 24 hours)
        this.prisma.refreshToken.count({
          where: {
            createdAt: { gte: oneDayAgo },
            expiresAt: { gt: now },
          },
        }),
      ]);

    return {
      totalTokensIssued,
      activeRefreshTokens,
      blacklistedTokens,
      expiredTokens,
      recentTokens,
    };
  }

  /**
   * Update token metrics for monitoring
   */
  async updateTokenMetrics(): Promise<void> {
    try {
      const now = new Date();

      // Update active refresh tokens by tier
      const tiers = ['free', 'premium', 'enterprise'];

      for (const tier of tiers) {
        const count = await this.prisma.refreshToken.count({
          where: {
            expiresAt: { gt: now },
            user: { tier },
          },
        });

        this.activeRefreshTokensGauge.set({ user_tier: tier }, count);
      }

      // Update blacklisted tokens count
      const blacklistedCount = await this.prisma.tokenBlacklist.count();
      this.blacklistedTokensGauge.set(blacklistedCount);
    } catch (error) {
      this.logger.error('Failed to update token metrics', {
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

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    jti: string,
    deviceInfo?: { deviceId?: string; ipAddress?: string },
  ): Promise<void> {
    try {
      const decoded = this.jwtService.decode(refreshToken);
      if (!decoded || !decoded.exp) {
        throw new Error('Invalid token format');
      }

      const tokenHash = await bcrypt.hash(refreshToken, 12);

      await this.prisma.refreshToken.create({
        data: {
          id: jti,
          userId,
          tokenHash,
          expiresAt: new Date(decoded.exp * 1000),
          deviceId: deviceInfo?.deviceId,
          ipAddress: deviceInfo?.ipAddress,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          usageCount: 0,
        },
      });
    } catch (error) {
      this.logger.error('Failed to store refresh token', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId,
      });
      throw new InternalServerErrorException('Failed to create session');
    }
  }

  private async cleanupOldRefreshTokens(userId: string): Promise<void> {
    // Keep only the most recent refresh tokens per user
    const oldTokens = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: this.MAX_REFRESH_TOKENS_PER_USER,
    });

    if (oldTokens.length > 0) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          id: { in: oldTokens.map(token => token.id) },
        },
      });
    }
  }

  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklistEntry = await this.prisma.tokenBlacklist.findUnique({
      where: { jti },
    });

    return !!blacklistEntry;
  }

  private getUserPermissions(user: User): string[] {
    // Define permissions based on user tier and role
    const basePermissions = ['read:profile', 'write:profile'];

    switch (user.tier) {
      case 'premium':
        return [...basePermissions, 'read:analytics', 'write:projects'];
      case 'enterprise':
        return [...basePermissions, 'read:analytics', 'write:projects', 'admin:users'];
      default:
        return basePermissions;
    }
  }

  private async logTokenEvent(
    userId: string,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resource: 'jwt_token',
          details,
          ipAddress: details.deviceInfo?.ipAddress,
          success: true,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to log token event', {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        userId,
        action,
      });
    }
  }
}
