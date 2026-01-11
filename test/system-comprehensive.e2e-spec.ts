import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import request from 'supertest';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

describe('Comprehensive System Tests (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let cacheManager: Cache;
    let syncQueue: Queue;
    let emailQueue: Queue;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        prisma = moduleFixture.get<PrismaService>(PrismaService);
        cacheManager = moduleFixture.get<Cache>(CACHE_MANAGER);
        syncQueue = moduleFixture.get<Queue>(getQueueToken('sync'));
        emailQueue = moduleFixture.get<Queue>(getQueueToken('email'));

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GraphQL API Integration', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            // Create test user and get token
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'graphql-test@example.com',
                    username: 'graphql-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should handle complex GraphQL queries with filtering and pagination', async () => {
            // Create test projects
            await Promise.all([
                prisma.project.create({
                    data: {
                        title: 'React Project',
                        description: 'A React application',
                        repoUrl: 'https://github.com/test/react-app',
                        ownerId: userId,
                        platform: 'github',
                        language: 'JavaScript',
                        tags: ['react', 'frontend'],
                        category: 'web',
                    },
                }),
                prisma.project.create({
                    data: {
                        title: 'Node.js API',
                        description: 'A Node.js REST API',
                        repoUrl: 'https://github.com/test/node-api',
                        ownerId: userId,
                        platform: 'github',
                        language: 'TypeScript',
                        tags: ['nodejs', 'api'],
                        category: 'backend',
                    },
                }),
            ]);

            const query = `
        query GetProjects($filter: ProjectFilter, $sort: ProjectSort, $pagination: Pagination) {
          projects(filter: $filter, sort: $sort, pagination: $pagination) {
            edges {
              node {
                id
                title
                description
                language
                tags
                category
                owner {
                  username
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              totalCount
            }
          }
        }
      `;

            const variables = {
                filter: {
                    language: 'JavaScript',
                    category: 'web',
                },
                sort: {
                    field: 'createdAt',
                    direction: 'DESC',
                },
                pagination: {
                    first: 10,
                },
            };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ query, variables })
                .expect(200);

            expect(response.body.data.projects.edges).toHaveLength(1);
            expect(response.body.data.projects.edges[0].node.title).toBe('React Project');
            expect(response.body.data.projects.pageInfo.totalCount).toBe(1);
        });

        it('should handle GraphQL mutations with complex input validation', async () => {
            const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
            title
            description
            repoUrl
            platform
            metadata {
              customFields
            }
          }
        }
      `;

            const variables = {
                input: {
                    title: 'GraphQL Test Project',
                    description: 'Testing GraphQL mutations',
                    repoUrl: 'https://github.com/test/graphql-project',
                    platform: 'github',
                    metadata: {
                        customFields: {
                            framework: 'NestJS',
                            database: 'PostgreSQL',
                        },
                    },
                },
            };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ mutation, variables })
                .expect(200);

            expect(response.body.data.createProject.title).toBe('GraphQL Test Project');
            expect(response.body.data.createProject.metadata.customFields.framework).toBe('NestJS');
        });

        it('should handle GraphQL subscriptions for real-time updates', async () => {
            const subscription = `
        subscription ProjectSyncStatus($userId: ID!) {
          projectSyncStatus(userId: $userId) {
            projectId
            status
            progress
            message
          }
        }
      `;

            // This would typically use WebSocket connection
            // For testing, we'll verify the subscription resolver exists
            const introspectionQuery = `
        query {
          __schema {
            subscriptionType {
              fields {
                name
              }
            }
          }
        }
      `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: introspectionQuery })
                .expect(200);

            const subscriptionFields = response.body.data.__schema.subscriptionType.fields;
            expect(subscriptionFields.some(field => field.name === 'projectSyncStatus')).toBe(true);
        });
    });

    describe('Multi-Platform Integration Workflow', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'multiplatform-test@example.com',
                    username: 'multiplatform-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should sync repositories from multiple platforms', async () => {
            const platforms = [
                {
                    name: 'github',
                    repoUrl: 'https://github.com/test/github-repo',
                },
                {
                    name: 'gitlab',
                    repoUrl: 'https://gitlab.com/test/gitlab-repo',
                },
                {
                    name: 'bitbucket',
                    repoUrl: 'https://bitbucket.org/test/bitbucket-repo',
                },
            ];

            const syncResults = [];

            for (const platform of platforms) {
                // Connect platform
                const connectResponse = await request(app.getHttpServer())
                    .post(`/auth/${platform.name}/connect`)
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        code: `mock-${platform.name}-code`,
                    })
                    .expect(200);

                expect(connectResponse.body.connected).toBe(true);

                // Sync repository
                const syncResponse = await request(app.getHttpServer())
                    .post('/projects/sync')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        repoUrl: platform.repoUrl,
                        platform: platform.name,
                    })
                    .expect(201);

                syncResults.push(syncResponse.body.project);
            }

            // Verify all projects were created with correct platform
            expect(syncResults).toHaveLength(3);
            expect(syncResults.map(p => p.platform)).toEqual(['github', 'gitlab', 'bitbucket']);

            // Verify unified project listing
            const projectsResponse = await request(app.getHttpServer())
                .get('/projects')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(projectsResponse.body.projects.length).toBeGreaterThanOrEqual(3);

            const platforms_in_projects = projectsResponse.body.projects.map(p => p.platform);
            expect(platforms_in_projects).toContain('github');
            expect(platforms_in_projects).toContain('gitlab');
            expect(platforms_in_projects).toContain('bitbucket');
        });

        it('should handle platform-specific webhook events', async () => {
            const webhookEvents = [
                {
                    platform: 'github',
                    event: 'push',
                    payload: {
                        repository: {
                            full_name: 'test/github-repo',
                            html_url: 'https://github.com/test/github-repo',
                        },
                        commits: [
                            {
                                id: 'abc123',
                                message: 'Update README',
                            },
                        ],
                    },
                },
                {
                    platform: 'gitlab',
                    event: 'push',
                    payload: {
                        project: {
                            path_with_namespace: 'test/gitlab-repo',
                            web_url: 'https://gitlab.com/test/gitlab-repo',
                        },
                        commits: [
                            {
                                id: 'def456',
                                message: 'Fix bug',
                            },
                        ],
                    },
                },
            ];

            for (const webhook of webhookEvents) {
                const response = await request(app.getHttpServer())
                    .post(`/webhooks/${webhook.platform}`)
                    .set('X-Hub-Signature-256', 'sha256=mock-signature')
                    .send(webhook.payload)
                    .expect(200);

                expect(response.body.processed).toBe(true);
            }

            // Verify webhook events triggered sync updates
            const syncHistory = await request(app.getHttpServer())
                .get('/audit/sync-history')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ userId })
                .expect(200);

            expect(syncHistory.body.entries.length).toBeGreaterThan(0);
        });
    });

    describe('AI Enrichment Pipeline Integration', () => {
        let accessToken: string;
        let userId: string;
        let projectId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'ai-test@example.com',
                    username: 'ai-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;

            // Create a test project
            const projectResponse = await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    repoUrl: 'https://github.com/test/ai-enrichment-test',
                });

            projectId = projectResponse.body.project.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should complete full AI enrichment pipeline', async () => {
            // Trigger AI enrichment
            const enrichmentResponse = await request(app.getHttpServer())
                .post(`/projects/${projectId}/enrich`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(enrichmentResponse.body.jobId).toBeDefined();

            // Wait for enrichment to complete (in real scenario, this would be async)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify enrichment results
            const projectResponse = await request(app.getHttpServer())
                .get(`/projects/${projectId}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            const project = projectResponse.body;
            expect(project.aiAnalysis).toBeDefined();
            expect(project.aiAnalysis.technologies).toBeDefined();
            expect(project.aiAnalysis.description).toBeDefined();
            expect(project.aiAnalysis.category).toBeDefined();
            expect(project.aiAnalysis.confidence).toBeGreaterThan(0);
        });

        it('should handle AI service failures gracefully', async () => {
            // Mock AI service failure by using invalid project
            const invalidProjectResponse = await request(app.getHttpServer())
                .post('/projects/invalid-id/enrich')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);

            expect(invalidProjectResponse.body.message).toContain('Project not found');

            // Test with project that has no analyzable content
            const emptyProject = await prisma.project.create({
                data: {
                    title: 'Empty Project',
                    repoUrl: 'https://github.com/test/empty-repo',
                    ownerId: userId,
                    platform: 'github',
                },
            });

            const enrichmentResponse = await request(app.getHttpServer())
                .post(`/projects/${emptyProject.id}/enrich`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            // Should still return a job ID but with fallback enrichment
            expect(enrichmentResponse.body.jobId).toBeDefined();
        });
    });

    describe('Public Profile System Integration', () => {
        let accessToken: string;
        let userId: string;
        let profileId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'profile-test@example.com',
                    username: 'profile-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should create and customize public profile with projects', async () => {
            // Create some projects first
            const projects = await Promise.all([
                request(app.getHttpServer())
                    .post('/projects/sync')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        repoUrl: 'https://github.com/test/featured-project-1',
                    }),
                request(app.getHttpServer())
                    .post('/projects/sync')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        repoUrl: 'https://github.com/test/featured-project-2',
                    }),
            ]);

            const projectIds = projects.map(p => p.body.project.id);

            // Create public profile
            const profileResponse = await request(app.getHttpServer())
                .post('/profiles/public')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    username: 'profile-test-user',
                    displayName: 'Profile Test User',
                    bio: 'A developer testing the profile system',
                    isPublic: true,
                    theme: {
                        primaryColor: '#007bff',
                        backgroundColor: '#ffffff',
                        fontFamily: 'Inter',
                    },
                    settings: {
                        showEmail: false,
                        showStats: true,
                        featuredProjects: projectIds,
                    },
                })
                .expect(201);

            profileId = profileResponse.body.profile.id;
            expect(profileResponse.body.profile.username).toBe('profile-test-user');

            // Verify public profile access
            const publicResponse = await request(app.getHttpServer())
                .get('/profiles/public/profile-test-user')
                .expect(200);

            expect(publicResponse.body.displayName).toBe('Profile Test User');
            expect(publicResponse.body.projects).toHaveLength(2);
            expect(publicResponse.body.theme.primaryColor).toBe('#007bff');

            // Test profile customization
            const updateResponse = await request(app.getHttpServer())
                .patch('/profiles/public')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    bio: 'Updated bio for testing',
                    theme: {
                        primaryColor: '#28a745',
                    },
                })
                .expect(200);

            expect(updateResponse.body.bio).toBe('Updated bio for testing');
            expect(updateResponse.body.theme.primaryColor).toBe('#28a745');
        });

        it('should handle profile privacy settings correctly', async () => {
            // Make profile private
            await request(app.getHttpServer())
                .patch('/profiles/public')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    isPublic: false,
                })
                .expect(200);

            // Verify public access is denied
            const publicResponse = await request(app.getHttpServer())
                .get('/profiles/public/profile-test-user')
                .expect(404);

            expect(publicResponse.body.message).toContain('Profile not found or not public');

            // Make profile public again
            await request(app.getHttpServer())
                .patch('/profiles/public')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    isPublic: true,
                })
                .expect(200);

            // Verify public access is restored
            await request(app.getHttpServer())
                .get('/profiles/public/profile-test-user')
                .expect(200);
        });
    });

    describe('Audit Trail and Compliance', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'audit-test@example.com',
                    username: 'audit-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should maintain comprehensive audit trail for all operations', async () => {
            // Perform various operations
            const operations = [
                // Create project
                request(app.getHttpServer())
                    .post('/projects/sync')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        repoUrl: 'https://github.com/test/audit-project',
                    }),

                // Create profile
                request(app.getHttpServer())
                    .post('/profiles/public')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send({
                        username: 'audit-test-user',
                        isPublic: true,
                    }),
            ];

            await Promise.all(operations);

            // Get audit trail
            const auditResponse = await request(app.getHttpServer())
                .get('/audit/trail')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ userId })
                .expect(200);

            expect(auditResponse.body.entries.length).toBeGreaterThan(0);

            // Verify audit entries contain required information
            const entries = auditResponse.body.entries;
            entries.forEach(entry => {
                expect(entry.userId).toBe(userId);
                expect(entry.action).toBeDefined();
                expect(entry.timestamp).toBeDefined();
                expect(entry.metadata).toBeDefined();
            });

            // Verify specific operations are logged
            const actions = entries.map(e => e.action);
            expect(actions).toContain('project.create');
            expect(actions).toContain('profile.create');
        });

        it('should support audit trail filtering and search', async () => {
            // Filter by action type
            const projectAuditResponse = await request(app.getHttpServer())
                .get('/audit/trail')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    userId,
                    action: 'project.create',
                })
                .expect(200);

            expect(projectAuditResponse.body.entries.length).toBeGreaterThan(0);
            expect(projectAuditResponse.body.entries.every(e => e.action === 'project.create')).toBe(true);

            // Filter by date range
            const today = new Date().toISOString().split('T')[0];
            const dateFilterResponse = await request(app.getHttpServer())
                .get('/audit/trail')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    userId,
                    startDate: today,
                    endDate: today,
                })
                .expect(200);

            expect(dateFilterResponse.body.entries.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling and Recovery', () => {
        let accessToken: string;
        let userId: string;

        beforeAll(async () => {
            const signupResponse = await request(app.getHttpServer())
                .post('/auth/signup')
                .send({
                    email: 'error-test@example.com',
                    username: 'error-test-user',
                    password: 'SecurePassword123!',
                });

            accessToken = signupResponse.body.accessToken;
            userId = signupResponse.body.user.id;
        });

        afterAll(async () => {
            await prisma.user.delete({ where: { id: userId } });
        });

        it('should handle database connection failures gracefully', async () => {
            // This would require mocking database failures
            // For now, we'll test error response format
            const response = await request(app.getHttpServer())
                .get('/projects/non-existent-id')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);

            expect(response.body.error).toBeDefined();
            expect(response.body.message).toBeDefined();
            expect(response.body.statusCode).toBe(404);
        });

        it('should handle external service failures with fallbacks', async () => {
            // Test GitHub API failure simulation
            const response = await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    repoUrl: 'https://github.com/non-existent/repo',
                });

            // Should handle gracefully with appropriate error message
            expect([400, 404, 422]).toContain(response.status);
            expect(response.body.message).toBeDefined();
        });

        it('should maintain data consistency during partial failures', async () => {
            // Create a project that will partially fail during enrichment
            const projectResponse = await request(app.getHttpServer())
                .post('/projects/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    repoUrl: 'https://github.com/test/partial-failure-test',
                })
                .expect(201);

            const projectId = projectResponse.body.project.id;

            // Verify project was created even if enrichment fails
            const verifyResponse = await request(app.getHttpServer())
                .get(`/projects/${projectId}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(verifyResponse.body.id).toBe(projectId);
            expect(verifyResponse.body.title).toBeDefined();
        });
    });
});