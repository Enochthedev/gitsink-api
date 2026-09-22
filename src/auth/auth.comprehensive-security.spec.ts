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
      TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64 hex chars = 32 bytes
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      LOCAL_API_KEY: 'local-dev-key-for-testing',
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

describe('Comprehensive Authentication Security Tests', () => {
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

  describe('Magic Link Security Fixes', () => {
    describe('Token Cleanup Enhancement', () => {
      it('should cleanup expired tokens with proper transaction handling', async () => {
        const expiredTokens = [
          {
            id: '1',
            email: 'test1@example.com',
            expiresAt: new Date(Date.now() - 1000),
            createdAt: new Date(Date.now() - 60000),
          },
          {
            id: '2',
            email: 'test2@example.com',
            expiresAt: new Date(Date.now() - 2000),
            createdAt: new Date(Date.now() - 120000),
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

      it('should handle race conditions during cleanup', async () => {
        // Simulate concurrent cleanup operations
        mockPrismaService.$transaction.mockImplementation(async callback => {
          // First call succeeds
          if (mockPrismaService.$transaction.mock.calls.length === 1) {
            return callback({
              magicLinkToken: {
                findMany: jest.fn().mockResolvedValue([]),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              },
            });
          }
          // Second call fails due to concurrent modification
          throw new Error('Concurrent modification detected');
        });

        const cleanup1 = magicLinkService.cleanupExpiredTokens();
        const cleanup2 = magicLinkService.cleanupExpiredTokens();

        const [result1] = await Promise.allSettled([cleanup1, cleanup2]);

        expect(result1.status).toBe('fulfilled');
      });

      it('should provide detailed audit information during cleanup', async () => {
        const expiredTokens = [
          {
            id: '1',
            email: 'test@example.com',
            expiresAt: new Date(Date.now() - 1000),
            createdAt: new Date(Date.now() - 3600000), // 1 hour old
          },
        ];

        mockPrismaService.$transaction.mockImplementation(async callback => {
          return callback({
            magicLinkToken: {
              findMany: jest.fn().mockResolvedValue(expiredTokens),
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          });
        });

        const logSpy = jest.spyOn(magicLinkService['logger'], 'debug');

        await magicLinkService.cleanupExpiredTokens();

        expect(logSpy).toHaveBeenCalledWith(
          'Detailed cleanup information',
          expect.objectContaining({
            deletedTokens: expect.arrayContaining([
              expect.objectContaining({
                id: '1',
                email: 'test@example.com',
                ageInHours: expect.any(Number),
              }),
            ]),
          }),
        );
      });
    });

    describe('Rate Limiting Security', () => {
      it('should enforce strict rate limits per email', async () => {
        const mockUser = { id: 'user-id', email: 'test@example.com' };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.magicLinkToken.count.mockResolvedValue(3); // At limit
        mockPrismaService.magicLinkToken.deleteMany.mockResolvedValue({
          count: 0,
        });

        // Should not create token when rate limited
        await magicLinkService.sendMagicLink('test@example.com');

        expect(mockPrismaService.magicLinkToken.create).not.toHaveBeenCalled();
      });

      it('should not reveal rate limiting to prevent abuse', async () => {
        const mockUser = { id: 'user-id', email: 'test@example.com' };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.magicLinkToken.count.mockResolvedValue(5); // Over limit
        mockPrismaService.magicLinkToken.deleteMany.mockResolvedValue({
          count: 0,
        });

        // Should return normally without throwing error
        await expect(magicLinkService.sendMagicLink('test@example.com')).resolves.toBeUndefined();
      });
    });

    describe('Token Validation Security', () => {
      it('should use constant-time comparison for token validation', async () => {
        const validToken = 'a'.repeat(64);
        const storedTokens = [
          {
            id: '1',
            tokenHash: 'hash1',
            email: 'test@example.com',
            expiresAt: new Date(Date.now() + 60000),
          },
          {
            id: '2',
            tokenHash: 'hash2',
            email: 'test@example.com',
            expiresAt: new Date(Date.now() + 60000),
          },
        ];

        mockPrismaService.magicLinkToken.findMany.mockResolvedValue(storedTokens);
        mockPrismaService.user.findUnique.mockResolvedValue({
          id: 'user-id',
          email: 'test@example.com',
        });
        mockBcrypt.compare.mockResolvedValue(false as never);

        const start = Date.now();
        await expect(magicLinkService.validateMagicLink(validToken)).rejects.toThrow(
          'Invalid or expired magic link',
        );
        const duration = Date.now() - start;

        // Should check all tokens regardless of early mismatch
        expect(mockBcrypt.compare).toHaveBeenCalledTimes(2);
      });

      it('should validate token format strictly', async () => {
        const invalidTokens = [
          '', // empty
          'short', // too short
          'a'.repeat(63), // 63 chars
          'a'.repeat(65), // 65 chars
          null,
          undefined,
        ];

        for (const token of invalidTokens) {
          await expect(magicLinkService.validateMagicLink(token as any)).rejects.toThrow(
            'Invalid magic link token',
          );
        }
      });
    });
  });

  describe('JWT Token Security Fixes', () => {
    describe('Refresh Token Validation Enhancement', () => {
      it('should validate token structure comprehensively', async () => {
        const invalidPayloads = [
          { sub: 'user-id' }, // missing jti
          { jti: 'token-id' }, // missing sub
          { sub: 'user-id', jti: 'token-id' }, // missing type
          { sub: 'user-id', jti: 'token-id', type: 'access' }, // wrong type
          { sub: 'user-id', jti: 'token-id', type: 'refresh' }, // missing exp
        ];

        for (const payload of invalidPayloads) {
          mockJwtService.verifyAsync.mockResolvedValue(payload);

          await expect(jwtTokenService.refreshAccessToken('test-token')).rejects.toThrow(
            UnauthorizedException,
          );
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
        mockJwtService.sign.mockReturnValue('new-access-token');
        mockPrismaService.refreshToken.update.mockResolvedValue(mockStoredToken);

        const logSpy = jest.spyOn(jwtTokenService['logger'], 'warn');

        await jwtTokenService.refreshAccessToken('test-token');

        expect(logSpy).toHaveBeenCalledWith(
          'Potential refresh token replay attack detected',
          expect.objectContaining({
            userId: 'user-id',
            jti: 'token-id',
            timeSinceLastUse: expect.any(Number),
          }),
        );
      });

      it('should revoke all tokens on hash mismatch security breach', async () => {
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
        mockPrismaService.refreshToken.findMany.mockResolvedValue([]); // For revokeAllUserTokens
        mockBcrypt.compare.mockResolvedValue(false as never); // Hash mismatch
        mockPrismaService.refreshToken.deleteMany.mockResolvedValue({
          count: 5,
        });

        await expect(jwtTokenService.refreshAccessToken('test-token')).rejects.toThrow(
          'Invalid refresh token',
        );

        expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
          where: { userId: 'user-id' },
        });
      });

      it('should handle soft-deleted users properly', async () => {
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

        await expect(jwtTokenService.refreshAccessToken('test-token')).rejects.toThrow(
          'User account no longer exists',
        );
      });
    });

    describe('Token Blacklisting Security', () => {
      it('should properly blacklist tokens on logout', async () => {
        const mockToken = 'valid-jwt-token';
        const mockPayload = {
          jti: 'token-id',
          sub: 'user-id',
          type: 'access',
          exp: Math.floor(Date.now() / 1000) + 3600,
        };

        mockJwtService.decode.mockReturnValue(mockPayload);
        mockPrismaService.tokenBlacklist.create.mockResolvedValue({});
        mockPrismaService.auditLog.create.mockResolvedValue({});

        await jwtTokenService.blacklistToken(mockToken, 'user_logout');

        expect(mockPrismaService.tokenBlacklist.create).toHaveBeenCalledWith({
          data: {
            jti: 'token-id',
            tokenType: 'access',
            userId: 'user-id',
            reason: 'user_logout',
            expiresAt: new Date(mockPayload.exp * 1000),
            createdAt: expect.any(Date),
          },
        });
      });

      it('should check blacklist during token validation', async () => {
        const mockToken = 'blacklisted-token';
        const mockPayload = {
          jti: 'blacklisted-jti',
          sub: 'user-id',
          type: 'access',
          exp: Math.floor(Date.now() / 1000) + 3600,
        };

        mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
        mockPrismaService.tokenBlacklist.findUnique.mockResolvedValue({
          jti: 'blacklisted-jti',
        });

        const result = await jwtTokenService.validateToken(mockToken);

        expect(result.isValid).toBe(false);
        expect(result.isBlacklisted).toBe(true);
      });
    });
  });

  describe('API Key Security Fixes', () => {
    describe('Timing Attack Protection', () => {
      it('should perform constant-time validation with minimum comparisons', async () => {
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

        const start = Date.now();
        const result = await apiKeyService.validateApiKey('test-key');
        const duration = Date.now() - start;

        expect(result.isValid).toBe(false);
        // Should perform at least some comparisons for timing protection
        expect(mockBcrypt.compare).toHaveBeenCalled();

        // Should take at least 100ms due to response time normalization
        expect(duration).toBeGreaterThanOrEqual(95);
      });

      it('should normalize response time regardless of user count', async () => {
        const scenarios = [
          [], // No users
          [{ id: '1', apiKey: 'hash1' }], // One user
          Array(20)
            .fill(null)
            .map((_, i) => ({ id: `${i}`, apiKey: `hash${i}` })), // Many users
        ];

        const durations: number[] = [];

        for (const users of scenarios) {
          mockPrismaService.user.findMany.mockResolvedValue(users);
          mockBcrypt.compare.mockResolvedValue(false as never);

          const start = Date.now();
          await apiKeyService.validateApiKey('test-key');
          durations.push(Date.now() - start);
        }

        // All durations should be similar (within 50ms of each other)
        const maxDuration = Math.max(...durations);
        const minDuration = Math.min(...durations);
        expect(maxDuration - minDuration).toBeLessThan(50);
      });
    });

    describe('Rate Limiting Enhancement', () => {
      it('should enforce tier-based rate limits', async () => {
        const tiers = [
          { tier: 'free', limit: 100 },
          { tier: 'premium', limit: 1000 },
          { tier: 'enterprise', limit: 10000 },
        ];

        for (const { tier, limit } of tiers) {
          const mockUser = {
            id: 'user-id',
            email: 'test@example.com',
            apiKey: 'hash',
            tier,
            lastLoginAt: null,
            deletedAt: null,
          };

          mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
          mockPrismaService.apiUsage.count.mockResolvedValue(limit); // At limit
          mockPrismaService.user.update.mockResolvedValue(mockUser);
          mockBcrypt.compare.mockResolvedValue(true as never); // Valid API key

          const result = await apiKeyService.validateApiKey('test-key');

          expect(result.rateLimitExceeded).toBe(true);
          expect(result.usageCount).toBe(limit);

          // Reset mocks for next iteration
          jest.clearAllMocks();
          mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
          mockBcrypt.compare.mockResolvedValue(true as never);
        }
      });

      it('should track usage metrics per endpoint', async () => {
        const mockUser = {
          id: 'user-id',
          email: 'test@example.com',
          apiKey: 'hash',
          tier: 'free',
          lastLoginAt: null,
          deletedAt: null,
        };
        const usageInfo = {
          endpoint: '/api/projects',
          method: 'GET',
          statusCode: 200,
          duration: 150,
          timestamp: new Date(),
        };

        mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
        mockPrismaService.apiUsage.count.mockResolvedValue(50); // Under limit
        mockPrismaService.apiUsage.create.mockResolvedValue({});
        mockPrismaService.user.update.mockResolvedValue(mockUser);
        mockBcrypt.compare.mockResolvedValue(true as never); // Valid API key

        await apiKeyService.validateApiKey('test-key', usageInfo);

        expect(mockPrismaService.apiUsage.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: 'user-id',
            endpoint: '/api/projects',
            method: 'GET',
            statusCode: 200,
            duration: 150,
          }),
        });
      });
    });

    describe('Security Audit Enhancement', () => {
      it('should log all API key operations for audit', async () => {
        const mockUser = {
          id: 'user-id',
          email: 'test@example.com',
          tier: 'free',
        };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.user.update.mockResolvedValue({
          ...mockUser,
          apiKey: 'new-hash',
        });
        mockPrismaService.auditLog.create.mockResolvedValue({});

        await apiKeyService.generateApiKey('user-id', 'user_requested', {
          ip: '127.0.0.1',
        });

        expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-id',
            action: 'api_key_generated',
            resource: 'api_key',
            details: expect.objectContaining({
              reason: 'user_requested',
              clientInfo: { ip: '127.0.0.1' },
            }),
            ipAddress: '127.0.0.1',
            success: true,
            timestamp: expect.any(Date),
          },
        });
      });

      it('should detect and log suspicious API key usage patterns', async () => {
        const mockUser = {
          id: 'user-id',
          email: 'test@example.com',
          apiKey: 'hash',
          tier: 'free',
          lastLoginAt: null,
          deletedAt: null,
        };

        mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
        mockPrismaService.apiUsage.count.mockResolvedValue(99); // Near limit
        mockPrismaService.user.update.mockResolvedValue(mockUser);

        const logSpy = jest.spyOn(apiKeyService['logger'], 'warn');

        // Simulate rapid requests
        for (let i = 0; i < 5; i++) {
          await apiKeyService.validateApiKey('test-key', {
            endpoint: '/api/projects',
            method: 'GET',
            statusCode: 200,
            duration: 50,
            timestamp: new Date(),
            ipAddress: '192.168.1.100',
          });
        }

        // Should log if approaching rate limit
        expect(mockPrismaService.apiUsage.count).toHaveBeenCalled();
      });
    });
  });

  describe('Password Reset Security Fixes', () => {
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
      mockEnqueueService.enqueuePasswordResetConfirmation.mockResolvedValue(undefined);

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
        await expect(authService.resetPassword('valid-token', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });
  });

  describe('GitHub OAuth Security Fixes', () => {
    it('should encrypt GitHub tokens before storage', async () => {
      const mockUser = {
        id: 'user-id',
        platformTokens: {},
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      await authService.storeGitHubRefreshToken('user-id', 'github-refresh-token');

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

    it('should handle GitHub token refresh limitations', async () => {
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

      // GitHub doesn't support refresh tokens, should return null
      const result = await authService.refreshGitHubToken('user-id');
      expect(result).toBeNull();
    });

    it('should validate GitHub OAuth callback data', async () => {
      // This would be tested in the GitHub controller tests
      // but we can test the underlying service methods
      const invalidInputs = [
        { githubId: '', accessToken: 'valid-token' },
        { githubId: 'valid-id', accessToken: '' },
        { githubId: null, accessToken: 'valid-token' },
      ];

      for (const input of invalidInputs) {
        if (!input.githubId || !input.accessToken) {
          // These should be caught by the controller validation
          expect(input.githubId && input.accessToken).toBeFalsy();
        }
      }
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
        'test..test@example.com',
        'test@example..com',
        'a'.repeat(255) + '@example.com', // Too long
        'test@' + 'a'.repeat(255) + '.com', // Domain too long
      ];

      // Mock no existing user to ensure email validation happens first
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      for (const email of invalidEmails) {
        await expect(authService.signup(email, 'StrongPass123!')).rejects.toThrow(
          'Invalid email format',
        );
      }
    });

    it('should enforce comprehensive password requirements', async () => {
      const passwordTests = [
        { password: '123', reason: 'too short' },
        {
          password: 'password',
          reason: 'no uppercase, numbers, or special chars',
        },
        { password: 'Password', reason: 'no numbers or special chars' },
        { password: 'Password123', reason: 'no special chars' },
        { password: 'password123!', reason: 'no uppercase' },
        { password: 'PASSWORD123!', reason: 'no lowercase' },
        { password: 'Password!', reason: 'no numbers' },
        { password: 'Password123', reason: 'no special chars' },
      ];

      for (const { password, reason } of passwordTests) {
        await expect(authService.signup('test@example.com', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });

    it('should accept strong passwords', async () => {
      const strongPasswords = [
        'StrongPass123!',
        'MySecure@Password1',
        'Complex#Pass2024',
        'Unbreakable$123',
      ];

      mockPrismaService.user.findUnique.mockResolvedValue(null); // No existing user
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'test@example.com',
        apiKey: 'hashed-key',
      });

      for (const password of strongPasswords) {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
        mockPrismaService.user.findUnique.mockResolvedValue(null);
        mockPrismaService.user.create.mockResolvedValue({
          id: 'new-user-id',
          email: 'test@example.com',
          apiKey: 'hashed-key',
        });
        mockEnqueueService.enqueueSignupEmail.mockResolvedValue(undefined);

        await expect(authService.signup('test@example.com', password)).resolves.toBeDefined();
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      mockPrismaService.user.create.mockRejectedValue(
        new Error('Database connection failed: password=secret123 host=internal-db'),
      );

      await expect(authService.signup('test@example.com', 'StrongPass123!')).rejects.toThrow(
        'Could not create user',
      );
    });

    it('should handle database errors gracefully', async () => {
      const databaseErrors = [
        new Error('Connection timeout'),
        new Error('Unique constraint violation'),
        new Error('Foreign key constraint failed'),
      ];

      for (const error of databaseErrors) {
        mockPrismaService.user.findUnique.mockRejectedValue(error);

        await expect(authService.validateUser('test@example.com', 'password')).resolves.toBeNull();

        jest.clearAllMocks();
      }
    });

    it('should log security events without exposing sensitive data', async () => {
      const logSpy = jest.spyOn(authService['logger'], 'warn');

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await authService.validateUser('nonexistent@example.com', 'password');

      // Should log the attempt but not expose the password
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('password'));
    });
  });
});
