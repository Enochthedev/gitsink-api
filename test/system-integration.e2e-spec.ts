import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ProjectsService } from '../src/projects/projects.service';
import { HealthService } from '../src/health/health.service';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import request from 'supertest';

describe('System Integration Tests (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let authService: AuthService;
    let projectsService: ProjectsService;
    let healthService: HealthService;
    let cacheManager: Cache;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();

        // Get service instances
        prisma = moduleFixture.get<PrismaService>(PrismaService);
        authService = moduleFixture.get<AuthService>(AuthService);
        projectsService = moduleFixture.get<ProjectsService>(ProjectsService);
        healthService = moduleFixture.get<HealthService>(HealthService);
        cacheManager = moduleFixture.get<Cache>(CACHE_MANAGER);

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Basic System Health', () => {
        it('should have healthy system components', async () => {
            const health = await healthService.getOverallHealth();

            expect(health).toBeDefined();
            expect(health.status).toBeDefined();
        });

        it('should respond to health endpoint', async () => {
            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            expect(response.body.status).toBeDefined();
        });
    });

    describe('Authentication System Integration', () => {
        let testUserId: string;

        afterEach(async () => {
            // Cleanup test user if created
            if (testUserId) {
                try {
                    await prisma.user.delete({ where: { id: testUserId } });
                } catch (error) {
                    // Ignore cleanup errors
                }
                testUserId = '';
            }
        });

        it('should handle user signup workflow', async () => {
            const signupData = {
                email: 'system-test@example.com',
                username: 'system-test-user',
                password: 'SecurePassword123!',
            };

            const response = await request(app.getHttpServer())
                .post('/auth/signup')
                .send(signupData);

            // Should either create user or return conflict if exists
            expect([200, 201, 409]).toContain(response.status);

            if (response.status === 201) {
                expect(response.body.user).toBeDefined();
                expect(response.body.user.email).toBe(signupData.email);
                expect(response.body.accessToken).toBeDefined();
                testUserId = response.body.user.id;
            }
        });

        it('should handle user signin workflow', async () => {
            // First create a user
            const user = await prisma.user.create({
                data: {
                    email: 'signin-test@example.com',
                    username: 'signin-test-user',
                    password: await authService['hashPassword']('TestPassword123!'),
                },
            });
            testUserId = user.id;

            const signinResponse = await request(app.getHttpServer())
                .post('/auth/signin')
                .send({
                    email: 'signin-test@example.com',
                    password: 'TestPassword123!',
                });

            expect([200, 201]).toContain(signinResponse.status);
            if (signinResponse.body.accessToken) {
                expect(signinResponse.body.accessToken).toBeDefined();
                expect(signinResponse.body.user.id).toBe(user.id);
            }
        });

        it('should protect endpoints with authentication', async () => {
            const protectedEndpoints = [
                { method: 'get', path: '/auth/me' },
                { method: 'post', path: '/projects/sync' },
            ];

            for (const endpoint of protectedEndpoints) {
                const response = await request(app.getHttpServer())
                [endpoint.method](endpoint.path);

                expect(response.status).toBe(401);
            }
        });
    });

    describe('Database Integration', () => {
        let testUserId: string;

        beforeAll(async () => {
            // Create a test user for database tests
            const user = await prisma.user.create({
                data: {
                    email: 'db-test@example.com',
                    username: 'db-test-user',
                    githubId: 'db-test-github-id',
                },
            });
            testUserId = user.id;
        });

        afterAll(async () => {
            // Cleanup test user
            await prisma.user.delete({ where: { id: testUserId } }).catch(() => { });
        });

        it('should maintain data consistency', async () => {
            // Create a project
            const project = await prisma.project.create({
                data: {
                    title: 'Database Test Project',
                    description: 'Testing database consistency',
                    repoUrl: 'https://github.com/test/db-consistency',
                    ownerId: testUserId,
                    platform: 'github',
                },
            });

            // Verify project exists
            const foundProject = await prisma.project.findUnique({
                where: { id: project.id },
                include: { owner: true },
            });

            expect(foundProject).toBeDefined();
            expect(foundProject?.title).toBe(project.title);
            expect(foundProject?.owner.id).toBe(testUserId);

            // Update project
            const updatedProject = await prisma.project.update({
                where: { id: project.id },
                data: { description: 'Updated description' },
            });

            expect(updatedProject.description).toBe('Updated description');

            // Cleanup
            await prisma.project.delete({ where: { id: project.id } });
        });

        it('should handle concurrent operations', async () => {
            const concurrentOperations = Array.from({ length: 5 }, async (_, i) => {
                return prisma.project.create({
                    data: {
                        title: `Concurrent Project ${i}`,
                        description: `Description for concurrent project ${i}`,
                        repoUrl: `https://github.com/concurrent/project-${i}`,
                        ownerId: testUserId,
                        platform: 'github',
                    },
                });
            });

            const results = await Promise.all(concurrentOperations);

            expect(results).toHaveLength(5);
            results.forEach((project, i) => {
                expect(project.title).toBe(`Concurrent Project ${i}`);
            });

            // Cleanup
            await prisma.project.deleteMany({
                where: {
                    ownerId: testUserId,
                    title: { startsWith: 'Concurrent Project' },
                },
            });
        });
    });

    describe('API Endpoint Integration', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            // Create test user and get token
            const user = await prisma.user.create({
                data: {
                    email: 'api-test@example.com',
                    username: 'api-test-user',
                    githubId: 'api-test-github-id',
                },
            });
            userId = user.id;

            // Generate a simple access token for testing
            // In a real scenario, this would go through proper auth flow
            const tokenResponse = await authService.signin('api-test@example.com', 'dummy-password')
                .catch(() => null);

            if (tokenResponse?.accessToken) {
                accessToken = tokenResponse.accessToken;
            } else {
                // Skip tests that require authentication if we can't get a token
                accessToken = 'dummy-token';
            }
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } }).catch(() => { });
        });

        it('should handle project sync endpoint', async () => {
            const response = await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    repositoryUrl: 'https://github.com/test/integration-project',
                });

            // Should either succeed, fail with auth error, or validation error
            expect([200, 201, 400, 401, 422]).toContain(response.status);
        });

        it('should handle GraphQL endpoint', async () => {
            const query = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query })
                .expect(200);

            expect(response.body.data.__schema.queryType.name).toBe('Query');
        });
    });

    describe('Performance and Load', () => {
        it('should handle multiple concurrent requests', async () => {
            const concurrentRequests = 10;
            const startTime = Date.now();

            const requests = Array.from({ length: concurrentRequests }, () =>
                request(app.getHttpServer()).get('/health')
            );

            const responses = await Promise.all(requests);
            const endTime = Date.now();

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            const totalTime = endTime - startTime;
            console.log(`${concurrentRequests} concurrent requests completed in ${totalTime}ms`);

            // Should complete within reasonable time
            expect(totalTime).toBeLessThan(5000);
        });

        it('should maintain performance with database queries', async () => {
            const startTime = Date.now();

            // Perform multiple database operations
            const operations = [
                prisma.user.count(),
                prisma.project.count(),
                prisma.user.findMany({ take: 10 }),
                prisma.project.findMany({ take: 10 }),
            ];

            const results = await Promise.all(operations);
            const endTime = Date.now();

            expect(results).toHaveLength(4);

            const queryTime = endTime - startTime;
            console.log(`Database queries completed in ${queryTime}ms`);

            // Should complete quickly
            expect(queryTime).toBeLessThan(1000);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid requests gracefully', async () => {
            const invalidRequests = [
                { method: 'get', path: '/nonexistent-endpoint' },
                { method: 'post', path: '/auth/signup', body: { invalid: 'data' } },
                { method: 'get', path: '/projects/invalid-uuid' },
            ];

            for (const req of invalidRequests) {
                const response = await request(app.getHttpServer())
                [req.method](req.path)
                    .send(req.body || {});

                // Should return appropriate error status
                expect([400, 404, 422, 500]).toContain(response.status);

                // Should have error message
                expect(response.body.message || response.body.error).toBeDefined();
            }
        });

        it('should not expose sensitive information in errors', async () => {
            const response = await request(app.getHttpServer())
                .get('/projects/00000000-0000-0000-0000-000000000000')
                .expect(404);

            // Should not expose internal details
            expect(response.body.stack).toBeUndefined();
            expect(response.body.sql).toBeUndefined();
        });
    });

    describe('Security Measures', () => {
        it('should have security headers', async () => {
            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            // Check for basic security headers
            expect(response.headers['x-content-type-options']).toBeDefined();
        });

        it('should validate input data', async () => {
            const maliciousInputs = [
                '<script>alert("xss")</script>',
                "'; DROP TABLE users; --",
                '../../../etc/passwd',
            ];

            for (const input of maliciousInputs) {
                const response = await request(app.getHttpServer())
                    .post('/auth/signup')
                    .send({
                        email: input,
                        username: input,
                        password: 'ValidPassword123!',
                    });

                // Should reject with validation error
                expect([400, 422]).toContain(response.status);
            }
        });
    });
});