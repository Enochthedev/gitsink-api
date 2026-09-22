import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnqueueService } from '../queues/email/enqueue/enqueue.service';
import { MetricsService } from '../metrics/metrics.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MagicLinkToken, User } from '@prisma/client';
import { Counter, Histogram } from 'prom-client';

export interface MagicLinkValidationResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  timestamp: Date;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  // Metrics for monitoring magic link operations
  private readonly magicLinkOperationsCounter: Counter<string>;
  private readonly magicLinkOperationDuration: Histogram<string>;
  private readonly magicLinkFailuresCounter: Counter<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly enqueueService: EnqueueService,
    private readonly metricsService: MetricsService,
  ) {
    // Initialize metrics
    this.magicLinkOperationsCounter = this.metricsService.createCustomCounter(
      'magic_link_operations_total',
      'Total number of magic link operations',
      ['operation', 'status'],
    );

    this.magicLinkOperationDuration = this.metricsService.createCustomHistogram(
      'magic_link_operation_duration_seconds',
      'Duration of magic link operations',
      ['operation'],
      [0.1, 0.5, 1, 2, 5, 10],
    );

    this.magicLinkFailuresCounter = this.metricsService.createCustomCounter(
      'magic_link_failures_total',
      'Total number of magic link failures',
      ['operation', 'reason'],
    );
  }

  /**
   * Generate and send a magic link for authentication
   */
  async sendMagicLink(email: string, clientInfo?: ClientInfo): Promise<void> {
    const operationStart = Date.now();
    const operation = 'send_magic_link';

    try {
      // Validate email format
      if (!this.isValidEmail(email)) {
        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'invalid_email',
        });
        throw new BadRequestException('Invalid email format');
      }

      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Still simulate timing to prevent email enumeration
        await this.simulateHash();
        await new Promise(resolve => setTimeout(resolve, 100));

        this.logger.warn(`Magic link requested for non-existent email: ${email}`, {
          clientInfo,
        });

        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'user_not_found',
        });

        // Don't reveal that user doesn't exist - return success
        return;
      }

      // Clean up any existing expired tokens for this email
      await this.cleanupExpiredTokens(email);

      // Check rate limiting - max 3 magic links per 15 minutes per email
      const recentTokens = await this.prisma.magicLinkToken.count({
        where: {
          email,
          createdAt: {
            gte: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
          },
        },
      });

      if (recentTokens >= 3) {
        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'rate_limited',
        });
        this.logger.warn(`Magic link rate limit exceeded for email: ${email}`, {
          clientInfo,
          recentTokens,
        });

        // Don't reveal rate limiting to prevent abuse
        return;
      }

      // Generate secure token
      const token = this.generateSecureToken();
      const tokenHash = await bcrypt.hash(token, 12);

      // Store token in database with expiration (15 minutes)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.magicLinkToken.create({
        data: {
          tokenHash,
          email: user.email,
          expiresAt,
        },
      });

      // Queue magic link email
      await this.enqueueService.enqueueMagicLinkSignInEmail(email, token);

      // Log successful magic link generation
      this.logger.log(`Magic link generated and sent to ${email}`, {
        userId: user.id,
        expiresAt,
        clientInfo,
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'success' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'failure' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);

      this.logger.error(`Failed to send magic link to ${email}`, {
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error),
        clientInfo,
      });

      // Re-throw the error for proper error handling
      throw error;
    }
  }

  /**
   * Validate a magic link token and authenticate the user
   */
  async validateMagicLink(
    token: string,
    clientInfo?: ClientInfo,
  ): Promise<MagicLinkValidationResult> {
    const operationStart = Date.now();
    const operation = 'validate_magic_link';

    try {
      // Validate token format
      if (!token || token.length !== 64) {
        // 32 bytes = 64 hex chars
        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'invalid_format',
        });
        throw new UnauthorizedException('Invalid magic link token');
      }

      // Find all non-expired tokens and check against provided token
      const tokens = await this.prisma.magicLinkToken.findMany({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      let validToken: MagicLinkToken | null = null;

      // Check each token hash (constant time comparison)
      for (const storedToken of tokens) {
        if (await bcrypt.compare(token, storedToken.tokenHash)) {
          validToken = storedToken;
          break;
        }
      }

      if (!validToken) {
        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'invalid_token',
        });
        this.logger.warn('Invalid or expired magic link token attempted', {
          tokenPrefix: token.substring(0, 8) + '...',
          clientInfo,
        });
        throw new UnauthorizedException('Invalid or expired magic link');
      }

      // Get the user associated with this token
      const user = await this.prisma.user.findUnique({
        where: { email: validToken.email },
      });

      if (!user) {
        this.magicLinkFailuresCounter.inc({
          operation,
          reason: 'user_not_found',
        });
        this.logger.error(`User not found for valid magic link token: ${validToken.email}`);
        throw new UnauthorizedException('User not found');
      }

      // Generate JWT tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token
      await this.storeRefreshToken(user.id, refreshToken);

      // Update user's last login time
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Clean up the used magic link token
      await this.prisma.magicLinkToken.delete({
        where: { id: validToken.id },
      });

      // Clean up any other expired tokens for this email
      await this.cleanupExpiredTokens(validToken.email);

      // Log successful authentication
      this.logger.log(`Magic link authentication successful for user ${user.id}`, {
        userId: user.id,
        email: user.email,
        clientInfo,
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'success' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);

      return {
        user,
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'failure' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);

      // Re-throw the error for proper error handling
      throw error;
    }
  }

  /**
   * Clean up expired magic link tokens for a specific email or all emails
   * Fixed: Enhanced cleanup with better error handling and race condition prevention
   */
  async cleanupExpiredTokens(email?: string, bufferMinutes: number = 1): Promise<number> {
    const operation = 'cleanup_expired_tokens';
    const operationStart = Date.now();

    try {
      // Add buffer time to prevent race conditions during validation
      const cutoffTime = new Date(Date.now() - bufferMinutes * 60 * 1000);

      const whereClause = {
        expiresAt: {
          lt: cutoffTime,
        },
        ...(email && { email }),
      };

      // Use transaction to ensure consistency
      const result = await this.prisma.$transaction(async tx => {
        // First, get the tokens to be deleted for logging
        const tokensToDelete = await tx.magicLinkToken.findMany({
          where: whereClause,
          select: { id: true, email: true, expiresAt: true, createdAt: true },
        });

        // Delete the expired tokens
        const deleteResult = await tx.magicLinkToken.deleteMany({
          where: whereClause,
        });

        // Log details for audit trail
        if (tokensToDelete.length > 0) {
          this.logger.debug('Detailed cleanup information', {
            deletedTokens: tokensToDelete.map(token => ({
              id: token.id,
              email: token.email,
              expiredAt: token.expiresAt,
              ageInHours: Math.round((Date.now() - token.createdAt.getTime()) / (1000 * 60 * 60)),
            })),
          });
        }

        return deleteResult;
      });

      this.logger.debug(`Cleaned up ${result.count} expired magic link tokens`, {
        email,
        count: result.count,
        bufferMinutes,
        cutoffTime,
      });

      // Record metrics
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'success' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);

      return result.count;
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.magicLinkOperationsCounter.inc({ operation, status: 'failure' });
      this.magicLinkOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('Failed to cleanup expired magic link tokens', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        email,
        bufferMinutes,
      });

      throw new InternalServerErrorException('Failed to cleanup expired tokens');
    }
  }

  /**
   * Get magic link statistics for monitoring
   */
  async getMagicLinkStats(): Promise<{
    totalActive: number;
    totalExpired: number;
    recentlyCreated: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [totalActive, totalExpired, recentlyCreated] = await Promise.all([
      this.prisma.magicLinkToken.count({
        where: { expiresAt: { gt: now } },
      }),
      this.prisma.magicLinkToken.count({
        where: { expiresAt: { lte: now } },
      }),
      this.prisma.magicLinkToken.count({
        where: {
          createdAt: { gte: oneHourAgo },
          expiresAt: { gt: now },
        },
      }),
    ]);

    return {
      totalActive,
      totalExpired,
      recentlyCreated,
    };
  }

  // Private helper methods

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      type: 'access',
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  private generateRefreshToken(user: User): string {
    const payload = {
      sub: user.id,
      type: 'refresh',
      jti: randomBytes(16).toString('hex'),
    };
    return this.jwtService.sign(payload, { expiresIn: '7d' });
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    try {
      const decoded: any = this.jwtService.decode(refreshToken);
      if (!decoded || !decoded.jti || !decoded.exp) {
        throw new Error('Invalid token format');
      }

      const tokenHash = await bcrypt.hash(refreshToken, 12);

      await this.prisma.refreshToken.create({
        data: {
          id: decoded.jti,
          userId,
          tokenHash,
          expiresAt: new Date(decoded.exp * 1000),
        },
      });
    } catch (error) {
      this.logger.error('Failed to store refresh token', error);
      throw new InternalServerErrorException('Failed to create session');
    }
  }

  private async simulateHash(): Promise<void> {
    await bcrypt.hash('dummy', 12);
  }
}
