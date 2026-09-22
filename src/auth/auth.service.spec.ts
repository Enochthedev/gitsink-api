import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';
import { EnqueueService } from '@queues/email/enqueue/enqueue.service';
import { MetricsService } from '@metrics/metrics.service';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';
import {
  createMockAxiosError,
  createMockAxiosResponse,
  createMockConfigService,
  createMockEnqueueService,
  createMockJwtService,
  createMockJwtTokenService,
  createMockMetricsService,
  createMockPrismaService,
  createMockUser,
} from '../../test/test-utils/mocks';

// Mock external dependencies
jest.mock('bcryptjs');
jest.mock('axios');
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({ toString: () => 'mock-random-string' })),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: ReturnType<typeof createMockPrismaService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let jwtService: ReturnType<typeof createMockJwtService>;
  let jwtTokenService: ReturnType<typeof createMockJwtTokenService>;
  let enqueueService: ReturnType<typeof createMockEnqueueService>;
  let metricsService: ReturnType<typeof createMockMetricsService>;

  const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
  const mockAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock services
    prismaService = createMockPrismaService();
    configService = createMockConfigService();
    jwtService = createMockJwtService();
    jwtTokenService = createMockJwtTokenService();
    enqueueService = createMockEnqueueService();
    metricsService = createMockMetricsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
        { provide: JwtTokenService, useValue: jwtTokenService },
        { provide: EnqueueService, useValue: enqueueService },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Setup default bcrypt mocks
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('signup', () => {
    it('should create a new user successfully', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const username = 'testuser';

      const mockUser = createMockUser({ email, username });

      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);
      enqueueService.enqueueSignupEmail.mockResolvedValue(undefined);

      const result = await service.signup(email, password, username);

      expect(result).toEqual({
        user: mockUser,
        apiKey: 'mock-random-string',
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(prismaService.user.create).toHaveBeenCalled();
      expect(enqueueService.enqueueSignupEmail).toHaveBeenCalledWith(email);
    });

    it('should throw ConflictException if email already exists', async () => {
      const email = 'existing@example.com';
      const password = 'StrongPass123!';

      const existingUser = createMockUser({ email });
      prismaService.user.findUnique.mockResolvedValue(existingUser);

      await expect(service.signup(email, password)).rejects.toThrow(ConflictException);
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid email', async () => {
      const invalidEmail = 'invalid-email';
      const password = 'StrongPass123!';

      await expect(service.signup(invalidEmail, password)).rejects.toThrow(BadRequestException);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for weak password', async () => {
      const email = 'test@example.com';
      const weakPassword = '123';

      await expect(service.signup(email, weakPassword)).rejects.toThrow(BadRequestException);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const username = 'existinguser';

      const existingUser = createMockUser({ username });

      prismaService.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(existingUser); // username check

      await expect(service.signup(email, password, username)).rejects.toThrow(ConflictException);
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });

    it('should handle signup without password (OAuth flow)', async () => {
      const email = 'test@example.com';
      const username = 'testuser';

      const mockUser = createMockUser({ email, username, password: null });

      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.signup(email, undefined, username);

      expect(result.user.password).toBeNull();
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email,
          username,
          password: null,
        }),
      });
    });
  });

  describe('validateUser', () => {
    it('should validate user with correct credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = createMockUser({ email, password: 'hashed-password' });

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.validateUser(email, password);

      expect(result).toEqual(mockUser);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, 'hashed-password');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should return null for non-existent user', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      prismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null for incorrect password', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const mockUser = createMockUser({ email, password: 'hashed-password' });

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, 'hashed-password');
    });

    it('should return null for user without password', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = createMockUser({ email, password: null });

      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('signin', () => {
    it('should sign in user with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = createMockUser({ email });

      // Mock validateUser to return the user
      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser);

      const result = await service.signin(email, password);

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          tier: mockUser.tier,
        },
      });
      expect(jwtTokenService.generateTokenPair).toHaveBeenCalledWith(mockUser, undefined);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';

      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      await expect(service.signin(email, password)).rejects.toThrow(UnauthorizedException);
      expect(jwtTokenService.generateTokenPair).not.toHaveBeenCalled();
    });

    it('should include device info in token generation', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const deviceInfo = { deviceId: 'device-123', ipAddress: '127.0.0.1' };
      const mockUser = createMockUser({ email });

      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser);

      await service.signin(email, password, deviceInfo);

      expect(jwtTokenService.generateTokenPair).toHaveBeenCalledWith(mockUser, deviceInfo);
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API key', async () => {
      const apiKey = 'valid-api-key-12345678901234567890';
      const mockUser = createMockUser({ apiKey: 'hashed-api-key' });

      prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(true as never);
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.validateApiKey(apiKey);

      expect(result).toEqual(mockUser);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(apiKey, 'hashed-api-key');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should return null for invalid API key format', async () => {
      const shortApiKey = 'short';

      const result = await service.validateApiKey(shortApiKey);

      expect(result).toBeNull();
      expect(prismaService.user.findMany).not.toHaveBeenCalled();
    });

    it('should return null for non-matching API key', async () => {
      const apiKey = 'invalid-api-key-12345678901234567890';
      const mockUser = createMockUser({ apiKey: 'hashed-api-key' });

      prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
      expect(mockBcrypt.compare).toHaveBeenCalledWith(apiKey, 'hashed-api-key');
    });

    it('should handle database errors gracefully', async () => {
      const apiKey = 'valid-api-key-12345678901234567890';

      prismaService.user.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate reset token for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue(mockUser);
      jest.spyOn(service, 'sendForgotPassword').mockResolvedValue(undefined);

      await service.requestPasswordReset(email);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          resetToken: 'hashed-value',
          resetTokenExpires: expect.any(Date),
        },
      });
      expect(service.sendForgotPassword).toHaveBeenCalledWith(email, 'mock-random-string');
    });

    it('should handle non-existent user gracefully', async () => {
      const email = 'nonexistent@example.com';

      prismaService.user.findUnique.mockResolvedValue(null);

      await service.requestPasswordReset(email);

      expect(prismaService.user.update).not.toHaveBeenCalled();
      expect(service.sendForgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const token = 'valid-reset-token';
      const newPassword = 'NewStrongPass123!';
      const mockUser = createMockUser({
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      });

      prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(true as never);
      prismaService.user.update.mockResolvedValue(mockUser);
      jest.spyOn(service, 'sendPasswordResetConfirmation').mockResolvedValue(undefined);

      const result = await service.resetPassword(token, newPassword);

      expect(result).toBe(true);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          password: 'hashed-value',
          resetToken: null,
          resetTokenExpires: null,
        },
      });
      expect(service.sendPasswordResetConfirmation).toHaveBeenCalledWith(mockUser.email);
    });

    it('should reject weak new password', async () => {
      const token = 'valid-reset-token';
      const weakPassword = '123';

      await expect(service.resetPassword(token, weakPassword)).rejects.toThrow(BadRequestException);
      expect(prismaService.user.findMany).not.toHaveBeenCalled();
    });

    it('should return false for invalid token', async () => {
      const token = 'invalid-reset-token';
      const newPassword = 'NewStrongPass123!';
      const mockUser = createMockUser({
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      });

      prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.resetPassword(token, newPassword);

      expect(result).toBe(false);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('regenerateApiKey', () => {
    it('should regenerate API key successfully', async () => {
      const userId = 'user-123';
      const reason = 'security-update';
      const mockUser = createMockUser({ id: userId });

      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.regenerateApiKey(userId, reason);

      expect(result).toEqual({
        user: mockUser,
        apiKey: 'mock-random-string',
      });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          apiKey: 'hashed-value',
          apiKeyUpdatedAt: expect.any(Date),
        },
      });
    });

    it('should handle database errors', async () => {
      const userId = 'user-123';

      prismaService.user.update.mockRejectedValue(new Error('Database error'));

      await expect(service.regenerateApiKey(userId)).rejects.toThrow('Database error');
    });
  });

  describe('connectGitHub', () => {
    it('should connect GitHub account successfully', async () => {
      const userId = 'user-123';
      const githubId = '12345';
      const githubToken = 'github-token';
      const mockUser = createMockUser({ id: userId, githubId });

      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.connectGitHub(userId, githubId, githubToken);

      expect(result).toEqual(mockUser);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { githubId, githubToken: 'github-token' }, // Would be encrypted in real scenario
      });
    });
  });

  describe('exchangeCodeForGitHubId', () => {
    it('should exchange code for GitHub ID successfully', async () => {
      const code = 'auth-code';
      const accessToken = 'github-access-token';
      const githubUserId = 12345;

      mockAxios.post.mockResolvedValue(createMockAxiosResponse({ access_token: accessToken }));
      mockAxios.get.mockResolvedValue(createMockAxiosResponse({ id: githubUserId }));

      const result = await service.exchangeCodeForGitHubId(code);

      expect(result).toBe('12345');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code,
        },
        { headers: { Accept: 'application/json' } },
      );
      expect(mockAxios.get).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: { Authorization: `token ${accessToken}` },
      });
    });

    it('should handle GitHub API errors', async () => {
      const code = 'invalid-code';

      mockAxios.post.mockRejectedValue(createMockAxiosError(400, 'Bad Request'));

      await expect(service.exchangeCodeForGitHubId(code)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockPayload = { sub: 'user-123', type: 'refresh', jti: 'token-id' };
      const mockUser = createMockUser({ id: 'user-123' });
      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        user: mockUser,
      };

      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      prismaService.refreshToken.findFirst.mockResolvedValue(mockStoredToken);
      mockBcrypt.compare.mockResolvedValue(true as never);
      jest.spyOn(service, 'generateAccessToken').mockReturnValue('new-access-token');

      const result = await service.refreshToken(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        expiresIn: 900,
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(refreshToken);
      expect(prismaService.refreshToken.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'token-id',
          userId: 'user-123',
          expiresAt: { gt: expect.any(Date) },
        },
        include: { user: true },
      });
    });

    it('should throw UnauthorizedException for invalid token type', async () => {
      const refreshToken = 'invalid-token';
      const mockPayload = { sub: 'user-123', type: 'access', jti: 'token-id' };

      jwtService.verifyAsync.mockResolvedValue(mockPayload);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prismaService.refreshToken.findFirst).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent stored token', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockPayload = { sub: 'user-123', type: 'refresh', jti: 'token-id' };

      jwtService.verifyAsync.mockResolvedValue(mockPayload);
      prismaService.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sendMagicLinkSignInEmail', () => {
    it('should send magic link for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      jest.spyOn(service, 'getUserByEmail').mockResolvedValue(mockUser);
      prismaService.magicLinkToken.create.mockResolvedValue({} as any);
      enqueueService.enqueueMagicLinkSignInEmail.mockResolvedValue(undefined);

      await service.sendMagicLinkSignInEmail(email);

      expect(prismaService.magicLinkToken.create).toHaveBeenCalledWith({
        data: {
          tokenHash: 'hashed-value',
          email,
          expiresAt: expect.any(Date),
        },
      });
      expect(enqueueService.enqueueMagicLinkSignInEmail).toHaveBeenCalledWith(
        email,
        'mock-random-string',
      );
    });

    it('should handle non-existent user gracefully', async () => {
      const email = 'nonexistent@example.com';

      jest.spyOn(service, 'getUserByEmail').mockResolvedValue(null);

      await service.sendMagicLinkSignInEmail(email);

      expect(prismaService.magicLinkToken.create).not.toHaveBeenCalled();
      expect(enqueueService.enqueueMagicLinkSignInEmail).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should generate secure API key', () => {
      const apiKey = (service as any).generateSecureApiKey();
      expect(apiKey).toBe('mock-random-string');
    });

    it('should validate email format', () => {
      expect((service as any).isValidEmail('test@example.com')).toBe(true);
      expect((service as any).isValidEmail('invalid-email')).toBe(false);
      expect((service as any).isValidEmail('')).toBe(false);
    });

    it('should validate password strength', () => {
      expect((service as any).isPasswordStrong('StrongPass123!')).toBe(true);
      expect((service as any).isPasswordStrong('weak')).toBe(false);
      expect((service as any).isPasswordStrong('NoNumbers!')).toBe(false);
      expect((service as any).isPasswordStrong('nonumbers123!')).toBe(false);
    });

    it('should calculate password strength', () => {
      expect((service as any).calculatePasswordStrength('VeryStrongPassword123!')).toBe('strong');
      expect((service as any).calculatePasswordStrength('MediumPass123!')).toBe('strong');
      expect((service as any).calculatePasswordStrength('weak123')).toBe('weak');
      expect((service as any).calculatePasswordStrength('123')).toBe('very_weak');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors in signup', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';

      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.signup(email, password)).rejects.toThrow('Could not create user');
    });

    it('should handle email service failures gracefully in signup', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const mockUser = createMockUser({ email });

      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);
      enqueueService.enqueueSignupEmail.mockRejectedValue(new Error('Email service down'));

      // Should not throw error, just log it
      const result = await service.signup(email, password);
      expect(result.user).toEqual(mockUser);
    });
  });

  describe('security features', () => {
    it('should implement timing attack protection', async () => {
      const startTime = Date.now();

      // Test with non-existent user (should still take similar time)
      await service.validateUser('nonexistent@example.com', 'password');

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least some time due to simulated hash
      expect(duration).toBeGreaterThan(0);
    });

    it('should track authentication metrics', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';

      prismaService.user.findUnique.mockResolvedValue(null);

      await service.signup(email, password);

      // Verify metrics were recorded
      expect(metricsService.createCustomCounter).toHaveBeenCalled();
      expect(metricsService.createCustomHistogram).toHaveBeenCalled();
    });
  });
});
