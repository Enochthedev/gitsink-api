import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from './sandbox.service';
import { SandboxDataService } from './sandbox-data.service';
import { SandboxMigrationService } from './sandbox-migration.service';
import { SandboxIsolationService } from './sandbox-isolation.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

describe('Sandbox Integration Tests', () => {
  let app: INestApplication;
  let sandboxService: SandboxService;
  let sandboxDataService: SandboxDataService;
  let sandboxMigrationService: SandboxMigrationService;
  let sandboxIsolationService: SandboxIsolationService;
  let prismaService: PrismaService;

  const testUserId = 'test-user-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
        SandboxDataService,
        SandboxMigrationService,
        SandboxIsolationService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            project: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            publicProfile: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
              upsert: jest.fn(),
            },
            syncHistory: {
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            aIAnalysis: {
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: MetricsService,
          useValue: {
            createCustomCounter: jest.fn().mockReturnValue({ inc: jest.fn() }),
            createCustomHistogram: jest.fn().mockReturnValue({ observe: jest.fn() }),
            createCustomGauge: jest.fn().mockReturnValue({ set: jest.fn(), remove: jest.fn() }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                SANDBOX_ENABLED: true,
                SANDBOX_MAX_PROJECTS: 10,
                SANDBOX_MAX_API_CALLS: 1000,
                SANDBOX_MAX_SYNC_OPS: 50,
                SANDBOX_SESSION_DURATION: 24 * 60 * 60 * 1000,
                SANDBOX_DATA_RETENTION: 7 * 24 * 60 * 60 * 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    sandboxService = moduleFixture.get<SandboxService>(SandboxService);
    sandboxDataService = moduleFixture.get<SandboxDataService>(SandboxDataService);
    sandboxMigrationService = moduleFixture.get<SandboxMigrationService>(SandboxMigrationService);
    sandboxIsolationService = moduleFixture.get<SandboxIsolationService>(SandboxIsolationService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Sandbox Workflow', () => {
    it('should complete full sandbox lifecycle', async () => {
      // Mock user with no existing session
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: testUserId,
        email: 'test@example.com',
        settings: {},
      });

      (prismaService.user.update as jest.Mock).mockResolvedValue({
        id: testUserId,
        settings: {},
      });

      (prismaService.project.createMany as jest.Mock).mockResolvedValue({
        count: 5,
      });
      (prismaService.publicProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.publicProfile.create as jest.Mock).mockResolvedValue({});

      // 1. Start sandbox session
      const session = await sandboxService.startSandboxSession(testUserId, {
        maxProjects: 5,
        maxApiCalls: 500,
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.isActive).toBe(true);

      // 2. Generate test data
      const testRepositories = sandboxDataService.generateTestRepositories(5);
      expect(testRepositories).toHaveLength(5);
      expect(testRepositories[0].metadata.sandbox).toBe(true);

      const testUser = sandboxDataService.generateTestUser();
      expect(testUser.metadata.sandbox).toBe(true);

      // 3. Create sandbox projects and profile
      await sandboxDataService.createSandboxProjects(testUserId, testRepositories);
      await sandboxDataService.createSandboxProfile(testUserId, testUser);

      expect(prismaService.project.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            ownerId: testUserId,
            customMetadata: expect.objectContaining({
              sandbox: true,
            }),
          }),
        ]),
        skipDuplicates: true,
      });

      expect(prismaService.publicProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: testUserId,
          settings: expect.objectContaining({
            sandbox: true,
          }),
        }),
      });
    });

    it('should enforce data isolation', async () => {
      const isInSandbox = true;

      // Test sandbox filters
      const sandboxFilters = sandboxIsolationService.applySandboxFilters(testUserId, isInSandbox, {
        someField: 'value',
      });

      expect(sandboxFilters).toEqual({
        someField: 'value',
        ownerId: testUserId,
        OR: expect.arrayContaining([
          {
            customMetadata: {
              path: ['sandbox'],
              equals: true,
            },
          },
        ]),
      });

      // Test sandbox markers
      const testData = {
        title: 'Test Project',
        description: 'Test Description',
      };
      const markedData = sandboxIsolationService.applySandboxMarkers(testData, isInSandbox);

      expect(markedData.customMetadata.sandbox).toBe(true);
      expect(markedData.customMetadata.sandboxCreatedAt).toBeDefined();
    });

    it('should validate sandbox data before migration', async () => {
      // Mock sandbox projects
      (prismaService.project.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'project-1',
          title: 'Test Project',
          repoUrl: 'https://github.com/test/repo',
          customMetadata: { sandbox: true },
        },
      ]);

      (prismaService.project.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.publicProfile.findUnique as jest.Mock).mockResolvedValue({
        id: 'profile-1',
        userId: testUserId,
        username: 'testuser',
        settings: { sandbox: true },
      });

      (prismaService.publicProfile.findFirst as jest.Mock).mockResolvedValue(null);

      const validationResult = await sandboxMigrationService.validateSandboxData(testUserId);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should perform dry run migration', async () => {
      (prismaService.project.count as jest.Mock).mockResolvedValue(3);
      (prismaService.publicProfile.findUnique as jest.Mock).mockResolvedValue({
        settings: { sandbox: true },
      });
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        settings: { sandboxSettings: { theme: 'dark' } },
      });

      const dryRunResult = await sandboxMigrationService.performDryRun(testUserId, {
        includeProjects: true,
        includeProfile: true,
        includeSettings: true,
        overwriteExisting: false,
        dryRun: true,
        validateData: false,
      });

      expect(dryRunResult.success).toBe(true);
      expect(dryRunResult.projectsMigrated).toBe(3);
      expect(dryRunResult.profileMigrated).toBe(true);
      expect(dryRunResult.settingsMigrated).toBe(true);
      expect(dryRunResult.warnings).toContain('This is a dry run - no actual changes were made');
    });

    it('should get sandbox data statistics', async () => {
      (prismaService.project.count as jest.Mock).mockResolvedValue(5);
      (prismaService.publicProfile.count as jest.Mock).mockResolvedValue(1);
      (prismaService.syncHistory.count as jest.Mock).mockResolvedValue(10);
      (prismaService.aIAnalysis.count as jest.Mock).mockResolvedValue(3);

      const stats = await sandboxIsolationService.getSandboxDataStats(testUserId);

      expect(stats).toEqual({
        projects: 5,
        profiles: 1,
        syncHistory: 10,
        aiAnalysis: 3,
        totalSize: 19,
      });
    });

    it('should validate data integrity', async () => {
      (prismaService.project.count as jest.Mock).mockResolvedValue(0);
      (prismaService.aIAnalysis.count as jest.Mock).mockResolvedValue(0);
      (prismaService.project.findMany as jest.Mock).mockResolvedValue([]);

      const integrityResult = await sandboxIsolationService.validateDataIntegrity(testUserId);

      expect(integrityResult.isValid).toBe(true);
      expect(integrityResult.issues).toHaveLength(0);
    });

    it('should cleanup all sandbox data', async () => {
      (prismaService.project.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });
      (prismaService.publicProfile.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prismaService.syncHistory.deleteMany as jest.Mock).mockResolvedValue({
        count: 10,
      });
      (prismaService.project.findMany as jest.Mock).mockResolvedValue([
        { id: 'project-1' },
        { id: 'project-2' },
      ]);
      (prismaService.aIAnalysis.deleteMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const cleanupResult = await sandboxIsolationService.cleanupAllSandboxData(testUserId);

      expect(cleanupResult).toEqual({
        projectsDeleted: 5,
        profilesDeleted: 1,
        syncHistoryDeleted: 10,
        aiAnalysisDeleted: 3,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      (prismaService.project.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'project-1',
          title: '', // Invalid empty title
          repoUrl: 'invalid-url', // Invalid URL
          customMetadata: { sandbox: true },
        },
      ]);

      const validationResult = await sandboxMigrationService.validateSandboxData(testUserId);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toContain('Project project-1 has empty title');
      expect(validationResult.errors).toContain('Project  has invalid repository URL');
    });

    it('should handle migration conflicts', async () => {
      // Mock existing production project with same URL
      (prismaService.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-project',
        title: 'Existing Project',
        repoUrl: 'https://github.com/test/repo',
      });

      const validationResult = await sandboxMigrationService.validateSandboxData(testUserId);

      expect(validationResult.warnings).toContain(
        'Project Test Project conflicts with existing production project',
      );
    });

    it('should handle database errors during cleanup', async () => {
      (prismaService.project.deleteMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(sandboxIsolationService.cleanupAllSandboxData(testUserId)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('Performance and Limits', () => {
    it('should respect sandbox limits', async () => {
      // Mock active session at limit
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: testUserId,
        settings: {
          sandboxSession: {
            id: 'session-1',
            projectCount: 10, // At limit
            apiCallCount: 500,
            syncOperationCount: 25,
            isActive: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            metadata: { maxProjects: 10 },
          },
        },
      });

      await expect(sandboxService.incrementProjectCount(testUserId)).rejects.toThrow(
        'Sandbox project limit reached',
      );
    });

    it('should handle large datasets efficiently', async () => {
      const largeRepositorySet = sandboxDataService.generateTestRepositories(50);
      expect(largeRepositorySet).toHaveLength(50);

      // Verify all repositories have unique IDs
      const ids = largeRepositorySet.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);

      // Verify realistic data distribution
      const languages = largeRepositorySet.map(r => r.language);
      const uniqueLanguages = new Set(languages);
      expect(uniqueLanguages.size).toBeGreaterThan(5); // Should have variety
    });
  });
});
