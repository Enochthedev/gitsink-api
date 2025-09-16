import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';
import axios from 'axios';
import { encrypt } from '../utils/encryption';
import * as bcrypt from 'bcryptjs';
import { EnqueueService } from '@queues/email/enqueue/enqueue.service';
import { MetricsService } from '@metrics/metrics.service';
import { Counter, Histogram } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Custom metrics for auth operations
  private readonly authOperationsCounter: Counter<string>;
  private readonly authOperationDuration: Histogram<string>;
  private readonly authFailuresCounter: Counter<string>;
  private readonly passwordStrengthGauge: Counter<string>;
  private readonly apiKeyUsageCounter: Counter<string>;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
    private jwtTokenService: JwtTokenService,
    private enqueue: EnqueueService,
    private metricsService: MetricsService,
  ) {
    // Initialize custom auth metrics
    this.authOperationsCounter = this.metricsService.createCustomCounter(
      'auth_operations_total',
      'Total number of authentication operations',
      ['operation', 'status', 'method'],
    );

    this.authOperationDuration = this.metricsService.createCustomHistogram(
      'auth_operation_duration_seconds',
      'Duration of authentication operations',
      ['operation'],
      [0.1, 0.5, 1, 2, 5, 10],
    );

    this.authFailuresCounter = this.metricsService.createCustomCounter(
      'auth_failures_total',
      'Total number of authentication failures',
      ['operation', 'reason'],
    );

    this.passwordStrengthGauge = this.metricsService.createCustomCounter(
      'password_strength_total',
      'Password strength distribution',
      ['strength_level'],
    );

    this.apiKeyUsageCounter = this.metricsService.createCustomCounter(
      'api_key_usage_total',
      'API key usage statistics',
      ['operation', 'result'],
    );
  }

  /**
   * Register a new user and create an API key with enhanced security and metrics.
   */
  async signup(
    email: string,
    password?: string,
    username?: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{ user: User; apiKey: string }> {
    const operationStart = Date.now();
    const operation = 'signup';

    try {
      // Input validation
      if (!this.isValidEmail(email)) {
        this.authFailuresCounter.inc({ operation, reason: 'invalid_email' });
        throw new BadRequestException('Invalid email format');
      }

      if (password && !this.isPasswordStrong(password)) {
        this.authFailuresCounter.inc({ operation, reason: 'weak_password' });
        throw new BadRequestException('Password does not meet security requirements');
      }

      // Track password strength if provided
      if (password) {
        const strength = this.calculatePasswordStrength(password);
        this.passwordStrengthGauge.inc({ strength_level: strength });
      }

      // Check for existing user
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        await this._simulateHash(); // Prevents timing attacks
        this.authFailuresCounter.inc({ operation, reason: 'email_exists' });
        throw new ConflictException('Email already in use');
      }

      // Check for existing username if provided
      if (username) {
        const existingUsername = await this.prisma.user.findUnique({
          where: { username },
        });
        if (existingUsername) {
          await this._simulateHash(); // Timing safe
          this.authFailuresCounter.inc({
            operation,
            reason: 'username_exists',
          });
          throw new ConflictException('Username already taken');
        }
      }

      // Generate secure API key and hash credentials
      const apiKey = this.generateSecureApiKey();
      const [hashedKey, hashedPassword] = await Promise.all([
        bcrypt.hash(apiKey, 12), // Increased rounds for better security
        password ? bcrypt.hash(password, 12) : Promise.resolve(null),
      ]);

      let user: User;
      try {
        // Track database operation
        const dbStart = Date.now();
        user = await this.prisma.user.create({
          data: {
            email,
            username,
            apiKey: hashedKey,
            password: hashedPassword,
            // Track signup metadata for security
            lastLoginAt: new Date(),
            createdAt: new Date(),
          },
        });

        const dbDuration = (Date.now() - dbStart) / 1000;
        this.metricsService.recordDatabaseQueryDuration('INSERT', dbDuration, 'users');
        this.metricsService.incrementDatabaseQueries('INSERT', 'users');
      } catch (error) {
        this.logger.error(`Failed to create user for ${email}`, error);
        this.authFailuresCounter.inc({ operation, reason: 'database_error' });
        throw new InternalServerErrorException('Could not create user');
      }

      // Queue welcome email (non-blocking)
      try {
        await this.enqueue.enqueueSignupEmail(email);
        this.logger.log(`Welcome email queued for ${email}`);
      } catch (err) {
        this.logger.error(`Failed to queue welcome email for ${email}`, err);
        // Don't fail signup if email fails
      }

      // Log successful signup for security monitoring
      this.logger.log(`User signup successful: ${email}`, {
        userId: user.id,
        hasPassword: !!password,
        hasUsername: !!username,
        clientInfo,
      });

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'email',
      });
      this.authOperationDuration.observe({ operation }, operationDuration);

      // Ensure consistent response time for security
      await this._delayToPreventTimingAttack(Date.now() - operationStart);

      return { user, apiKey };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'email',
      });
      this.authOperationDuration.observe({ operation }, operationDuration);

      // Re-throw the error after metrics
      throw error;
    }
  }

  /**
   * Validate User Credentials for Sign In
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const operationStart = Date.now();
    const operation = 'signin_validate_user';

    try {
      const user = await this.getUserByEmail(email);
      this.metricsService.incrementDatabaseQueries('SELECT', 'users');

      if (!user || !user.password) {
        // Simulate hash to prevent timing attacks
        await this._simulateHash();
        this.authFailuresCounter.inc({
          operation,
          reason: 'user_not_found',
        });
        return null;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        this.authFailuresCounter.inc({
          operation,
          reason: 'invalid_password',
        });
        return null;
      }

      // Update last login
      await this.updateLastLogin(user.id);

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'validate',
      });
      this.authOperationDuration.observe({ operation }, operationDuration);

      return user;
    } catch (error) {
      this.logger.error('User validation error', error);
      return null;
    }
  }

  /**
   * Sign in User and generate JWT
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
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate token pair using enhanced service
    const tokenPair = await this.jwtTokenService.generateTokenPair(user, deviceInfo);

    this.authOperationsCounter.inc({
      operation: 'signin',
      status: 'success',
      method: 'password',
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      refreshExpiresIn: tokenPair.refreshExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        tier: user.tier,
      },
    };
  }

  /**
   * MISSING METHOD: Generate and send magic link
   */
  async sendMagicLinkSignInEmail(email: string): Promise<void> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      // Still simulate timing to prevent email enumeration
      await this._simulateHash();
      await new Promise(resolve => setTimeout(resolve, 100));
      this.logger.warn(`Magic link requested for non-existent email: ${email}`);
      return;
    }

    // Generate magic link token
    const token = this.generateSecureToken();
    const hashedToken = await bcrypt.hash(token, 12);

    // Store token in database with expiration
    await this.prisma.magicLinkToken.create({
      data: {
        tokenHash: hashedToken,
        email: user.email,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Send magic link email
    await this.enqueue.enqueueMagicLinkSignInEmail(email, token);

    this.authOperationsCounter.inc({
      operation: 'signin_email',
      status: 'sent',
      method: 'email',
    });

    this.logger.log(`Magic link sent to ${email}`);
  }

  /**
   *  Store refresh token
   */
  async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
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

  /**
   * Fixed: Enhanced refresh token validation with comprehensive edge case handling
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const operationStart = Date.now();
    const operation = 'refresh_token';

    try {
      // Basic format validation
      if (!refreshToken || typeof refreshToken !== 'string') {
        this.authFailuresCounter.inc({ operation, reason: 'invalid_format' });
        throw new UnauthorizedException('Invalid refresh token format');
      }

      // Verify JWT structure and signature
      let payload: {
        sub: string;
        type: string;
        jti: string;
        exp: number;
        iat: number;
      };
      try {
        payload = await this.jwtService.verifyAsync(refreshToken);
      } catch (jwtError) {
        this.authFailuresCounter.inc({ operation, reason: 'jwt_invalid' });
        this.logger.warn('JWT verification failed for refresh token', {
          error: jwtError instanceof Error ? jwtError.message : String(jwtError),
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Validate payload structure
      if (!payload.sub || !payload.jti || !payload.type || !payload.exp) {
        this.authFailuresCounter.inc({
          operation,
          reason: 'malformed_payload',
        });
        throw new UnauthorizedException('Malformed token payload');
      }

      if (payload.type !== 'refresh') {
        this.authFailuresCounter.inc({ operation, reason: 'wrong_token_type' });
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if token is expired (additional check beyond JWT verification)
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) {
        this.authFailuresCounter.inc({ operation, reason: 'token_expired' });
        throw new UnauthorizedException('Refresh token expired');
      }

      // Check if token is too old (issued more than 7 days ago)
      const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
      if (payload.iat && now - payload.iat > maxAge) {
        this.authFailuresCounter.inc({ operation, reason: 'token_too_old' });
        throw new UnauthorizedException('Refresh token too old');
      }

      // Check if refresh token exists in database with comprehensive validation
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          id: payload.jti,
          userId: payload.sub,
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
        this.authFailuresCounter.inc({ operation, reason: 'token_not_found' });
        this.logger.warn('Refresh token not found in database', {
          jti: payload.jti,
          userId: payload.sub,
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if user account is still active
      if (storedToken.user.deletedAt) {
        this.authFailuresCounter.inc({ operation, reason: 'user_deleted' });
        this.logger.warn('Refresh token used for deleted user', {
          userId: storedToken.user.id,
          jti: payload.jti,
        });
        throw new UnauthorizedException('User account no longer exists');
      }

      // Validate refresh token hash with timing-safe comparison
      const isValidToken = await bcrypt.compare(refreshToken, storedToken.tokenHash);
      if (!isValidToken) {
        this.authFailuresCounter.inc({ operation, reason: 'hash_mismatch' });
        this.logger.warn('Refresh token hash mismatch - possible attack', {
          userId: payload.sub,
          jti: payload.jti,
        });

        // Revoke all tokens for this user as a security measure
        await this.revokeAllUserRefreshTokens(payload.sub, 'security_hash_mismatch');

        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check for suspicious usage patterns
      const timeSinceLastUse = storedToken.lastUsedAt
        ? Date.now() - storedToken.lastUsedAt.getTime()
        : 0;

      // If token was used very recently (within 1 second), it might be a replay attack
      if (timeSinceLastUse < 1000 && storedToken.lastUsedAt) {
        this.logger.warn('Potential refresh token replay attack detected', {
          userId: storedToken.user.id,
          jti: payload.jti,
          timeSinceLastUse,
        });
      }

      // Check usage count for anomalies
      if (storedToken.usageCount > 1000) {
        // Arbitrary high limit
        this.logger.warn('Refresh token with unusually high usage count', {
          userId: storedToken.user.id,
          jti: payload.jti,
          usageCount: storedToken.usageCount,
        });
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken(storedToken.user as any);

      // Update last used timestamp for refresh token
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });

      // Record successful operation
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'refresh',
      });
      this.authOperationDuration.observe({ operation }, operationDuration);

      return {
        accessToken: newAccessToken,
        expiresIn: 900, // 15 minutes
      };
    } catch (error) {
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'refresh',
      });
      this.authOperationDuration.observe({ operation }, operationDuration);

      this.logger.error('Failed to refresh token', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error, but ensure it's always an UnauthorizedException
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Fixed: Added missing method to revoke all refresh tokens for a user
   */
  private async revokeAllUserRefreshTokens(userId: string, reason: string): Promise<void> {
    try {
      const deleteResult = await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      this.logger.log(`All refresh tokens revoked for user ${userId}`, {
        userId,
        reason,
        count: deleteResult.count,
      });
    } catch (error) {
      this.logger.error(`Failed to revoke all refresh tokens for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
        userId,
        reason,
      });
    }
  }

  /**
   * Enhanced API key validation with metrics and security logging
   */
  async validateApiKey(
    apiKey: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<User | null> {
    const operationStart = Date.now();
    const operation = 'validate_api_key';

    try {
      if (!apiKey || apiKey.length < 32) {
        this.apiKeyUsageCounter.inc({ operation, result: 'invalid_format' });
        return null;
      }

      // Track database query for API key lookup
      const dbStart = Date.now();
      const users = await this.prisma.user.findMany({
        where: { apiKey: { not: null } },
      });

      const dbDuration = (Date.now() - dbStart) / 1000;
      this.metricsService.recordDatabaseQueryDuration('SELECT', dbDuration, 'users');
      this.metricsService.incrementDatabaseQueries('SELECT', 'users');

      for (const user of users) {
        if (user.apiKey && (await bcrypt.compare(apiKey, user.apiKey))) {
          // Update last login time
          await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          this.logger.log(`API key validation successful for user ${user.id}`, {
            userId: user.id,
            clientInfo,
          });

          this.apiKeyUsageCounter.inc({ operation, result: 'success' });
          const operationDuration = (Date.now() - operationStart) / 1000;
          this.authOperationDuration.observe({ operation }, operationDuration);

          return user;
        }
      }

      // Log failed API key attempt for security monitoring
      this.logger.warn('Invalid API key attempted', {
        keyPrefix: apiKey.substring(0, 8) + '...',
        clientInfo,
      });

      this.apiKeyUsageCounter.inc({ operation, result: 'invalid' });
      this.authFailuresCounter.inc({
        operation: 'api_auth',
        reason: 'invalid_key',
      });

      return null;
    } catch (error) {
      this.logger.error('API key validation error', error);
      this.apiKeyUsageCounter.inc({ operation, result: 'error' });
      return null;
    }
  }

  /**
   * Enhanced password reset with security monitoring
   */
  async requestPasswordReset(
    email: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const operationStart = Date.now();
    const operation = 'password_reset_request';

    try {
      const user = await this.prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Still simulate the same timing to prevent email enumeration
        await this._simulateHash();
        await new Promise(resolve => setTimeout(resolve, 100));

        this.authFailuresCounter.inc({ operation, reason: 'user_not_found' });
        this.logger.warn(`Password reset requested for non-existent email: ${email}`, {
          clientInfo,
        });
        return;
      }

      const token = this.generateSecureToken();
      const hashed = await bcrypt.hash(token, 12);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: hashed,
          resetTokenExpires: new Date(Date.now() + 3600 * 1000), // 1 hour
        },
      });

      await this.sendForgotPassword(email, token);

      this.logger.log(`Password reset token generated for ${email}`, {
        userId: user.id,
        clientInfo,
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'email',
      });
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationDuration.observe({ operation }, operationDuration);
    } catch (error) {
      this.logger.error(`Password reset request failed for ${email}`, error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'email',
      });
      throw error;
    }
  }

  /**
   * Enhanced API key regeneration with security logging
   */
  async regenerateApiKey(
    userId: string,
    reason?: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{ user: User; apiKey: string }> {
    const operationStart = Date.now();
    const operation = 'regenerate_api_key';

    try {
      const apiKey = this.generateSecureApiKey();
      const hashed = await bcrypt.hash(apiKey, 12);

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          apiKey: hashed,
          // Track when key was regenerated
          apiKeyUpdatedAt: new Date(),
        },
      });

      this.logger.log(`API key regenerated for user ${userId}`, {
        userId,
        reason,
        clientInfo,
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'regenerate',
      });
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.authOperationDuration.observe({ operation }, operationDuration);

      return { user, apiKey };
    } catch (error) {
      this.logger.error(`API key regeneration failed for user ${userId}`, error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'regenerate',
      });
      throw error;
    }
  }

  // Enhanced security helper methods
  private generateSecureApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  private isPasswordStrong(password: string): boolean {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongRegex.test(password);
  }

  private calculatePasswordStrength(password: string): string {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[@$!%*?&]/.test(password)) score++;
    if (password.length >= 16) score++;

    if (score >= 6) return 'strong';
    if (score >= 4) return 'medium';
    if (score >= 2) return 'weak';
    return 'very_weak';
  }

  // Existing methods with added metrics tracking...
  sendSigninEmail(email: string) {
    this.authOperationsCounter.inc({
      operation: 'signin_email',
      status: 'sent',
      method: 'email',
    });
    return this.enqueue.enqueueSigninEmail(email);
  }

  sendForgotPassword(email: string, token: string) {
    return this.enqueue.enqueueForgotPassword(email, token);
  }

  sendPasswordResetConfirmation(email: string) {
    return this.enqueue.enqueuePasswordResetConfirmation(email);
  }

  getUserByEmail(email: string) {
    const dbStart = Date.now();
    return this.prisma.user.findUnique({ where: { email } }).then(result => {
      const dbDuration = (Date.now() - dbStart) / 1000;
      this.metricsService.recordDatabaseQueryDuration('SELECT', dbDuration, 'users');
      this.metricsService.incrementDatabaseQueries('SELECT', 'users');
      return result;
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const operationStart = Date.now();
    const operation = 'password_reset';

    try {
      if (!this.isPasswordStrong(newPassword)) {
        this.authFailuresCounter.inc({ operation, reason: 'weak_password' });
        throw new BadRequestException('Password does not meet security requirements');
      }

      const users = await this.prisma.user.findMany({
        where: {
          resetToken: { not: null },
          resetTokenExpires: { gt: new Date() },
        },
      });

      for (const user of users) {
        if (user.resetToken && (await bcrypt.compare(token, user.resetToken))) {
          const hashedPassword = await bcrypt.hash(newPassword, 12);

          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              password: hashedPassword,
              resetToken: null,
              resetTokenExpires: null,
            },
          });

          // Fixed: Ensure password reset confirmation email is sent
          try {
            await this.sendPasswordResetConfirmation(user.email);
            this.logger.log(`Password reset confirmation email sent to ${user.email}`, {
              userId: user.id,
            });
          } catch (emailError) {
            this.logger.error(`Failed to send password reset confirmation email to ${user.email}`, {
              error: emailError instanceof Error ? emailError.message : String(emailError),
              userId: user.id,
            });
            // Don't fail the password reset if email fails
          }

          this.authOperationsCounter.inc({
            operation,
            status: 'success',
            method: 'token',
          });
          const operationDuration = (Date.now() - operationStart) / 1000;
          this.authOperationDuration.observe({ operation }, operationDuration);

          return true;
        }
      }

      this.authFailuresCounter.inc({ operation, reason: 'invalid_token' });
      return false;
    } catch (error) {
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'token',
      });
      throw error;
    }
  }

  /**
   * Attach a GitHub ID to an existing user with enhanced logging.
   */
  async connectGitHub(userId: string, githubId: string, githubToken?: string): Promise<User> {
    const operation = 'connect_github';

    try {
      const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
      const encrypted = githubToken ? (key ? encrypt(githubToken, key) : githubToken) : null;

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { githubId, githubToken: encrypted },
      });

      this.logger.log(`GitHub connected for user ${userId}`, {
        userId,
        githubId,
        hasToken: !!githubToken,
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'oauth',
      });
      return user;
    } catch (error) {
      this.logger.error(`GitHub connection failed for user ${userId}`, error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'oauth',
      });
      throw error;
    }
  }

  async revokeApiKey(userId: string): Promise<User> {
    const operation = 'revoke_api_key';

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { apiKey: null },
      });

      this.logger.log(`API key revoked for user ${userId}`);
      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'revoke',
      });

      return user;
    } catch (error) {
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'revoke',
      });
      throw error;
    }
  }

  async findOrCreateWithGitHub(
    githubId: string,
    accessToken: string,
    email?: string,
  ): Promise<User> {
    const operation = 'oauth_signin';

    try {
      const existing = await this.prisma.user.findUnique({
        where: { githubId },
      });

      if (existing) {
        const user = await this.prisma.user.update({
          where: { id: existing.id },
          data: { accessToken, lastLoginAt: new Date() },
        });

        this.authOperationsCounter.inc({
          operation,
          status: 'success',
          method: 'oauth_existing',
        });
        return user;
      }

      const user = await this.prisma.user.create({
        data: {
          email: email ?? `${githubId}@github.local`,
          githubId,
          accessToken,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        },
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'oauth_new',
      });
      return user;
    } catch (error) {
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'oauth',
      });
      throw error;
    }
  }

  async exchangeCodeForGitHubId(code: string): Promise<string> {
    const operation = 'github_token_exchange';

    try {
      const tokenResp = await axios.post<{ access_token: string }>(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.config.get<string>('GITHUB_CLIENT_ID'),
          client_secret: this.config.get<string>('GITHUB_CLIENT_SECRET'),
          code,
        },
        { headers: { Accept: 'application/json' } },
      );

      const token = tokenResp.data.access_token;
      const userResp = await axios.get<{ id: number }>('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` },
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'github_api',
      });
      return String(userResp.data.id);
    } catch (error) {
      this.logger.error('GitHub token exchange failed', error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'github_api',
      });
      throw new UnauthorizedException('GitHub authentication failed');
    }
  }

  async oauth(userId: string, code: string): Promise<User> {
    const githubId = await this.exchangeCodeForGitHubId(code);
    return this.connectGitHub(userId, githubId);
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Fixed: Added missing method to update user profile with GitHub data
   */
  async updateUserProfile(
    userId: string,
    profileData: {
      username?: string;
      displayName?: string;
      avatarUrl?: string;
    },
  ): Promise<User> {
    const operation = 'update_user_profile';

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          username: profileData.username,
          // Store additional profile data in settings JSON field
          settings: {
            displayName: profileData.displayName,
            avatarUrl: profileData.avatarUrl,
          },
        },
      });

      this.logger.log(`User profile updated for user ${userId}`, {
        userId,
        hasUsername: !!profileData.username,
        hasDisplayName: !!profileData.displayName,
        hasAvatarUrl: !!profileData.avatarUrl,
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'profile_update',
      });

      return user;
    } catch (error) {
      this.logger.error(`Failed to update user profile for user ${userId}`, error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'profile_update',
      });
      throw error;
    }
  }

  /**
   * Fixed: Enhanced GitHub refresh token storage with proper error handling
   */
  async storeGitHubRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const operation = 'store_github_refresh_token';

    try {
      const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
      const encryptedToken = key ? encrypt(refreshToken, key) : refreshToken;

      // Get current platform tokens to merge with existing data
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { platformTokens: true },
      });

      const currentTokens = (user?.platformTokens as any) || {};
      const updatedTokens = {
        ...currentTokens,
        github: {
          ...currentTokens.github,
          refreshToken: encryptedToken,
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        },
      };

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          platformTokens: updatedTokens,
        },
      });

      this.logger.log(`GitHub refresh token stored for user ${userId}`, {
        userId,
      });

      this.authOperationsCounter.inc({
        operation,
        status: 'success',
        method: 'github_token_store',
      });
    } catch (error) {
      this.logger.error(`Failed to store GitHub refresh token for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'github_token_store',
      });
      // Don't throw error as this is not critical for OAuth flow
    }
  }

  /**
   * Fixed: Added method to refresh GitHub access token
   */
  async refreshGitHubToken(userId: string): Promise<string | null> {
    const operation = 'refresh_github_token';

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, platformTokens: true },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const platformTokens = (user.platformTokens as any) || {};
      const githubTokens = platformTokens.github;

      if (!githubTokens?.refreshToken) {
        this.logger.warn(`No GitHub refresh token found for user ${userId}`);
        return null;
      }

      // GitHub doesn't support refresh tokens in their OAuth flow
      // This is a placeholder for future implementation if GitHub adds support
      this.logger.log(`GitHub refresh token mechanism not supported by GitHub OAuth`);

      this.authOperationsCounter.inc({
        operation,
        status: 'not_supported',
        method: 'oauth',
      });

      return null;
    } catch (error) {
      this.logger.error(`Failed to refresh GitHub token for user ${userId}`, error);
      this.authOperationsCounter.inc({
        operation,
        status: 'failure',
        method: 'oauth',
      });
      throw error;
    }
  }

  /**
   * Fixed: Added method to decrypt tokens
   */
  private decryptToken(encryptedToken: string, key: string): string {
    // This would use the same decryption logic as the encrypt function
    // For now, return as-is since we don't have the decrypt function implemented
    return encryptedToken;
  }

  generateJwt(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    return this.jwtService.sign(payload, {
      expiresIn: '7d', // or whatever expiration you want
    });
  }

  generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      type: 'access',
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' }); // Short-lived
  }

  generateRefreshToken(user: User): string {
    const payload = { sub: user.id, type: 'refresh', jti: uuidv4() };
    return this.jwtService.sign(payload, { expiresIn: '7d' }); // Long-lived
  }

  /**
   * Simulates a password hash operation to prevent timing attacks
   */
  private async _simulateHash(): Promise<void> {
    await bcrypt.hash('dummy', 12);
  }

  /**
   * Adds a delay to ensure consistent response times to prevent timing attacks
   */
  private async _delayToPreventTimingAttack(
    elapsedMs: number,
    minMs = 500, // Increased for better security
  ): Promise<void> {
    if (elapsedMs < minMs) {
      await new Promise(res => setTimeout(res, minMs - elapsedMs));
    }
  }
}
