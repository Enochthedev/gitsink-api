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
import * as bcrypt from 'bcryptjs';

// Mock bcrypt for consistent testing
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock dependencies
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
  $transaction: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config = {
      JWT_SECRET: 'test-secret',
      TOKEN_ENCRYPTION_KEY: 'test-key',
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
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

describe('Authentication Security Fixes', () => {
  let authService: AuthService;
  let magicLinkService: MagicLinkService;
  let apiKeyService: ApiKeyService;
  let jwtTokenService: JwtTokenService;

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

    // Reset all mocks
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('Magic Link Token Cleanup Fix', () => {
    it('should cleanup expired tokens with buffer time', async () => {
      const expiredTokens = [
        {
          id: '1',
          email: 'test1@example.com',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          id: '2',
          email: 'test2@example.com',
          expiresAt: new Date(Date.now() - 2000),
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

      const count = await magicLinkService.cleanupExpiredTokens(undefined, 1);
      expect(count).toBe(2);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockPrismaService.$transaction.mockRejectedValue(new Error('Database error'));

      await expect(magicLinkService.cleanupExpiredTokens()).rejects.toThrow(
        'Failed to cleanup expired tokens',
      );
    });
  });

  describe('JWT Refresh Token Validation Fix', () => {
    it('should validate token format before processing', async () => {
      const invalidTokens = ['', null, undefined, 'invalid'];

      for (const token of invalidTokens) {
        await expect(authService.refreshToken(token as any)).rejects.toThrow(
          'Invalid refresh token format',
        );
      }
    });

    it('should validate JWT structure thoroughly', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      await expect(authService.refreshToken('invalid-jwt')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should check for deleted users', async () => {
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
        lastUsedAt: null,
        usageCount: 0,
        user: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          tier: 'free',
          deletedAt: new Date(), // User is soft-deleted
        },
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(mockStoredToken);

      await expect(authService.refreshToken('valid-jwt')).rejects.toThrow(
        'User account no longer exists',
      );
    });

    it('should revoke all tokens on hash mismatch', async () => {
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
        lastUsedAt: null,
        usageCount: 0,
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
      mockBcrypt.compare.mockResolvedValue(false as never); // Hash mismatch
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      await expect(authService.refreshToken('valid-jwt')).rejects.toThrow('Invalid refresh token');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
      });
    });
  });

  describe('API Key Timing Attack Protection Fix', () => {
    it('should perform constant-time validation', async () => {
      const mockUsers = [
        {
          id: '1',
          email: 'user1@example.com',
          apiKey: 'hash1',
          tier: 'free',
          lastLoginAt: null,
          deletedAt: null,
        },
        {
          id: '2',
          email: 'user2@example.com',
          apiKey: 'hash2',
          tier: 'free',
          lastLoginAt: null,
          deletedAt: null,
        },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const start = Date.now();
      const result = await apiKeyService.validateApiKey('invalid-key');
      const duration = Date.now() - start;

      expect(result.isValid).toBe(false);
      // Should take at least 100ms due to normalization
      expect(duration).toBeGreaterThanOrEqual(95);
    });

    it('should perform minimum number of hash comparisons', async () => {
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

      await apiKeyService.validateApiKey('test-key');

      // Should call bcrypt.compare at least 10 times (minimum comparisons)
      expect(mockBcrypt.compare).toHaveBeenCalledTimes(10);
    });
  });

  describe('Password Reset Confirmation Fix', () => {
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

    it('should handle email sending failures gracefully', async () => {
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
  });

  describe('GitHub OAuth Token Handling Fix', () => {
    it('should store GitHub tokens with proper encryption metadata', async () => {
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

    it('should handle GitHub token refresh gracefully', async () => {
      const mockUser = {
        id: 'user-id',
        platformTokens: {
          github: {
            refreshToken: 'encrypted-token',
            updatedAt: new Date().toISOString(),
          },
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      // GitHub doesn't support refresh tokens, so should return null
      const result = await authService.refreshGitHubToken('user-id');
      expect(result).toBeNull();
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
      ];

      for (const email of invalidEmails) {
        await expect(authService.signup(email, 'StrongPass123!')).rejects.toThrow(
          'Invalid email format',
        );
      }
    });

    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123',
        'password',
        'Password',
        'Password123',
        'password123!',
        'PASSWORD123!',
      ];

      for (const password of weakPasswords) {
        await expect(authService.signup('test@example.com', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });

    it('should validate magic link token format', async () => {
      const invalidTokens = [
        '',
        'short',
        'a'.repeat(63), // 63 chars (should be 64)
        'a'.repeat(65), // 65 chars (should be 64)
      ];

      for (const token of invalidTokens) {
        await expect(magicLinkService.validateMagicLink(token)).rejects.toThrow(
          'Invalid magic link token',
        );
      }
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce magic link rate limits', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLinkToken.count
        .mockResolvedValueOnce(0) // first request
        .mockResolvedValueOnce(1) // second request
        .mockResolvedValueOnce(2) // third request
        .mockResolvedValueOnce(3); // fourth request (rate limited)

      mockPrismaService.magicLinkToken.create.mockResolvedValue({});

      // First 3 should succeed
      await magicLinkService.sendMagicLink('test@example.com');
      await magicLinkService.sendMagicLink('test@example.com');
      await magicLinkService.sendMagicLink('test@example.com');

      // Fourth should be rate limited (no token created)
      await magicLinkService.sendMagicLink('test@example.com');

      expect(mockPrismaService.magicLinkToken.create).toHaveBeenCalledTimes(3);
    });

    it('should track API usage for rate limiting', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        apiKey: 'hash',
        tier: 'free',
        lastLoginAt: null,
        deletedAt: null,
      };
      const usageInfo = {
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: new Date(),
      };

      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.apiUsage.count.mockResolvedValue(50); // Under limit
      mockPrismaService.apiUsage.create.mockResolvedValue({});
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await apiKeyService.validateApiKey('test-key', usageInfo);

      expect(result.isValid).toBe(true);
      expect(mockPrismaService.apiUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-id',
          endpoint: '/api/test',
          method: 'GET',
          statusCode: 200,
        }),
      });
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in errors', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection failed: password=secret123'),
      );

      await expect(authService.signup('test@example.com', 'StrongPass123!')).rejects.toThrow(
        'Could not create user',
      );
    });

    it('should handle malformed JWT gracefully', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      const result = await jwtTokenService.validateToken('malformed-jwt');
      expect(result.isValid).toBe(false);
    });
  });
});
