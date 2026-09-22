import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { ApiKeyService } from './api-key.service';
import { JwtTokenService } from './jwt-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MetricsService } from '../metrics/metrics.service';
import { EnqueueService } from '../queues/email/enqueue/enqueue.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// Mock bcrypt for consistent testing
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Comprehensive Authentication Security Tests', () => {
  let authService: AuthService;
  let magicLinkService: MagicLinkService;
  let apiKeyService: ApiKeyService;
  let jwtTokenService: JwtTokenService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    magicLinkToken: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    apiUsage: {
      count: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    tokenBlacklist: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        JWT_SECRET: 'test-secret',
        TOKEN_ENCRYPTION_KEY: 'test-key-32-chars-long-for-aes256',
        LOCAL_API_KEY: 'local-dev-key',
      };
      return config[key];
    }),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-jwt-token'),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };

  const mockMetricsService = {
    createCustomCounter: jest.fn(() => ({ inc: jest.fn() })),
    createCustomHistogram: jest.fn(() => ({ observe: jest.fn() })),
    createCustomGauge: jest.fn(() => ({ set: jest.fn() })),
    recordDatabaseQueryDuration: jest.fn(),
    incrementDatabaseQueries: jest.fn(),
  };

  const mockEnqueueService = {
    enqueueSignupEmail: jest.fn(),
    enqueueMagicLinkSignInEmail: jest.fn(),
    enqueueForgotPassword: jest.fn(),
    enqueuePasswordResetConfirmation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        MagicLinkService,
        ApiKeyService,
        JwtTokenService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: EnqueueService, useValue: mockEnqueueService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    magicLinkService = module.get<MagicLinkService>(MagicLinkService);
    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
    jwtTokenService = module.get<JwtTokenService>(JwtTokenService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('Magic Link Token Cleanup Security', () => {
    it('should cleanup expired tokens with race condition protection', async () => {
      const expiredTokens = [
        {
          id: '1',
          email: 'test1@example.com',
          expiresAt: new Date(Date.now() - 1000),
          createdAt: new Date(),
        },
        {
          id: '2',
          email: 'test2@example.com',
          expiresAt: new Date(Date.now() - 2000),
          createdAt: new Date(),
        },
      ];

      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          magicLinkToken: {
            findMany: jest.fn().mockResolvedValue(expiredTokens),
            deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      const count = await magicLinkService.cleanupExpiredTokens(undefined, 2);
      expect(count).toBe(2);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should handle concurrent cleanup operations safely', async () => {
      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          magicLinkToken: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        });
      });

      // Simulate concurrent cleanup calls
      const cleanupPromises = Array(5)
        .fill(null)
        .map(() => magicLinkService.cleanupExpiredTokens());

      const results = await Promise.all(cleanupPromises);
      expect(results.every(count => count >= 0)).toBe(true);
    });
  });

  describe('JWT Refresh Token Edge Cases', () => {
    it('should handle malformed JWT payloads', async () => {
      const malformedPayloads = [
        { sub: 'user-id' }, // missing required fields
        { type: 'refresh' }, // missing sub
        { sub: 'user-id', type: 'access' }, // wrong type
        { sub: 'user-id', type: 'refresh', exp: 0 }, // expired
      ];

      for (const payload of malformedPayloads) {
        mockJwtService.verifyAsync.mockResolvedValue(payload);
        await expect(authService.refreshToken('test-token')).rejects.toThrow();
      }
    });

    it('should detect and handle token replay attacks', async () => {
      const mockPayload = {
        sub: 'user-id',
        type: 'refresh',
        jti: 'token-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };

      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(Date.now() - 500), // Used 500ms ago
        usageCount: 1,
        user: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          tier: 'free',
          deletedAt: null,
        },
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(mockStoredToken);
      mockPrismaService.refreshToken.update.mockResolvedValue(mockStoredToken);

      // Should still work but log warning
      const result = await authService.refreshToken('valid-jwt');
      expect(result.accessToken).toBeDefined();
    });

    it('should handle high usage count tokens', async () => {
      const mockPayload = {
        sub: 'user-id',
        type: 'refresh',
        jti: 'token-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };

      const mockStoredToken = {
        id: 'token-id',
        userId: 'user-id',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(Date.now() - 60000),
        usageCount: 1500, // Very high usage
        user: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          tier: 'free',
          deletedAt: null,
        },
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(mockStoredToken);
      mockPrismaService.refreshToken.update.mockResolvedValue(mockStoredToken);

      // Should still work but log warning
      const result = await authService.refreshToken('valid-jwt');
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('API Key Timing Attack Protection', () => {
    it('should maintain constant time regardless of user count', async () => {
      const scenarios = [
        [], // No users
        [{ id: '1', apiKey: 'hash1', tier: 'free', deletedAt: null }], // One user
        Array(50)
          .fill(null)
          .map((_, i) => ({
            id: `${i}`,
            apiKey: `hash${i}`,
            tier: 'free',
            deletedAt: null,
          })), // Many users
      ];

      const timings: number[] = [];

      for (const users of scenarios) {
        mockPrismaService.user.findMany.mockResolvedValue(users);
        mockBcrypt.compare.mockResolvedValue(false as never);

        const start = Date.now();
        await apiKeyService.validateApiKey('invalid-key');
        const duration = Date.now() - start;
        timings.push(duration);
      }

      // All timings should be similar (within 50ms of each other)
      const maxTiming = Math.max(...timings);
      const minTiming = Math.min(...timings);
      expect(maxTiming - minTiming).toBeLessThan(50);
    });

    it('should perform minimum hash comparisons for security', async () => {
      const mockUsers = [
        {
          id: '1',
          email: 'user1@example.com',
          apiKey: 'hash1',
          tier: 'free',
          lastLoginAt: null,
          deletedAt: null,
        },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockBcrypt.compare.mockResolvedValue(false as never);
      mockBcrypt.hash.mockResolvedValue('dummy-hash' as never);

      await apiKeyService.validateApiKey('test-key-that-is-long-enough-32chars');

      // Should perform at least 10 comparisons (minimum for security)
      // 1 real comparison + 9 dummy comparisons
      expect(mockBcrypt.compare).toHaveBeenCalledTimes(1);
      expect(mockBcrypt.hash).toHaveBeenCalledTimes(9); // 9 dummy hashes
    });

    it('should handle rate limiting correctly', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        apiKey: 'hashed-key',
        tier: 'free',
        lastLoginAt: null,
        deletedAt: null,
      };

      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Mock rate limit exceeded
      mockPrismaService.apiUsage.count.mockResolvedValue(150); // Over free tier limit (100 for free)
      mockPrismaService.apiUsage.create.mockResolvedValue({});

      const result = await apiKeyService.validateApiKey('valid-key-that-is-long-enough-32chars', {
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: new Date(),
      });

      expect(result.rateLimitExceeded).toBe(true);
    });
  });

  describe('Password Reset Confirmation Flow', () => {
    it('should send confirmation email after successful reset', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      };

      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authService.resetPassword('valid-token', 'NewStrongPass123!');

      expect(result).toBe(true);
      expect(mockEnqueueService.enqueuePasswordResetConfirmation).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should handle email service failures gracefully', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      };

      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockEnqueueService.enqueuePasswordResetConfirmation.mockRejectedValue(
        new Error('Email service down'),
      );

      // Should still succeed even if email fails
      const result = await authService.resetPassword('valid-token', 'NewStrongPass123!');
      expect(result).toBe(true);
    });

    it('should validate password strength during reset', async () => {
      const weakPasswords = [
        '123',
        'password',
        'Password',
        'Password123',
        'password123!',
        'PASSWORD123!',
      ];

      for (const password of weakPasswords) {
        await expect(authService.resetPassword('token', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });
  });

  describe('GitHub OAuth Token Refresh Mechanism', () => {
    it('should handle GitHub token refresh gracefully', async () => {
      const mockUser = {
        id: 'user-id',
        platformTokens: {
          github: {
            accessToken: 'encrypted-access-token',
            refreshToken: 'encrypted-refresh-token',
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      // GitHub doesn't support refresh tokens, so should return null
      const result = await authService.refreshGitHubToken('user-id');
      expect(result).toBeNull();
    });

    it('should store GitHub tokens securely', async () => {
      const mockUser = {
        id: 'user-id',
        platformTokens: {},
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      await authService.storeGitHubRefreshToken('user-id', 'refresh-token');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          platformTokens: expect.objectContaining({
            github: expect.objectContaining({
              refreshToken: expect.any(String),
              updatedAt: expect.any(String),
              expiresAt: expect.any(String),
            }),
          }),
        },
      });
    });

    it('should update user profile with GitHub data', async () => {
      const mockUser = { id: 'user-id', username: null };
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      await authService.updateUserProfile('user-id', {
        username: 'github-user',
        displayName: 'GitHub User',
        avatarUrl: 'https://github.com/avatar.jpg',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          username: 'github-user',
          settings: expect.objectContaining({
            displayName: 'GitHub User',
            avatarUrl: 'https://github.com/avatar.jpg',
          }),
        },
      });
    });
  });

  describe('Input Validation Security', () => {
    it('should validate email format strictly', async () => {
      const invalidEmails = [
        '',
        'invalid',
        '@example.com',
        'test@',
        'test@.com',
        'a'.repeat(255) + '@example.com',
        'test..test@example.com',
        'test@example..com',
      ];

      // Ensure no existing user is found for these invalid emails
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      for (const email of invalidEmails) {
        await expect(authService.signup(email, 'StrongPass123!')).rejects.toThrow(
          'Invalid email format',
        );
      }
    });

    it('should enforce comprehensive password requirements', async () => {
      const weakPasswords = [
        '123',
        'password',
        'Password',
        'Password123',
        'password123!',
        'PASSWORD123!',
        'Aa1!', // Too short
      ];

      for (const password of weakPasswords) {
        await expect(authService.signup('test@example.com', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });

    it('should accept strong passwords', async () => {
      const strongPasswords = ['StrongPass123!', 'MySecure@Password1', 'Complex&Pass2024'];

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
      });

      for (const password of strongPasswords) {
        await expect(authService.signup('test@example.com', password)).resolves.toBeDefined();
        jest.clearAllMocks();
        mockPrismaService.user.findUnique.mockResolvedValue(null);
        mockPrismaService.user.create.mockResolvedValue({
          id: 'user-id',
          email: 'test@example.com',
        });
      }
    });

    it('should validate magic link token format', async () => {
      const invalidTokens = [
        '',
        'short',
        'a'.repeat(63), // 63 chars (should be 64)
        'a'.repeat(65), // 65 chars (should be 64)
        '!@#$%^&*()_+', // Invalid characters
      ];

      for (const token of invalidTokens) {
        await expect(magicLinkService.validateMagicLink(token)).rejects.toThrow(
          'Invalid magic link token',
        );
      }
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should enforce magic link rate limits per email', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLinkToken.count.mockResolvedValue(3); // At limit
      mockPrismaService.magicLinkToken.deleteMany.mockResolvedValue({
        count: 0,
      });

      // Should not throw but should not create token either
      await expect(magicLinkService.sendMagicLink('test@example.com')).resolves.toBeUndefined();
      expect(mockPrismaService.magicLinkToken.create).not.toHaveBeenCalled();
    });

    it('should handle API key rate limiting by tier', async () => {
      const tiers = [
        { tier: 'free', limit: 100 },
        { tier: 'premium', limit: 1000 },
        { tier: 'enterprise', limit: 10000 },
      ];

      for (const { tier, limit } of tiers) {
        const mockUser = {
          id: 'user-id',
          email: 'test@example.com',
          apiKey: 'hashed-key',
          tier,
          deletedAt: null,
        };

        mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
        mockBcrypt.compare.mockResolvedValue(true as never);
        mockPrismaService.apiUsage.count.mockResolvedValue(limit + 1); // Over limit

        const result = await apiKeyService.validateApiKey('valid-key');
        expect(result.rateLimitExceeded).toBe(true);

        jest.clearAllMocks();
      }
    });
  });

  describe('Security Event Logging', () => {
    it('should log suspicious authentication attempts', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await apiKeyService.validateApiKey('suspicious-key', {
        endpoint: '/api/sensitive',
        method: 'POST',
        statusCode: 401,
        duration: 100,
        ipAddress: '192.168.1.100',
        userAgent: 'Suspicious Bot',
        timestamp: new Date(),
      });

      // Should log the attempt even if validation fails
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should track token generation and usage', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        tier: 'free',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      await authService.signup('test@example.com', 'StrongPass123!');

      // Should log the signup event
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });
  });
});
