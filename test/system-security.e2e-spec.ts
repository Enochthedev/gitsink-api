import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import request from 'supertest';

describe('System Security Tests (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        prisma = moduleFixture.get<PrismaService>(PrismaService);

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Authentication Security', () => {
        it('should reject requests without authentication', async () => {
            const protectedEndpoints = [
                { method: 'get', path: '/projects' },
                { method: 'post', path: '/projects/sync' },
                { method: 'get', path: '/profiles/me' },
                { method: 'post', path: '/profiles/public' },
                { method: 'get', path: '/audit/trail' },
                { method: 'patch', path: '/projects/123' },
                { method: 'delete', path: '/projects/123' },
            ];

            for (const endpoint of protectedEndpoints) {
                const response = await request(app.getHttpServer())
                [endpoint.method](endpoint.path)
                    .expect(401);

                expect(response.body.message).toMatch(/unauthorized|authentication/i);
            }
        });

        it('should reject invalid JWT tokens', async () => {
            const invalidTokens = [
                'invalid-token',
                'Bearer invalid-token',
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
                'Bearer expired-token',
                '',
            ];

            for (const token of invalidTokens) {
                const response = await request(app.getHttpServer())
                    .get('/projects')
                    .set('Authorization', token)
                    .expect(401);

                expect(response.body.message).toMatch(/unauthorized|invalid|token/i);
            }
        });

        it('should reject invalid API keys', async () => {
            const invalidApiKeys = [
                'invalid-api-key',
                'sk_test_invalid',
                '12345',
                'a'.repeat(100), // Too long
                '', // Empty
            ];

            for (const apiKey of invalidApiKeys) {
                const response = await request(app.getHttpServer())
                    .get('/projects')
                    .set('X-API-Key', apiKey)
                    .expect(401);

                expect(response.body.message).toMatch(/unauthorized|invalid|api key/i);
            }
        });

        it('should prevent timing attacks on authentication', async () => {
            const validEmail = 'security-test@example.com';
            const invalidEmail = 'nonexistent@example.com';
            const password = 'TestPassword123!';

            // Create a test user
            await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: validEmail,
                    username: 'security-test-user',
                    password,
                })
                .expect(201);

            // Measure response times for valid vs invalid emails
            const validEmailTimes: number[] = [];
            const invalidEmailTimes: number[] = [];

            for (let i = 0; i < 10; i++) {
                // Valid email, wrong password
                const validStart = Date.now();
                await request(app.getHttpServer())
                    .post('/auth/login')
                    .send({
                        email: validEmail,
                        password: 'wrongpassword',
                    });
                validEmailTimes.push(Date.now() - validStart);

                // Invalid email
                const invalidStart = Date.now();
                await request(app.getHttpServer())
                    .post('/auth/login')
                    .send({
                        email: invalidEmail,
                        password: 'wrongpassword',
                    });
                invalidEmailTimes.push(Date.now() - invalidStart);
            }

            const avgValidTime = validEmailTimes.reduce((a, b) => a + b, 0) / validEmailTimes.length;
            const avgInvalidTime = invalidEmailTimes.reduce((a, b) => a + b, 0) / invalidEmailTimes.length;

            // Response times should be similar to prevent timing attacks
            const timeDifference = Math.abs(avgValidTime - avgInvalidTime);
            expect(timeDifference).toBeLessThan(50); // Less than 50ms difference

            // Cleanup
            await prisma.user.delete({ where: { email: validEmail } });
        });
    });

    describe('Authorization Security', () => {
        let user1Token: string;
        let user2Token: string;
        let user1Id: string;
        let user2Id: string;
        let user1ProjectId: string;

        beforeAll(async () => {
            // Create two test users
            const user1Response = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'authz-user1@example.com',
                    username: 'authz-user1',
                    password: 'SecurePassword123!',
                });

            const user2Response = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'authz-user2@example.com',
                    username: 'authz-user2',
                    password: 'SecurePassword123!',
                });

            user1Token = user1Response.body.accessToken;
            user2Token = user2Response.body.accessToken;
            user1Id = user1Response.body.user.id;
            user2Id = user2Response.body.user.id;

            // Create a project for user1
            const projectResponse = await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${user1Token}`)
                .send({
                    repositoryUrl: 'https://github.com/authz-test/user1-project',
                });

            user1ProjectId = projectResponse.body.project.id;
        });

        afterAll(async () => {
            await prisma.user.deleteMany({
                where: {
                    id: { in: [user1Id, user2Id] },
                },
            });
        });

        it('should prevent users from accessing other users\' resources', async () => {
            // User2 tries to access User1's project
            const response = await request(app.getHttpServer())
                .get(`/projects/${user1ProjectId}`)
                .set('Authorization', `Bearer ${user2Token}`)
                .expect(403);

            expect(response.body.message).toMatch(/forbidden|access denied|unauthorized/i);
        });

        it('should prevent users from modifying other users\' resources', async () => {
            // User2 tries to update User1's project
            const updateResponse = await request(app.getHttpServer())
                .patch(`/projects/${user1ProjectId}`)
                .set('Authorization', `Bearer ${user2Token}`)
                .send({
                    description: 'Malicious update attempt',
                })
                .expect(403);

            expect(updateResponse.body.message).toMatch(/forbidden|access denied|unauthorized/i);

            // User2 tries to delete User1's project
            const deleteResponse = await request(app.getHttpServer())
                .delete(`/projects/${user1ProjectId}`)
                .set('Authorization', `Bearer ${user2Token}`)
                .expect(403);

            expect(deleteResponse.body.message).toMatch(/forbidden|access denied|unauthorized/i);
        });

        it('should prevent privilege escalation attempts', async () => {
            // Try to access admin endpoints
            const adminEndpoints = [
                '/admin/users',
                '/admin/system/health',
                '/admin/metrics',
                '/admin/audit/all',
            ];

            for (const endpoint of adminEndpoints) {
                const response = await request(app.getHttpServer())
                    .get(endpoint)
                    .set('Authorization', `Bearer ${user1Token}`);

                // Should either be 403 (forbidden) or 404 (not found)
                expect([403, 404]).toContain(response.status);
            }
        });
    });

    describe('Input Validation Security', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'input-validation-test@example.com',
                    username: 'input-validation-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should prevent SQL injection attacks', async () => {
            const sqlInjectionPayloads = [
                "'; DROP TABLE users; --",
                "' OR '1'='1",
                "'; UPDATE users SET password='hacked' WHERE id=1; --",
                "' UNION SELECT * FROM users --",
                "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
            ];

            for (const payload of sqlInjectionPayloads) {
                // Test in project sync endpoint
                const response = await request(app.getHttpServer())
                    .post('/projects/sync')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        repositoryUrl: payload,
                    });

                // Should reject with validation error
                expect([400, 422]).toContain(response.status);
                expect(response.body.message).toBeDefined();
            }
        });

        it('should prevent XSS attacks', async () => {
            const xssPayloads = [
                '<script>alert("xss")</script>',
                '<img src="x" onerror="alert(1)">',
                'javascript:alert("xss")',
                '<svg onload="alert(1)">',
                '"><script>alert("xss")</script>',
            ];

            for (const payload of xssPayloads) {
                // Test in profile creation
                const response = await request(app.getHttpServer())
                    .post('/profiles/public')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        username: 'xss-test-user',
                        displayName: payload,
                        bio: payload,
                    });

                if (response.status === 201) {
                    // If created, verify the payload was sanitized
                    expect(response.body.displayName).not.toContain('<script>');
                    expect(response.body.bio).not.toContain('<script>');
                } else {
                    // Should reject with validation error
                    expect([400, 422]).toContain(response.status);
                }
            }
        });

        it('should prevent NoSQL injection attacks', async () => {
            const nosqlPayloads = [
                '{"$ne": null}',
                '{"$gt": ""}',
                '{"$where": "this.password.length > 0"}',
                '{"$regex": ".*"}',
            ];

            for (const payload of nosqlPayloads) {
                const response = await request(app.getHttpServer())
                    .get('/projects')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .query({
                        filter: payload,
                    });

                // Should handle gracefully without exposing data
                if (response.status === 200) {
                    expect(response.body.projects).toBeDefined();
                } else {
                    expect([400, 422]).toContain(response.status);
                }
            }
        });

        it('should validate file upload security', async () => {
            const maliciousFiles = [
                { filename: '../../../etc/passwd', content: 'malicious content' },
                { filename: 'test.php', content: '<?php system($_GET["cmd"]); ?>' },
                { filename: 'test.exe', content: 'MZ\x90\x00' }, // PE header
                { filename: 'test.js', content: 'require("child_process").exec("rm -rf /")' },
            ];

            for (const file of maliciousFiles) {
                // Test file upload endpoints if they exist
                const response = await request(app.getHttpServer())
                    .post('/profiles/avatar')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .attach('file', Buffer.from(file.content), file.filename);

                // Should reject malicious files
                if (response.status !== 404) { // If endpoint exists
                    expect([400, 413, 415, 422]).toContain(response.status);
                }
            }
        });
    });

    describe('Rate Limiting Security', () => {
        it('should enforce rate limits on authentication endpoints', async () => {
            const endpoint = '/auth/login';
            const requests: any[] = [];

            // Send many requests quickly
            for (let i = 0; i < 25; i++) {
                requests.push(
                    request(app.getHttpServer())
                        .post(endpoint)
                        .send({
                            email: 'rate-limit-test@example.com',
                            password: 'wrongpassword',
                        })
                );
            }

            const responses = await Promise.all(requests);

            // Some requests should be rate limited
            const rateLimitedResponses = responses.filter((r: any) => r.status === 429);
            expect(rateLimitedResponses.length).toBeGreaterThan(0);

            // Rate limit headers should be present
            const rateLimitedResponse = rateLimitedResponses[0];
            expect(rateLimitedResponse.headers['x-ratelimit-limit']).toBeDefined();
            expect(rateLimitedResponse.headers['x-ratelimit-remaining']).toBeDefined();
        });

        it('should enforce rate limits on API endpoints', async () => {
            // Create a test user first
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'api-rate-limit-test@example.com',
                    username: 'api-rate-limit-user',
                    password: 'SecurePassword123!',
                });

            const accessToken = signupResponse.body.accessToken;
            const userId = signupResponse.body.user.id;

            try {
                const endpoint = '/projects';
                const requests: any[] = [];

                // Send many requests quickly
                for (let i = 0; i < 50; i++) {
                    requests.push(
                        request(app.getHttpServer())
                            .get(endpoint)
                            .set('Authorization', `Bearer ${accessToken}`)
                    );
                }

                const responses = await Promise.all(requests);

                // Some requests should be rate limited
                const rateLimitedResponses = responses.filter((r: any) => r.status === 429);
                expect(rateLimitedResponses.length).toBeGreaterThan(0);

            } finally {
                await prisma.user.delete({ where: { id: userId } });
            }
        });
    });

    describe('Data Protection Security', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'data-protection-test@example.com',
                    username: 'data-protection-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should not expose sensitive data in API responses', async () => {
            const response = await request(app.getHttpServer())
                .get('/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            // Should not expose sensitive fields
            expect(response.body.password).toBeUndefined();
            expect(response.body.apiKey).toBeUndefined();
            expect(response.body.githubToken).toBeUndefined();
            expect(response.body.refreshToken).toBeUndefined();

            // Should expose safe fields
            expect(response.body.id).toBeDefined();
            expect(response.body.email).toBeDefined();
            expect(response.body.username).toBeDefined();
        });

        it('should protect against information disclosure', async () => {
            // Try to access non-existent resources
            const nonExistentId = '00000000-0000-0000-0000-000000000000';

            const response = await request(app.getHttpServer())
                .get(`/projects/${nonExistentId}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);

            // Should not reveal whether resource exists or user lacks permission
            expect(response.body.message).toMatch(/not found/i);
            expect(response.body.message).not.toMatch(/unauthorized|forbidden/i);
        });

        it('should handle error responses securely', async () => {
            // Trigger various error conditions
            const errorTests = [
                {
                    endpoint: '/projects/invalid-uuid',
                    expectedStatus: 400,
                },
                {
                    endpoint: '/projects/sync',
                    method: 'post',
                    body: { repoUrl: 'invalid-url' },
                    expectedStatus: 422,
                },
            ];

            for (const test of errorTests) {
                const method = test.method || 'get';
                let request_builder = request(app.getHttpServer())[method](test.endpoint)
                    .set('Authorization', `Bearer ${accessToken}`);

                if (test.body) {
                    request_builder = request_builder.send(test.body);
                }

                const response = await request_builder.expect(test.expectedStatus);

                // Error responses should not expose internal details
                expect(response.body.message).toBeDefined();
                expect(response.body.stack).toBeUndefined();
                expect(response.body.sql).toBeUndefined();
                expect(response.body.query).toBeUndefined();
            }
        });
    });

    describe('Session Security', () => {
        it('should invalidate sessions on logout', async () => {
            // Create user and login
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'session-test@example.com',
                    username: 'session-test-user',
                    password: 'SecurePassword123!',
                });

            const accessToken = signupResponse.body.accessToken;
            const userId = signupResponse.body.user.id;

            try {
                // Verify token works
                await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(200);

                // Logout
                await request(app.getHttpServer())
                    .post('/auth/logout')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(200);

                // Verify token is invalidated
                await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(401);

            } finally {
                await prisma.user.delete({ where: { id: userId } });
            }
        });

        it('should handle concurrent session security', async () => {
            // Test multiple sessions for same user
            const loginData = {
                email: 'concurrent-session-test@example.com',
                username: 'concurrent-session-user',
                password: 'SecurePassword123!',
            };

            // Create user
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send(loginData);

            const userId = signupResponse.body.user.id;

            try {
                // Create multiple sessions
                const sessions = await Promise.all([
                    request(app.getHttpServer())
                        .post('/auth/login')
                        .send({
                            email: loginData.email,
                            password: loginData.password,
                        }),
                    request(app.getHttpServer())
                        .post('/auth/login')
                        .send({
                            email: loginData.email,
                            password: loginData.password,
                        }),
                ]);

                const token1 = sessions[0].body.accessToken;
                const token2 = sessions[1].body.accessToken;

                // Both tokens should work initially
                await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${token1}`)
                    .expect(200);

                await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${token2}`)
                    .expect(200);

                // Logout from one session
                await request(app.getHttpServer())
                    .post('/auth/logout')
                    .set('Authorization', `Bearer ${token1}`)
                    .expect(200);

                // First token should be invalidated
                await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${token1}`)
                    .expect(401);

                // Second token should still work (unless using single session policy)
                const secondTokenResponse = await request(app.getHttpServer())
                    .get('/auth/me')
                    .set('Authorization', `Bearer ${token2}`);

                expect([200, 401]).toContain(secondTokenResponse.status);

            } finally {
                await prisma.user.delete({ where: { id: userId } });
            }
        });
    });

    describe('HTTPS and Transport Security', () => {
        it('should enforce secure headers', async () => {
            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            // Check for security headers
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBeDefined();
            expect(response.headers['x-xss-protection']).toBeDefined();

            // Should not expose server information
            expect(response.headers['server']).toBeUndefined();
            expect(response.headers['x-powered-by']).toBeUndefined();
        });

        it('should handle CORS securely', async () => {
            const response = await request(app.getHttpServer())
                .options('/projects')
                .set('Origin', 'https://malicious-site.com')
                .expect(200);

            // CORS headers should be restrictive
            const allowedOrigins = response.headers['access-control-allow-origin'];
            if (allowedOrigins) {
                expect(allowedOrigins).not.toBe('*');
            }
        });
    });
});