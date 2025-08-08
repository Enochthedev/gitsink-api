import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

/**
 * End-to-end tests for database schema enhancements
 * 
 * This test suite validates that all database enhancements from the requirements
 * are properly implemented and functioning correctly.
 * 
 * Requirements tested:
 * - 10.1: Database schema management
 * - 10.2: Data migration capabilities
 * - 10.3: Data integrity constraints
 * - 10.4: Performance optimization
 * - 11.1: Sync history tracking
 * - 11.2: Audit trail implementation
 * - 12.1: Public profile support
 * - 14.1: Multi-platform support
 * - 17.1: Custom metadata support
 * - 18.1: GraphQL schema support
 */

describe('Database Schema Enhancements (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [PrismaModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        prisma = moduleFixture.get<PrismaService>(PrismaService);
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Enhanced User Model', () => {
        it('should support new user fields for tier and API tracking', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'test-enhanced@example.com',
                    tier: 'premium',
                    settings: { theme: 'dark', notifications: true },
                    profileConfig: { showEmail: false, showStats: true },
                    monthlyApiCalls: 150,
                    syncCount: 5,
                },
            });

            expect(user.tier).toBe('premium');
            expect(user.settings).toEqual({ theme: 'dark', notifications: true });
            expect(user.profileConfig).toEqual({ showEmail: false, showStats: true });
            expect(user.monthlyApiCalls).toBe(150);
            expect(user.syncCount).toBe(5);

            // Cleanup
            await prisma.user.delete({ where: { id: user.id } });
        });

        it('should enforce tier constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "User" (id, email, tier) 
          VALUES (gen_random_uuid(), 'invalid-tier@example.com', 'invalid')
        `
            ).rejects.toThrow();
        });

        it('should enforce positive API call constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "User" (id, email, "monthlyApiCalls") 
          VALUES (gen_random_uuid(), 'negative-calls@example.com', -1)
        `
            ).rejects.toThrow();
        });
    });

    describe('Enhanced Project Model', () => {
        let testUser: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'project-test@example.com',
                },
            });
        });

        afterEach(async () => {
            await prisma.project.deleteMany({ where: { ownerId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should support multi-platform project data', async () => {
            const project = await prisma.project.create({
                data: {
                    title: 'Multi-Platform Project',
                    description: 'A test project',
                    ownerId: testUser.id,
                    platform: 'gitlab',
                    platformId: 'gitlab-123',
                    language: 'TypeScript',
                    languages: { TypeScript: 80, JavaScript: 20 },
                    starCount: 42,
                    forkCount: 7,
                    topics: ['web', 'api', 'typescript'],
                    isPrivate: false,
                    archived: false,
                },
            });

            expect(project.platform).toBe('gitlab');
            expect(project.platformId).toBe('gitlab-123');
            expect(project.language).toBe('TypeScript');
            expect(project.languages).toEqual({ TypeScript: 80, JavaScript: 20 });
            expect(project.starCount).toBe(42);
            expect(project.forkCount).toBe(7);
            expect(project.topics).toEqual(['web', 'api', 'typescript']);
            expect(project.isPrivate).toBe(false);
            expect(project.archived).toBe(false);
        });

        it('should enforce platform constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "Project" (id, title, description, "ownerId", platform) 
          VALUES (gen_random_uuid(), 'Invalid Platform', 'Test', ${testUser.id}, 'invalid')
        `
            ).rejects.toThrow();
        });

        it('should enforce positive count constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "Project" (id, title, description, "ownerId", "starCount") 
          VALUES (gen_random_uuid(), 'Negative Stars', 'Test', ${testUser.id}, -1)
        `
            ).rejects.toThrow();
        });

        it('should support unique platform+platformId constraint', async () => {
            await prisma.project.create({
                data: {
                    title: 'First Project',
                    description: 'Test',
                    ownerId: testUser.id,
                    platform: 'github',
                    platformId: 'unique-123',
                },
            });

            await expect(
                prisma.project.create({
                    data: {
                        title: 'Duplicate Project',
                        description: 'Test',
                        ownerId: testUser.id,
                        platform: 'github',
                        platformId: 'unique-123',
                    },
                })
            ).rejects.toThrow();
        });
    });

    describe('Public Profile Support', () => {
        let testUser: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'profile-test@example.com',
                },
            });
        });

        afterEach(async () => {
            await prisma.publicProfile.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should create and manage public profiles', async () => {
            const profile = await prisma.publicProfile.create({
                data: {
                    userId: testUser.id,
                    username: 'testuser123',
                    displayName: 'Test User',
                    bio: 'A test developer',
                    socialLinks: [
                        { platform: 'twitter', url: 'https://twitter.com/testuser' },
                        { platform: 'linkedin', url: 'https://linkedin.com/in/testuser' },
                    ],
                    theme: { primaryColor: '#007acc', layout: 'modern' },
                    settings: { showEmail: false, showStats: true },
                    isPublic: true,
                    viewCount: 0,
                },
            });

            expect(profile.username).toBe('testuser123');
            expect(profile.displayName).toBe('Test User');
            expect(profile.bio).toBe('A test developer');
            expect(profile.socialLinks).toHaveLength(2);
            expect(profile.theme).toEqual({ primaryColor: '#007acc', layout: 'modern' });
            expect(profile.isPublic).toBe(true);
            expect(profile.viewCount).toBe(0);
        });

        it('should enforce unique username constraint', async () => {
            await prisma.publicProfile.create({
                data: {
                    userId: testUser.id,
                    username: 'uniqueuser',
                },
            });

            const anotherUser = await prisma.user.create({
                data: { email: 'another@example.com' },
            });

            await expect(
                prisma.publicProfile.create({
                    data: {
                        userId: anotherUser.id,
                        username: 'uniqueuser',
                    },
                })
            ).rejects.toThrow();

            // Cleanup
            await prisma.user.delete({ where: { id: anotherUser.id } });
        });

        it('should enforce positive view count constraint', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "PublicProfile" (id, "userId", username, "viewCount") 
          VALUES (gen_random_uuid(), ${testUser.id}, 'negativeviews', -1)
        `
            ).rejects.toThrow();
        });
    });

    describe('Platform Connections', () => {
        let testUser: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'platform-test@example.com',
                },
            });
        });

        afterEach(async () => {
            await prisma.platformConnection.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should manage platform connections', async () => {
            const connection = await prisma.platformConnection.create({
                data: {
                    userId: testUser.id,
                    platform: 'gitlab',
                    platformUserId: 'gitlab-user-123',
                    platformUsername: 'testuser',
                    accessToken: 'encrypted-token',
                    scopes: ['read_user', 'read_repository'],
                    isActive: true,
                },
            });

            expect(connection.platform).toBe('gitlab');
            expect(connection.platformUserId).toBe('gitlab-user-123');
            expect(connection.platformUsername).toBe('testuser');
            expect(connection.scopes).toEqual(['read_user', 'read_repository']);
            expect(connection.isActive).toBe(true);
        });

        it('should enforce unique user+platform constraint', async () => {
            await prisma.platformConnection.create({
                data: {
                    userId: testUser.id,
                    platform: 'github',
                    platformUserId: 'github-123',
                },
            });

            await expect(
                prisma.platformConnection.create({
                    data: {
                        userId: testUser.id,
                        platform: 'github',
                        platformUserId: 'github-456',
                    },
                })
            ).rejects.toThrow();
        });

        it('should enforce platform constraint', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "PlatformConnection" (id, "userId", platform, "platformUserId") 
          VALUES (gen_random_uuid(), ${testUser.id}, 'invalid', 'user-123')
        `
            ).rejects.toThrow();
        });
    });

    describe('Sync History and Audit Trail', () => {
        let testUser: any;
        let testProject: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'sync-test@example.com',
                },
            });

            testProject = await prisma.project.create({
                data: {
                    title: 'Sync Test Project',
                    description: 'Test project for sync history',
                    ownerId: testUser.id,
                },
            });
        });

        afterEach(async () => {
            await prisma.syncHistory.deleteMany({ where: { userId: testUser.id } });
            await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
            await prisma.project.delete({ where: { id: testProject.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should track sync history', async () => {
            const syncRecord = await prisma.syncHistory.create({
                data: {
                    userId: testUser.id,
                    projectId: testProject.id,
                    operation: 'sync',
                    platform: 'github',
                    repositoryUrl: 'https://github.com/user/repo',
                    status: 'completed',
                    changes: [
                        { field: 'description', oldValue: 'Old desc', newValue: 'New desc' },
                        { field: 'starCount', oldValue: 10, newValue: 15 },
                    ],
                    metadata: { syncType: 'webhook', triggeredBy: 'push' },
                    duration: 1500,
                },
            });

            expect(syncRecord.operation).toBe('sync');
            expect(syncRecord.platform).toBe('github');
            expect(syncRecord.status).toBe('completed');
            expect(syncRecord.changes).toHaveLength(2);
            expect(syncRecord.metadata).toEqual({ syncType: 'webhook', triggeredBy: 'push' });
            expect(syncRecord.duration).toBe(1500);
        });

        it('should enforce sync operation constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "SyncHistory" (id, "userId", operation, platform, "repositoryUrl", status) 
          VALUES (gen_random_uuid(), ${testUser.id}, 'invalid', 'github', 'https://github.com/user/repo', 'completed')
        `
            ).rejects.toThrow();
        });

        it('should enforce sync status constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "SyncHistory" (id, "userId", operation, platform, "repositoryUrl", status) 
          VALUES (gen_random_uuid(), ${testUser.id}, 'sync', 'github', 'https://github.com/user/repo', 'invalid')
        `
            ).rejects.toThrow();
        });

        it('should track audit logs', async () => {
            const auditLog = await prisma.auditLog.create({
                data: {
                    userId: testUser.id,
                    action: 'project_update',
                    resource: 'Project',
                    resourceId: testProject.id,
                    details: {
                        changedFields: { title: 'New Title', description: 'New Description' },
                        ipAddress: '192.168.1.1',
                    },
                    ipAddress: '192.168.1.1',
                    userAgent: 'Mozilla/5.0 Test Browser',
                    success: true,
                },
            });

            expect(auditLog.action).toBe('project_update');
            expect(auditLog.resource).toBe('Project');
            expect(auditLog.resourceId).toBe(testProject.id);
            expect(auditLog.details).toHaveProperty('changedFields');
            expect(auditLog.ipAddress).toBe('192.168.1.1');
            expect(auditLog.success).toBe(true);
        });
    });

    describe('AI Analysis Support', () => {
        let testUser: any;
        let testProject: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'ai-test@example.com',
                },
            });

            testProject = await prisma.project.create({
                data: {
                    title: 'AI Test Project',
                    description: 'Test project for AI analysis',
                    ownerId: testUser.id,
                },
            });
        });

        afterEach(async () => {
            await prisma.aIAnalysis.deleteMany({ where: { projectId: testProject.id } });
            await prisma.project.delete({ where: { id: testProject.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should store AI analysis results', async () => {
            const analysis = await prisma.aIAnalysis.create({
                data: {
                    projectId: testProject.id,
                    version: 1,
                    analysis: {
                        description: 'AI-generated project description',
                        technologies: {
                            languages: [{ name: 'TypeScript', percentage: 85 }],
                            frameworks: ['React', 'Node.js'],
                            databases: ['PostgreSQL'],
                        },
                        category: 'web-application',
                        complexity: 'moderate',
                        suggestedTags: ['react', 'typescript', 'web'],
                        keyFeatures: ['User authentication', 'Real-time updates'],
                    },
                    confidence: 0.87,
                    model: 'gpt-4',
                },
            });

            expect(analysis.version).toBe(1);
            expect(analysis.analysis).toHaveProperty('description');
            expect(analysis.analysis).toHaveProperty('technologies');
            expect(analysis.confidence).toBe(0.87);
            expect(analysis.model).toBe('gpt-4');
        });

        it('should enforce confidence score constraints', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "AIAnalysis" (id, "projectId", analysis, confidence) 
          VALUES (gen_random_uuid(), ${testProject.id}, '{}', 1.5)
        `
            ).rejects.toThrow();

            await expect(
                prisma.$executeRaw`
          INSERT INTO "AIAnalysis" (id, "projectId", analysis, confidence) 
          VALUES (gen_random_uuid(), ${testProject.id}, '{}', -0.1)
        `
            ).rejects.toThrow();
        });

        it('should support versioning', async () => {
            await prisma.aIAnalysis.create({
                data: {
                    projectId: testProject.id,
                    version: 1,
                    analysis: { description: 'Version 1' },
                    confidence: 0.8,
                },
            });

            await prisma.aIAnalysis.create({
                data: {
                    projectId: testProject.id,
                    version: 2,
                    analysis: { description: 'Version 2' },
                    confidence: 0.9,
                },
            });

            const analyses = await prisma.aIAnalysis.findMany({
                where: { projectId: testProject.id },
                orderBy: { version: 'desc' },
            });

            expect(analyses).toHaveLength(2);
            expect(analyses[0].version).toBe(2);
            expect(analyses[1].version).toBe(1);
        });
    });

    describe('API Usage Tracking', () => {
        let testUser: any;

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'api-test@example.com',
                },
            });
        });

        afterEach(async () => {
            await prisma.apiUsage.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should track API usage', async () => {
            const usage = await prisma.apiUsage.create({
                data: {
                    userId: testUser.id,
                    endpoint: '/api/projects',
                    method: 'GET',
                    statusCode: 200,
                    duration: 150,
                    ipAddress: '192.168.1.1',
                    userAgent: 'Test Client/1.0',
                },
            });

            expect(usage.endpoint).toBe('/api/projects');
            expect(usage.method).toBe('GET');
            expect(usage.statusCode).toBe(200);
            expect(usage.duration).toBe(150);
            expect(usage.ipAddress).toBe('192.168.1.1');
        });

        it('should enforce positive duration constraint', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "ApiUsage" (id, endpoint, method, "statusCode", duration) 
          VALUES (gen_random_uuid(), '/test', 'GET', 200, -1)
        `
            ).rejects.toThrow();
        });

        it('should enforce valid status code constraint', async () => {
            await expect(
                prisma.$executeRaw`
          INSERT INTO "ApiUsage" (id, endpoint, method, "statusCode", duration) 
          VALUES (gen_random_uuid(), '/test', 'GET', 99, 100)
        `
            ).rejects.toThrow();

            await expect(
                prisma.$executeRaw`
          INSERT INTO "ApiUsage" (id, endpoint, method, "statusCode", duration) 
          VALUES (gen_random_uuid(), '/test', 'GET', 600, 100)
        `
            ).rejects.toThrow();
        });
    });

    describe('Database Functions', () => {
        let testUser: any;
        let testProjects: any[];

        beforeEach(async () => {
            testUser = await prisma.user.create({
                data: {
                    email: 'function-test@example.com',
                },
            });

            testProjects = await Promise.all([
                prisma.project.create({
                    data: {
                        title: 'Project 1',
                        description: 'First project',
                        ownerId: testUser.id,
                        published: true,
                        featured: true,
                        starCount: 10,
                        forkCount: 2,
                    },
                }),
                prisma.project.create({
                    data: {
                        title: 'Project 2',
                        description: 'Second project',
                        ownerId: testUser.id,
                        published: true,
                        featured: false,
                        starCount: 5,
                        forkCount: 1,
                    },
                }),
            ]);
        });

        afterEach(async () => {
            await prisma.project.deleteMany({ where: { ownerId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        });

        it('should calculate user project stats', async () => {
            const stats = await prisma.$queryRaw<Array<{
                total_projects: bigint;
                published_projects: bigint;
                featured_projects: bigint;
                total_stars: bigint;
                total_forks: bigint;
            }>>`
        SELECT * FROM get_user_project_stats(${testUser.id}::uuid);
      `;

            expect(stats).toHaveLength(1);
            expect(Number(stats[0].total_projects)).toBe(2);
            expect(Number(stats[0].published_projects)).toBe(2);
            expect(Number(stats[0].featured_projects)).toBe(1);
            expect(Number(stats[0].total_stars)).toBe(15);
            expect(Number(stats[0].total_forks)).toBe(3);
        });

        it('should calculate user engagement score', async () => {
            const scores = await prisma.$queryRaw<Array<{ calculate_user_engagement_score: number }>>`
        SELECT calculate_user_engagement_score(${testUser.id}::uuid);
      `;

            expect(scores).toHaveLength(1);
            expect(scores[0].calculate_user_engagement_score).toBeGreaterThan(0);
            expect(scores[0].calculate_user_engagement_score).toBeLessThanOrEqual(100);
        });
    });

    describe('Performance Indexes', () => {
        it('should have critical performance indexes', async () => {
            const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE '%idx_%'
        ORDER BY indexname;
      `;

            const indexNames = indexes.map(i => i.indexname);

            // Check for some critical indexes
            const criticalIndexes = [
                'User_tier_idx',
                'Project_platform_idx',
                'Project_starCount_idx',
                'SyncHistory_userId_startedAt_idx',
                'AuditLog_timestamp_idx',
            ];

            criticalIndexes.forEach(indexName => {
                expect(indexNames.some(name => name.includes(indexName.replace('_idx', '')))).toBe(true);
            });
        });
    });

    describe('Materialized Views', () => {
        it('should have project stats materialized view', async () => {
            const views = await prisma.$queryRaw<Array<{ matviewname: string }>>`
        SELECT matviewname 
        FROM pg_matviews 
        WHERE schemaname = 'public';
      `;

            const viewNames = views.map(v => v.matviewname);
            expect(viewNames).toContain('project_stats_summary');
        });

        it('should be able to refresh materialized views', async () => {
            await expect(
                prisma.$executeRaw`SELECT refresh_project_stats();`
            ).resolves.not.toThrow();
        });
    });
});