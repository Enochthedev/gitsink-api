import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtTokenService } from '../jwt-token.service';
import { EnqueueService } from '../../queues/email/enqueue/enqueue.service';
import { MetricsService } from '../../metrics/metrics.service';
import { StandardizedLoggerService } from '../../common/services/standardized-logger.service';
import {
  ClientInfo,
  SignupData,
  SignupResult,
  checkUserConflicts,
  createUserData,
  createUserResponse,
  findUserByApiKey,
  generateMagicLinkToken,
  generatePasswordResetToken,
  generateUserCredentials,
  getPasswordStrengthMetric,
  validatePasswordResetToken,
  validateRefreshTokenPayload,
  validateRefreshTokenUsage,
  validateSigninData,
  validateSignupData,
  validateUserCredentials,
} from '../utils/auth-operations.utils';
import {
  AuthenticationError,
  ConflictError,
  DatabaseError,
  ValidationError,
} from '../../common/utils/error.utils';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../common/utils/code-cleanup.utils';
import { AUTH_CONSTANTS } from '../../common/constants';

/**
 * Refactored AuthService with improved error handling, logging, and separation of concerns
 */
@Injectable()
export class RefactoredAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly enqueue: EnqueueService,
    private readonly metricsService: MetricsService,
    private readonly logger: StandardizedLoggerService,
  ) {
    this.logger.setContext(RefactoredAuthService.name);
  }

  /**
   * Refactored signup method with improved validation and error handling
   */
  async signup(signupData: SignupData, clientInfo?: ClientInfo): Promise<SignupResult> {
    const operationStart = Date.now();

    try {
      // Validate input data
      validateSignupData(signupData);

      // Track password strength for metrics
      const passwordStrength = getPasswordStrengthMetric(signupData.password);
      // TODO: Implement recordPasswordStrength method in MetricsService
      // this.metricsService.recordPasswordStrength(passwordStrength);

      // Check for existing user conflicts
      await checkUserConflicts(
        signupData.email,
        email => this.getUserByEmail(email),
        signupData.username,
        signupData.username ? username => this.getUserByUsername(username) : undefined,
      );

      // Generate secure credentials
      const credentials = await generateUserCredentials(signupData.password);

      // Create user in database
      const userData = createUserData(
        signupData,
        credentials.hashedApiKey,
        credentials.hashedPassword,
      );
      const user = await this.createUser(userData);

      // Queue welcome email (non-blocking)
      this.queueWelcomeEmail(signupData.email);

      // Log successful signup
      this.logger.logAuthOperation('signup', 'success', {
        userId: user.id,
        operation: 'signup',
        duration: Date.now() - operationStart,
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
        metadata: {
          hasPassword: !!signupData.password,
          hasUsername: !!signupData.username,
          passwordStrength,
        },
      });

      return { user, apiKey: credentials.apiKey };
    } catch (error) {
      this.logger.logAuthOperation('signup', 'failure', {
        operation: 'signup',
        duration: Date.now() - operationStart,
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
        metadata: {
          email: signupData.email,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Re-throw known errors, wrap unknown ones
      if (
        error instanceof ValidationError ||
        error instanceof ConflictError ||
        error instanceof DatabaseError
      ) {
        throw error;
      }

      throw new DatabaseError(ERROR_MESSAGES.INTERNAL_ERROR, 'SIGNUP_FAILED', {
        email: signupData.email,
      });
    }
  }

  /**
   * Refactored signin method with improved validation and security
   */
  async signin(
    email: string,
    password: string,
    deviceInfo?: { deviceId?: string; ipAddress?: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    user: {
      id: string;
      email: string;
      username: string | null;
      tier: string;
    };
  }> {
    const operationStart = Date.now();

    try {
      // Validate input data
      validateSigninData(email, password);

      // Get user and validate credentials
      const user = await this.getUserByEmail(email);
      const validatedUser = await validateUserCredentials(user, password, operationStart);

      // Update last login
      await this.updateLastLogin(validatedUser.id);

      // Generate token pair
      const tokenPair = await this.jwtTokenService.generateTokenPair(validatedUser, deviceInfo);

      // Log successful signin
      this.logger.logAuthOperation('signin', 'success', {
        userId: validatedUser.id,
        operation: 'signin',
        duration: Date.now() - operationStart,
        ip: deviceInfo?.ipAddress,
        metadata: {
          deviceId: deviceInfo?.deviceId,
        },
      });

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
        user: createUserResponse(validatedUser),
      };
    } catch (error) {
      this.logger.logAuthOperation('signin', 'failure', {
        operation: 'signin',
        duration: Date.now() - operationStart,
        ip: deviceInfo?.ipAddress,
        metadata: {
          email,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Re-throw authentication errors, wrap others
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  }

  /**
   * Refactored API key validation with improved security and logging
   */
  async validateApiKey(apiKey: string, clientInfo?: ClientInfo): Promise<User | null> {
    const operationStart = Date.now();

    try {
      // Basic format validation
      if (!apiKey || apiKey.length < AUTH_CONSTANTS.API_KEY_LENGTH) {
        this.logger.logSecurityEvent('invalid_api_key_format', 'low', {
          operation: 'validate_api_key',
          ip: clientInfo?.ip,
          userAgent: clientInfo?.userAgent,
          metadata: { keyLength: apiKey?.length || 0 },
        });
        return null;
      }

      // Get all users with API keys (this could be optimized with indexing)
      const users = await this.getUsersWithApiKeys();

      // Find user with matching API key
      const user = await findUserByApiKey(users, apiKey);

      if (user) {
        // Update last login time
        await this.updateLastLogin(user.id);

        this.logger.logAuthOperation('api_key_validation', 'success', {
          userId: user.id,
          operation: 'validate_api_key',
          duration: Date.now() - operationStart,
          ip: clientInfo?.ip,
          userAgent: clientInfo?.userAgent,
        });

        return user;
      }

      // Log failed API key attempt for security monitoring
      this.logger.logSecurityEvent('invalid_api_key_attempt', 'medium', {
        operation: 'validate_api_key',
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
        metadata: {
          keyPrefix: apiKey.substring(0, 8) + '...',
        },
      });

      return null;
    } catch (error) {
      this.logger.logAuthOperation('api_key_validation', 'failure', {
        operation: 'validate_api_key',
        duration: Date.now() - operationStart,
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return null;
    }
  }

  /**
   * Refactored password reset request with improved security
   */
  async requestPasswordReset(email: string, clientInfo?: ClientInfo): Promise<void> {
    const operationStart = Date.now();

    try {
      const user = await this.getUserByEmail(email);

      if (!user) {
        // Still simulate timing to prevent email enumeration
        await this.simulatePasswordResetTiming();

        this.logger.logSecurityEvent('password_reset_nonexistent_email', 'low', {
          operation: 'password_reset_request',
          ip: clientInfo?.ip,
          userAgent: clientInfo?.userAgent,
          metadata: { email },
        });

        return; // Don't reveal that email doesn't exist
      }

      // Generate secure reset token
      const { token, hashedToken, expiresAt } = await generatePasswordResetToken();

      // Store token in database
      await this.storePasswordResetToken(user.id, hashedToken, expiresAt);

      // Send reset email
      await this.sendPasswordResetEmail(email, token);

      this.logger.logAuthOperation('password_reset_request', 'success', {
        userId: user.id,
        operation: 'password_reset_request',
        duration: Date.now() - operationStart,
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
      });
    } catch (error) {
      this.logger.logAuthOperation('password_reset_request', 'failure', {
        operation: 'password_reset_request',
        duration: Date.now() - operationStart,
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
        metadata: {
          email,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw new DatabaseError(ERROR_MESSAGES.INTERNAL_ERROR, 'PASSWORD_RESET_REQUEST_FAILED', {
        email,
      });
    }
  }

  /**
   * Refactored refresh token validation with comprehensive security checks
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const operationStart = Date.now();

    try {
      // Verify JWT structure and signature
      const payload = await this.jwtService.verifyAsync(refreshToken);

      // Validate payload structure
      const validatedPayload = validateRefreshTokenPayload(payload);

      // Get stored token from database
      const storedToken = await this.getStoredRefreshToken(
        validatedPayload.jti,
        validatedPayload.sub,
      );

      if (!storedToken) {
        throw new AuthenticationError(ERROR_MESSAGES.INVALID_TOKEN);
      }

      // Validate token usage patterns
      validateRefreshTokenUsage(storedToken, validatedPayload.jti);

      // Validate token hash
      const isValidToken = await this.validateTokenHash(refreshToken, storedToken.tokenHash);
      if (!isValidToken) {
        // Revoke all tokens for this user as a security measure
        await this.revokeAllUserRefreshTokens(validatedPayload.sub, 'security_hash_mismatch');
        throw new AuthenticationError(ERROR_MESSAGES.INVALID_TOKEN);
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken(storedToken.user);

      // Update token usage
      await this.updateTokenUsage(storedToken.id);

      this.logger.logAuthOperation('refresh_token', 'success', {
        userId: storedToken.user.id,
        operation: 'refresh_token',
        duration: Date.now() - operationStart,
        metadata: {
          jti: validatedPayload.jti,
          usageCount: storedToken.usageCount + 1,
        },
      });

      return {
        accessToken: newAccessToken,
        expiresIn: AUTH_CONSTANTS.JWT_ACCESS_TOKEN_EXPIRY,
      };
    } catch (error) {
      this.logger.logAuthOperation('refresh_token', 'failure', {
        operation: 'refresh_token',
        duration: Date.now() - operationStart,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(ERROR_MESSAGES.INVALID_TOKEN);
    }
  }

  // Private helper methods for better separation of concerns

  private async createUser(userData: any): Promise<User> {
    try {
      return await this.prisma.user.create({ data: userData });
    } catch (error) {
      throw new DatabaseError(ERROR_MESSAGES.INTERNAL_ERROR, 'USER_CREATION_FAILED', {
        email: userData.email,
      });
    }
  }

  private async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  private async getUserByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  private async getUsersWithApiKeys(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { apiKey: { not: null } },
    });
  }

  private async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private async queueWelcomeEmail(email: string): Promise<void> {
    try {
      await this.enqueue.enqueueSignupEmail(email);
      this.logger.info('Welcome email queued', { email });
    } catch (error) {
      this.logger.error('Failed to queue welcome email', error, { email });
      // Don't fail signup if email fails
    }
  }

  private async simulatePasswordResetTiming(): Promise<void> {
    // Simulate the same timing as a real password reset to prevent enumeration
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async storePasswordResetToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: hashedToken,
        resetTokenExpires: expiresAt,
      },
    });
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    await this.enqueue.enqueueForgotPassword(email, token);
  }

  private async getStoredRefreshToken(jti: string, userId: string) {
    return this.prisma.refreshToken.findFirst({
      where: {
        id: jti,
        userId,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            tier: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  private async validateTokenHash(token: string, storedHash: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(token, storedHash);
  }

  private async updateTokenUsage(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });
  }

  private async revokeAllUserRefreshTokens(userId: string, reason: string): Promise<void> {
    try {
      const deleteResult = await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      this.logger.logSecurityEvent('all_refresh_tokens_revoked', 'high', {
        userId,
        metadata: {
          reason,
          count: deleteResult.count,
        },
      });
    } catch (error) {
      this.logger.error('Failed to revoke all refresh tokens', error, { userId, reason });
    }
  }

  private generateAccessToken(user: any): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tier: user.tier,
        type: 'access',
      },
      { expiresIn: AUTH_CONSTANTS.JWT_ACCESS_TOKEN_EXPIRY },
    );
  }
}
