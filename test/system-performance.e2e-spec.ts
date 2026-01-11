import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import request from 'supertest';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('System Performance Tests (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let cacheManager: Cache;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        prisma = moduleFixture.get<PrismaService>(PrismaService);
        cacheManager = moduleFixture.get<Cache>(CACHE_MANAGER);

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('API Response Time Performance', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'perf-test@example.com',
                    username: 'perf-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;

            // Create test data for performance testing
            await createPerformanceTestData(userId);
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should respond to project listing within performance thresholds', async () => {
            const iterations = 10;
            const responseTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();

                const response = await request(app.getHttpServer())
                    .get('/projects')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .query({ limit: 20, offset: 0 })
                    .expect(200);

                const endTime = Date.now();
                const responseTime = endTime - startTime;
                responseTimes.push(responseTime);

                expect(response.body.projects).toBeDefined();
            }

            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            const maxResponseTime = Math.max(...responseTimes);

            console.log(`Average response time: ${averageResponseTime}ms`);
            console.log(`Max response time: ${maxResponseTime}ms`);

            // Performance assertions
            expect(averageResponseTime).toBeLessThan(500); // 500ms average
            expect(maxResponseTime).toBeLessThan(1000); // 1s max
        });

        it('should handle concurrent requests efficiently', async () => {
            const concurrentRequests = 20;
            const startTime = Date.now();

            const requests = Array.from({ length: concurrentRequests }, () =>
                request(app.getHttpServer())
                    .get('/projects')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .query({ limit: 10 })
            );

            const responses = await Promise.all(requests);
            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            console.log(`${concurrentRequests} concurrent requests completed in ${totalTime}ms`);

            // Should handle concurrent requests efficiently
            expect(totalTime).toBeLessThan(5000); // 5 seconds for 20 concurrent requests
        });

        it('should maintain performance with large datasets', async () => {
            // Test with pagination through large dataset
            const pageSize = 50;
            const totalPages = 10;
            const responseTimes: number[] = [];

            for (let page = 0; page < totalPages; page++) {
                const startTime = Date.now();

                const response = await request(app.getHttpServer())
                    .get('/projects')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .query({
                        limit: pageSize,
                        offset: page * pageSize,
                        sort: 'createdAt',
                        order: 'desc'
                    })
                    .expect(200);

                const endTime = Date.now();
                responseTimes.push(endTime - startTime);

                expect(response.body.projects.length).toBeLessThanOrEqual(pageSize);
            }

            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

            console.log(`Average pagination response time: ${averageResponseTime}ms`);

            // Pagination should remain fast even with large datasets
            expect(averageResponseTime).toBeLessThan(300);
        });

        it('should efficiently handle complex GraphQL queries', async () => {
            const complexQuery = `
        query GetProjectsWithRelations($userId: ID!) {
          user(id: $userId) {
            id
            username
            projects(first: 20) {
              edges {
                node {
                  id
                  title
                  description
                  language
                  tags
                  category
                  aiAnalysis {
                    technologies
                    description
                    confidence
                  }
                  syncHistory(first: 5) {
                    edges {
                      node {
                        id
                        operation
                        status
                        createdAt
                      }
                    }
                  }
                }
              }
            }
            publicProfile {
              id
              displayName
              bio
              theme
            }
          }
        }
      `;

            const iterations = 5;
            const responseTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();

                const response = await request(app.getHttpServer())
                    .post('/graphql')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        query: complexQuery,
                        variables: { userId }
                    })
                    .expect(200);

                const endTime = Date.now();
                responseTimes.push(endTime - startTime);

                expect(response.body.data.user).toBeDefined();
            }

            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

            console.log(`Average complex GraphQL query time: ${averageResponseTime}ms`);

            // Complex queries should still be reasonably fast
            expect(averageResponseTime).toBeLessThan(800);
        });
    });

    describe('Database Performance', () => {
        let userId: string;

        beforeAll(async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'db-perf-test@example.com',
                    username: 'db-perf-test-user',
                    githubId: 'db-perf-github-id',
                },
            });
            userId = user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should perform bulk operations efficiently', async () => {
            const batchSize = 100;
            const startTime = Date.now();

            // Bulk create projects
            const projectData = Array.from({ length: batchSize }, (_, i) => ({
                title: `Bulk Project ${i}`,
                description: `Description for bulk project ${i}`,
                repoUrl: `https://github.com/bulk/project-${i}`,
                ownerId: userId,
                platform: 'github' as const,
                language: i % 2 === 0 ? 'JavaScript' : 'TypeScript',
                tags: [`tag-${i % 5}`, `category-${i % 3}`],
            }));

            await prisma.project.createMany({
                data: projectData,
            });

            const endTime = Date.now();
            const bulkCreateTime = endTime - startTime;

            console.log(`Bulk created ${batchSize} projects in ${bulkCreateTime}ms`);

            // Bulk operations should be efficient
            expect(bulkCreateTime).toBeLessThan(2000); // 2 seconds for 100 records

            // Test bulk query performance
            const queryStartTime = Date.now();

            const projects = await prisma.project.findMany({
                where: { ownerId: userId },
                include: { owner: true },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });

            const queryEndTime = Date.now();
            const queryTime = queryEndTime - queryStartTime;

            console.log(`Queried ${projects.length} projects with relations in ${queryTime}ms`);

            expect(queryTime).toBeLessThan(500); // 500ms for complex query
            expect(projects.length).toBe(50);
        });

        it('should handle complex aggregation queries efficiently', async () => {
            const startTime = Date.now();

            // Complex aggregation query
            const stats = await prisma.project.groupBy({
                by: ['language', 'category'],
                where: { ownerId: userId },
                _count: {
                    id: true,
                },
                _avg: {
                    starCount: true,
                },
                orderBy: {
                    _count: {
                        id: 'desc',
                    },
                },
            });

            const endTime = Date.now();
            const aggregationTime = endTime - startTime;

            console.log(`Aggregation query completed in ${aggregationTime}ms`);

            expect(aggregationTime).toBeLessThan(300);
            expect(stats).toBeDefined();
        });

        it('should maintain performance with concurrent database operations', async () => {
            const concurrentOperations = 10;
            const startTime = Date.now();

            const operations = Array.from({ length: concurrentOperations }, async (_, i) => {
                // Mix of read and write operations
                if (i % 2 === 0) {
                    // Read operation
                    return prisma.project.findMany({
                        where: { ownerId: userId },
                        take: 10,
                        skip: i * 10,
                    });
                } else {
                    // Write operation
                    return prisma.project.create({
                        data: {
                            title: `Concurrent Project ${i}`,
                            description: `Description for concurrent project ${i}`,
                            repoUrl: `https://github.com/concurrent/project-${i}`,
                            ownerId: userId,
                            platform: 'github',
                        },
                    });
                }
            });

            const results = await Promise.all(operations);
            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.log(`${concurrentOperations} concurrent DB operations completed in ${totalTime}ms`);

            expect(totalTime).toBeLessThan(2000);
            expect(results).toHaveLength(concurrentOperations);
        });
    });

    describe('Cache Performance', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'cache-perf-test@example.com',
                    username: 'cache-perf-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should demonstrate cache performance improvements', async () => {
            const endpoint = '/projects';
            const iterations = 5;

            // First request (cache miss)
            const firstRequestStart = Date.now();
            const firstResponse = await request(app.getHttpServer())
                .get(endpoint)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
            const firstRequestTime = Date.now() - firstRequestStart;

            // Subsequent requests (cache hits)
            const cachedRequestTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();

                const response = await request(app.getHttpServer())
                    .get(endpoint)
                    .set('Authorization', `Bearer ${accessToken}`)
                    .expect(200);

                const endTime = Date.now();
                cachedRequestTimes.push(endTime - startTime);

                // Verify same data is returned
                expect(response.body.projects.length).toBe(firstResponse.body.projects.length);
            }

            const averageCachedTime = cachedRequestTimes.reduce((a, b) => a + b, 0) / cachedRequestTimes.length;

            console.log(`First request (cache miss): ${firstRequestTime}ms`);
            console.log(`Average cached request: ${averageCachedTime}ms`);

            // Cached requests should be significantly faster
            expect(averageCachedTime).toBeLessThan(firstRequestTime * 0.5);
        });

        it('should handle cache invalidation efficiently', async () => {
            // Get initial cached data
            const initialResponse = await request(app.getHttpServer())
                .get('/projects')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            const initialCount = initialResponse.body.projects.length;

            // Create new project (should invalidate cache)
            const createStart = Date.now();

            await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    repositoryUrl: 'https://github.com/test/cache-invalidation-test',
                })
                .expect(201);

            const createTime = Date.now() - createStart;

            // Verify cache was invalidated and new data is returned
            const updatedResponse = await request(app.getHttpServer())
                .get('/projects')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(updatedResponse.body.projects.length).toBe(initialCount + 1);

            console.log(`Cache invalidation and update completed in ${createTime}ms`);

            // Cache invalidation should be fast
            expect(createTime).toBeLessThan(2000);
        });
    });

    describe('Memory and Resource Usage', () => {
        it('should not have memory leaks during extended operations', async () => {
            const initialMemory = process.memoryUsage();

            // Perform many operations
            const operations = 100;
            const users: any[] = [];

            try {
                for (let i = 0; i < operations; i++) {
                    const user = await prisma.user.create({
                        data: {
                            email: `memory-test-${i}@example.com`,
                            username: `memory-test-${i}`,
                            githubId: `memory-test-github-${i}`,
                        },
                    });
                    users.push(user);

                    // Create some projects for each user
                    await prisma.project.createMany({
                        data: Array.from({ length: 5 }, (_, j) => ({
                            title: `Memory Test Project ${i}-${j}`,
                            description: `Description for memory test project ${i}-${j}`,
                            repoUrl: `https://github.com/memory-test-${i}/project-${j}`,
                            ownerId: user.id,
                            platform: 'github' as const,
                        })),
                    });

                    // Periodically check memory usage
                    if (i % 20 === 0) {
                        const currentMemory = process.memoryUsage();
                        const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
                        console.log(`Memory increase after ${i} operations: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
                    }
                }

                const finalMemory = process.memoryUsage();
                const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

                console.log(`Total memory increase: ${Math.round(totalMemoryIncrease / 1024 / 1024)}MB`);

                // Memory increase should be reasonable (less than 100MB for this test)
                expect(totalMemoryIncrease).toBeLessThan(100 * 1024 * 1024);

            } finally {
                // Cleanup
                for (const user of users) {
                    await prisma.user.delete({ where: { id: user.id } });
                }
            }
        });
    });

    // Helper function to create performance test data
    async function createPerformanceTestData(userId: string) {
        // Create a reasonable amount of test data
        const projectCount = 50;

        const projects = Array.from({ length: projectCount }, (_, i) => ({
            title: `Performance Test Project ${i}`,
            description: `Description for performance test project ${i}`,
            repoUrl: `https://github.com/perf-test/project-${i}`,
            ownerId: userId,
            platform: 'github' as const,
            language: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go'][i % 5],
            tags: [`tag-${i % 10}`, `category-${i % 5}`],
            category: ['web', 'mobile', 'desktop', 'library', 'tool'][i % 5],
            starCount: Math.floor(Math.random() * 1000),
            forkCount: Math.floor(Math.random() * 100),
        }));

        await prisma.project.createMany({
            data: projects,
        });

        // Create public profile
        await prisma.publicProfile.create({
            data: {
                userId,
                username: 'perf-test-user',
                displayName: 'Performance Test User',
                bio: 'A user for performance testing',
                isPublic: true,
                theme: { primaryColor: '#007bff' },
                settings: { showStats: true },
            },
        });

        console.log(`Created ${projectCount} test projects for performance testing`);
    }
});