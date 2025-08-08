import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('Database Schema (e2e)', () => {
    let prisma: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [PrismaModule],
        }).compile();

        prisma = moduleFixture.get<PrismaService>(PrismaService);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Enhanced User Schema', () => {
        it('should have all new user fields', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'test-schema@example.com',
                    tier: 'premium',
                    settings: { theme: 'dark' },
                    profileConfig: { showEmail: false },
                    platformTokens: { github: 'token123' },
                    syncCount: 5,
                    apiCallCount: 100,
                    monthlyApiCalls: 50,
                },
            });

            expect(user.tier).toBe('premium');
            expect(user.settings).toEqual({ theme: 'dark' });
            expect(user.profileConfig).toEqual({ showEmail: false });
            expect(user.platformTokens).toEqual({ github: 'token123' });
            expect(user.syncCount).toBe(5);
            expect(user.apiCallCount).toBe(100);
            expect(user.monthlyApiCalls).toBe(50);
            expect(user.lastApiCallReset).toBeDefined();

            // Cleanup
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('PublicProfile Schema', () => {
        it('should create and query public profiles', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'profile-test@example.com',
                    username: 'profileuser',
                },
            });

            const profile = await prisma.publicProfile.create({
                data: {
                    userId: user.id,
                    username: 'profileuser',
                    displayName: 'Profile User',
                    bio: 'Test bio',
                    socialLinks: [{ platform: 'twitter', url: 'https://twitter.com/user' }],
                    theme: { primaryColor: '#007acc' },
                    isPublic: true,
                    viewCount: 10,
                },
            });

            expect(profile.username).toBe('profileuser');
            expect(profile.displayName).toBe('Profile User');
            expect(profile.isPublic).toBe(true);
            expect(profile.viewCount).toBe(10);
            expect(profile.socialLinks).toEqual([{ platform: 'twitter', url: 'https://twitter.com/user' }]);

            // Cleanup
            await prisma.publicProfile.delete({ where: { id: profile.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('PlatformConnection Schema', () => {
        it('should create and manage platform connections', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'platform-test@example.com',
                },
            });

            const connection = await prisma.platformConnection.create({
                data: {
                    userId: user.id,
                    platform: 'gitlab',
                    platformUserId: 'gitlab123',
                    platformUsername: 'gitlabuser',
                    accessToken: 'access123',
                    refreshToken: 'refresh123',
                    scopes: ['read_user', 'read_repository'],
                    isActive: true,
                },
            });

            expect(connection.platform).toBe('gitlab');
            expect(connection.platformUserId).toBe('gitlab123');
            expect(connection.scopes).toEqual(['read_user', 'read_repository']);
            expect(connection.isActive).toBe(true);

            // Cleanup
            await prisma.platformConnection.delete({ where: { id: connection.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('Enhanced Project Schema', () => {
        it('should create projects with enhanced fields', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'project-test@example.com',
                },
            });

            const project = await prisma.project.create({
                data: {
                    title: 'Test Project',
                    description: 'A test project',
                    tags: ['typescript', 'nodejs'],
                    ownerId: user.id,
                    platform: 'gitlab',
                    platformId: 'gitlab-123',
                    language: 'TypeScript',
                    languages: { TypeScript: 80, JavaScript: 20 },
                    starCount: 25,
                    forkCount: 5,
                    isPrivate: false,
                    topics: ['web', 'api'],
                    openIssues: 3,
                    hasWiki: true,
                    hasPages: false,
                },
            });

            expect(project.platform).toBe('gitlab');
            expect(project.platformId).toBe('gitlab-123');
            expect(project.language).toBe('TypeScript');
            expect(project.languages).toEqual({ TypeScript: 80, JavaScript: 20 });
            expect(project.starCount).toBe(25);
            expect(project.topics).toEqual(['web', 'api']);
            expect(project.hasWiki).toBe(true);

            // Cleanup
            await prisma.project.delete({ where: { id: project.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('SyncHistory Schema', () => {
        it('should track sync operations', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'sync-test@example.com',
                },
            });

            const project = await prisma.project.create({
                data: {
                    title: 'Sync Test Project',
                    description: 'Test project for sync',
                    tags: [],
                    ownerId: user.id,
                },
            });

            const syncRecord = await prisma.syncHistory.create({
                data: {
                    userId: user.id,
                    projectId: project.id,
                    operation: 'sync',
                    platform: 'github',
                    repositoryUrl: 'https://github.com/user/repo',
                    status: 'completed',
                    changes: [{ field: 'description', old: 'old', new: 'new' }],
                    metadata: { branch: 'main', commit: 'abc123' },
                    duration: 1500,
                    completedAt: new Date(),
                },
            });

            expect(syncRecord.operation).toBe('sync');
            expect(syncRecord.status).toBe('completed');
            expect(syncRecord.changes).toEqual([{ field: 'description', old: 'old', new: 'new' }]);
            expect(syncRecord.duration).toBe(1500);

            // Cleanup
            await prisma.syncHistory.delete({ where: { id: syncRecord.id } });
            await prisma.project.delete({ where: { id: project.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('AIAnalysis Schema', () => {
        it('should store AI analysis results', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'ai-test@example.com',
                },
            });

            const project = await prisma.project.create({
                data: {
                    title: 'AI Test Project',
                    description: 'Test project for AI analysis',
                    tags: [],
                    ownerId: user.id,
                },
            });

            const analysis = await prisma.aIAnalysis.create({
                data: {
                    projectId: project.id,
                    version: 1,
                    analysis: {
                        description: 'AI generated description',
                        technologies: ['React', 'TypeScript'],
                        category: 'web-app',
                        complexity: 'moderate',
                    },
                    confidence: 0.85,
                    model: 'gpt-4',
                },
            });

            expect(analysis.confidence).toBe(0.85);
            expect(analysis.model).toBe('gpt-4');
            expect(analysis.analysis).toHaveProperty('description');
            expect(analysis.analysis).toHaveProperty('technologies');

            // Cleanup
            await prisma.aIAnalysis.delete({ where: { id: analysis.id } });
            await prisma.project.delete({ where: { id: project.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('AuditLog Schema', () => {
        it('should log audit events', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'audit-test@example.com',
                },
            });

            const auditLog = await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    action: 'login',
                    resource: 'user',
                    resourceId: user.id,
                    details: { method: 'email', ip: '127.0.0.1' },
                    ipAddress: '127.0.0.1',
                    userAgent: 'test-agent',
                    success: true,
                },
            });

            expect(auditLog.action).toBe('login');
            expect(auditLog.resource).toBe('user');
            expect(auditLog.success).toBe(true);
            expect(auditLog.details).toHaveProperty('method');

            // Cleanup
            await prisma.auditLog.delete({ where: { id: auditLog.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('ApiUsage Schema', () => {
        it('should track API usage', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'api-usage-test@example.com',
                },
            });

            const apiUsage = await prisma.apiUsage.create({
                data: {
                    userId: user.id,
                    endpoint: '/api/projects',
                    method: 'GET',
                    statusCode: 200,
                    duration: 150,
                    ipAddress: '127.0.0.1',
                    userAgent: 'test-client',
                },
            });

            expect(apiUsage.endpoint).toBe('/api/projects');
            expect(apiUsage.method).toBe('GET');
            expect(apiUsage.statusCode).toBe(200);
            expect(apiUsage.duration).toBe(150);

            // Cleanup
            await prisma.apiUsage.delete({ where: { id: apiUsage.id } });
            await prisma.user.delete({ where: { id: user.id } });
        });
    });

    describe('SystemMetric Schema', () => {
        it('should store system metrics', async () => {
            const metric = await prisma.systemMetric.create({
                data: {
                    metric: 'cpu_usage',
                    value: 75.5,
                    tags: { host: 'server1', region: 'us-east-1' },
                },
            });

            expect(metric.metric).toBe('cpu_usage');
            expect(metric.value).toBe(75.5);
            expect(metric.tags).toEqual({ host: 'server1', region: 'us-east-1' });

            // Cleanup
            await prisma.systemMetric.delete({ where: { id: metric.id } });
        });
    });

    describe('Database Indexes', () => {
        it('should have performance indexes created', async () => {
            // Query to check if our custom indexes exist
            const indexes = await prisma.$queryRaw`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
        ORDER BY tablename, indexname;
      `;

            expect(Array.isArray(indexes)).toBe(true);
            expect((indexes as any[]).length).toBeGreaterThan(0);

            // Check for some specific indexes we created
            const indexNames = (indexes as any[]).map(idx => idx.indexname);
            expect(indexNames).toContain('idx_projects_user_published_featured');
            expect(indexNames).toContain('idx_projects_tags_gin');
            expect(indexNames).toContain('idx_sync_history_user_date_desc');
            expect(indexNames).toContain('idx_public_profiles_discovery');
        });
    });
});