import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  ApiTestHelpers,
  TestContext,
  TestDataBuilder,
  closeTestApp,
  createTestApp,
} from '../../test/test-utils/integration-helpers';
import { createMockUser } from '../../test/test-utils/mocks';
import * as bcrypt from 'bcryptjs';

// Mock bcrypt for consistent testing
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Auth API Integration Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('POST /auth/signup', () => {
    it('should create a new user successfully', async () => {
      const signupData = TestDataBuilder.validSignupData();
      const mockUser = createMockUser({
        email: signupData.email,
        username: signupData.username,
      });

      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const response = await context.request.post('/auth/signup').send(signupData).expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('apiKey');
      expect(response.body.user.email).toBe(signupData.email);
      expect(response.body.user.username).toBe(signupData.username);
      expect(response.body.apiKey).toBeDefined();

      expect(context.prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: signupData.email },
      });
      expect(context.prismaService.user.create).toHaveBeenCalled();
    });

    it('should return 409 for existing email', async () => {
      const signupData = TestDataBuilder.validSignupData();
      const existingUser = createMockUser({ email: signupData.email });

      context.prismaService.user.findUnique.mockResolvedValue(existingUser);

      const response = await context.request.post('/auth/signup').send(signupData).expect(409);

      ApiTestHelpers.expectValidationError(response);
      expect(response.body.message).toContain('Email already in use');
    });

    it('should return 400 for invalid email format', async () => {
      const signupData = {
        ...TestDataBuilder.validSignupData(),
        email: 'invalid-email',
      };

      const response = await context.request.post('/auth/signup').send(signupData).expect(400);

      ApiTestHelpers.expectValidationError(response, 'email');
    });

    it('should return 400 for weak password', async () => {
      const signupData = {
        ...TestDataBuilder.validSignupData(),
        password: '123',
      };

      const response = await context.request.post('/auth/signup').send(signupData).expect(400);

      ApiTestHelpers.expectValidationError(response, 'password');
    });

    it('should return 409 for existing username', async () => {
      const signupData = TestDataBuilder.validSignupData();
      const existingUser = createMockUser({ username: signupData.username });

      context.prismaService.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(existingUser); // username check

      const response = await context.request.post('/auth/signup').send(signupData).expect(409);

      expect(response.body.message).toContain('Username already taken');
    });

    it('should handle missing optional fields', async () => {
      const signupData = {
        email: 'test@example.com',
        password: 'StrongPass123!',
        // username is optional
      };
      const mockUser = createMockUser({
        email: signupData.email,
        username: null,
      });

      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const response = await context.request.post('/auth/signup').send(signupData).expect(201);

      expect(response.body.user.username).toBeNull();
    });
  });

  describe('POST /auth/signin', () => {
    it('should sign in user with valid credentials', async () => {
      const signinData = TestDataBuilder.validSigninData();
      const mockUser = createMockUser({
        email: signinData.email,
        password: 'hashed-password',
      });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const response = await context.request.post('/auth/signin').send(signinData).expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(signinData.email);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(signinData.password, 'hashed-password');
    });

    it('should return 401 for invalid credentials', async () => {
      const signinData = TestDataBuilder.validSigninData();

      context.prismaService.user.findUnique.mockResolvedValue(null);

      const response = await context.request.post('/auth/signin').send(signinData).expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });

    it('should return 401 for incorrect password', async () => {
      const signinData = TestDataBuilder.validSigninData();
      const mockUser = createMockUser({
        email: signinData.email,
        password: 'hashed-password',
      });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const response = await context.request.post('/auth/signin').send(signinData).expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });

    it('should return 400 for missing fields', async () => {
      const response = await context.request
        .post('/auth/signin')
        .send({ email: 'test@example.com' }) // missing password
        .expect(400);

      ApiTestHelpers.expectValidationError(response);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockUser = createMockUser();
      const mockStoredToken = {
        id: 'token-id',
        userId: mockUser.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
        user: mockUser,
      };

      context.prismaService.refreshToken.findFirst.mockResolvedValue(mockStoredToken);

      const response = await context.request
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
    });

    it('should return 401 for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';

      context.prismaService.refreshToken.findFirst.mockResolvedValue(null);

      const response = await context.request
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send password reset email for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const response = await context.request
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          resetToken: expect.any(String),
          resetTokenExpires: expect.any(Date),
        },
      });
    });

    it('should handle non-existent user gracefully', async () => {
      const email = 'nonexistent@example.com';

      context.prismaService.user.findUnique.mockResolvedValue(null);

      const response = await context.request
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.user.update).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid email format', async () => {
      const response = await context.request
        .post('/auth/forgot-password')
        .send({ email: 'invalid-email' })
        .expect(400);

      ApiTestHelpers.expectValidationError(response, 'email');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const resetData = {
        token: 'valid-reset-token',
        newPassword: 'NewStrongPass123!',
      };
      const mockUser = createMockUser({
        resetToken: 'hashed-token',
        resetTokenExpires: new Date(Date.now() + 3600000),
      });

      context.prismaService.user.findMany.mockResolvedValue([mockUser]);
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const response = await context.request
        .post('/auth/reset-password')
        .send(resetData)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          password: expect.any(String),
          resetToken: null,
          resetTokenExpires: null,
        },
      });
    });

    it('should return 400 for invalid token', async () => {
      const resetData = {
        token: 'invalid-reset-token',
        newPassword: 'NewStrongPass123!',
      };

      context.prismaService.user.findMany.mockResolvedValue([]);

      const response = await context.request
        .post('/auth/reset-password')
        .send(resetData)
        .expect(400);

      ApiTestHelpers.expectValidationError(response);
    });

    it('should return 400 for weak new password', async () => {
      const resetData = {
        token: 'valid-reset-token',
        newPassword: '123',
      };

      const response = await context.request
        .post('/auth/reset-password')
        .send(resetData)
        .expect(400);

      ApiTestHelpers.expectValidationError(response, 'password');
    });
  });

  describe('POST /auth/magic-link', () => {
    it('should send magic link for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = createMockUser({ email });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.magicLinkToken.create.mockResolvedValue({} as any);

      const response = await context.request.post('/auth/magic-link').send({ email }).expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.magicLinkToken.create).toHaveBeenCalled();
    });

    it('should handle non-existent user gracefully', async () => {
      const email = 'nonexistent@example.com';

      context.prismaService.user.findUnique.mockResolvedValue(null);

      const response = await context.request.post('/auth/magic-link').send({ email }).expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.magicLinkToken.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/verify-magic-link/:token', () => {
    it('should verify valid magic link token', async () => {
      const token = 'valid-magic-token';
      const mockUser = createMockUser();
      const mockMagicToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        email: mockUser.email,
        expiresAt: new Date(Date.now() + 900000), // 15 minutes
        user: mockUser,
      };

      context.prismaService.magicLinkToken.findFirst.mockResolvedValue(mockMagicToken);
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);

      const response = await context.request.get(`/auth/verify-magic-link/${token}`).expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
    });

    it('should return 401 for invalid magic link token', async () => {
      const token = 'invalid-magic-token';

      context.prismaService.magicLinkToken.findFirst.mockResolvedValue(null);

      const response = await context.request.get(`/auth/verify-magic-link/${token}`).expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });
  });

  describe('POST /auth/regenerate-api-key', () => {
    it('should regenerate API key for authenticated user', async () => {
      const mockUser = createMockUser();
      const token = 'valid-jwt-token';

      context.prismaService.user.update.mockResolvedValue(mockUser);

      const response = await context.request
        .post('/auth/regenerate-api-key')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('apiKey');
      expect(context.prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          apiKey: expect.any(String),
          apiKeyUpdatedAt: expect.any(Date),
        },
      });
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await context.request.post('/auth/regenerate-api-key').expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });
  });

  describe('DELETE /auth/revoke-api-key', () => {
    it('should revoke API key for authenticated user', async () => {
      const mockUser = createMockUser({ apiKey: null });
      const token = 'valid-jwt-token';

      context.prismaService.user.update.mockResolvedValue(mockUser);

      const response = await context.request
        .delete('/auth/revoke-api-key')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.apiKey).toBeNull();
      expect(context.prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { apiKey: null },
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const signupData = TestDataBuilder.validSignupData();

      // Make multiple requests quickly
      const requests = Array.from({ length: 10 }, () =>
        context.request.post('/auth/signup').send(signupData),
      );

      const responses = await Promise.all(requests);

      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    it('should validate email format in all endpoints', async () => {
      const invalidEmail = 'not-an-email';

      const signupResponse = await context.request
        .post('/auth/signup')
        .send({ email: invalidEmail, password: 'StrongPass123!' })
        .expect(400);

      const signinResponse = await context.request
        .post('/auth/signin')
        .send({ email: invalidEmail, password: 'password' })
        .expect(400);

      const forgotResponse = await context.request
        .post('/auth/forgot-password')
        .send({ email: invalidEmail })
        .expect(400);

      [signupResponse, signinResponse, forgotResponse].forEach(response => {
        ApiTestHelpers.expectValidationError(response, 'email');
      });
    });

    it('should validate password strength in signup and reset', async () => {
      const weakPassword = '123';

      const signupResponse = await context.request
        .post('/auth/signup')
        .send({ email: 'test@example.com', password: weakPassword })
        .expect(400);

      const resetResponse = await context.request
        .post('/auth/reset-password')
        .send({ token: 'token', newPassword: weakPassword })
        .expect(400);

      [signupResponse, resetResponse].forEach(response => {
        ApiTestHelpers.expectValidationError(response, 'password');
      });
    });

    it('should sanitize input data', async () => {
      const maliciousData = {
        email: 'test@example.com<script>alert("xss")</script>',
        username: 'user<script>alert("xss")</script>',
        password: 'StrongPass123!',
      };

      const mockUser = createMockUser();
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const response = await context.request.post('/auth/signup').send(maliciousData).expect(201);

      // Should not contain script tags
      expect(response.body.user.email).not.toContain('<script>');
      expect(response.body.user.username).not.toContain('<script>');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await context.request
        .post('/auth/signin')
        .send(TestDataBuilder.validSigninData());

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const signupData = TestDataBuilder.validSignupData();

      context.prismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = await context.request.post('/auth/signup').send(signupData).expect(500);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).not.toContain('Database connection failed'); // Should not expose internal errors
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await context.request
        .post('/auth/signup')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });
});
