import { EnhancedLoggerService } from '../common/services/enhanced-logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from '../projects/projects.service';
import { ProfilesService } from '../profiles/profiles.service';
import { createMockConfigService, createMockCacheManager } from '../../te../../test/test-utils/mocks';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ParserService } from '../parser/parser.service';
import { SyncQueueService } from '../projects/sync-queue.service';
import { PinoLogger } from 'nestjs-pino';

describe('Database Performance Benchmarks', () => {
  let prismaService: PrismaService;
  let projectsService: ProjectsService;
  let profilesService: ProfilesService;
  let configService: ReturnType<typeof createMockConfigService>;
  let testUsers: any[] = [];
  let testProjects: any[] = [];

  beforeAll(async () => {
    configService = createMockConfigService();
    const mockCache = createMockCacheManager();
    const mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EnhancedLoggerService,
          useValue: {
            log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn(),
            logBusinessEvent: jest.fn(), logPerformance: jest.fn(), logSecurityEvent: jest.fn(),
            logDatabaseQuery: jest.fn(), logExternalApiCall: jest.fn(), setContext: jest.fn(),
          },
        },
        PrismaService,
        ProjectsService,
        ProfilesService,
        ParserService,
        { provide: ConfigService, useValue: configService },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: PinoLogger, useValue: mockLogger },
        {
          provide: SyncQueueService,
          useValue: {
            addJob: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      // auto-mock any provider the spec does not define explicitly
      .useMocker((token) => (typeof token === 'function' ? new Proxy({}, { get: () => jest.fn() }) : undefined))
      .compile();

    prismaService = module.get<PrismaService>(PrismaService);
    projectsService = module.get<ProjectsService>(ProjectsService);
    profilesService = module.get<ProfilesService>(ProfilesService);

    // Set up test data
    await setupLargeTestDataset();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await prismaService.$disconnect();
  });

  async function setupLargeTestDataset() {
    console.log('Setting up large test dataset...');
    const startTime = Date.now();

    // Create test users
    const userCount = 100;
    const usersData = Array.from({ length: userCount }, (_, i) => ({
      email: `benchmark-user-${i}@example.com`,
      username: `benchmarkuser${i}`,
      password: 'hashed-password',
      tier: i % 3 === 0 ? 'premium' : 'free',
      monthlyApiCalls: Math.floor(Math.random() * 1000),
      syncCount: Math.floor(Math.random() * 50),
    }));

    // Use batch creation for better performance
    const createdUsers = await prismaService.batchCreate('user', usersData, 50);
    console.log(`Created ${createdUsers.count} users`);

    // Get created user IDs
    testUsers = await prismaService.user.findMany({
      where: { email: { startsWith: 'benchmark-user-' } },
      select: { id: true, email: true },
    });

    // Create projects for each user
    const projectsPerUser = 20;
    const allProjectsData: any[] = [];

    testUsers.forEach((user, userIndex) => {
      const userProjects = Array.from({ length: projectsPerUser }, (_, i) => ({
        ownerId: user.id,
        title: `Benchmark Project ${userIndex}-${i}`,
        description: `Performance benchmark project ${userIndex}-${i} with detailed description`,
        repoUrl: `https://github.com/benchmarkuser${userIndex}/project-${i}`,
        tags: [
          `tag${i % 10}`,
          `category${i % 5}`,
          'benchmark',
          userIndex % 2 === 0 ? 'frontend' : 'backend',
        ],
        category: ['web', 'api', 'tool', 'library', 'mobile'][i % 5],
        language: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust'][i % 6],
        platform: ['github', 'gitlab', 'bitbucket'][i % 3],
        starCount: Math.floor(Math.random() * 1000),
        forkCount: Math.floor(Math.random() * 100),
        openIssues: Math.floor(Math.random() * 50),
        size: Math.floor(Math.random() * 10000),
        featured: i % 20 === 0,
        published: i % 4 !== 0,
        isPrivate: i % 10 === 0,
        archived: i % 50 === 0,
        hasWiki: i % 5 === 0,
        hasPages: i % 8 === 0,
        topics: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, j) => `topic${j}`),
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        lastCommitAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        pushedAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
        markdown: `# Project ${userIndex}-${i}\n\n${'Lorem ipsum '.repeat(50)}`,
        collaborators: Array.from(
          { length: Math.floor(Math.random() * 3) },
          (_, j) => `collaborator${j}`,
        ),
        githubMetadata: {
          stars: Math.floor(Math.random() * 100),
          forks: Math.floor(Math.random() * 20),
          watchers: Math.floor(Math.random() * 30),
        },
        customMetadata: {
          complexity: ['simple', 'moderate', 'complex'][i % 3],
          framework: ['React', 'Vue', 'Angular', 'Express', 'FastAPI'][i % 5],
        },
        languages: {
          TypeScript: Math.random() * 100,
          JavaScript: Math.random() * 100,
          CSS: Math.random() * 100,
        },
      }));
      allProjectsData.push(...userProjects);
    });

    // Batch create projects
    const createdProjects = await prismaService.batchCreate('project', allProjectsData, 100);
    console.log(`Created ${createdProjects.count} projects`);

    // Create AI analysis data
    testProjects = await prismaService.project.findMany({
      where: { title: { startsWith: 'Benchmark Project' } },
      select: { id: true, ownerId: true },
      take: 500, // Limit for AI analysis
    });

    const aiAnalysisData = testProjects.map((project, i) => ({
      projectId: project.id,
      version: 1,
      analysis: {
        description: `AI-generated description for project ${i}`,
        technologies: ['React', 'TypeScript', 'Node.js'],
        category: 'web',
        complexity: 'moderate',
        confidence: Math.random(),
      },
      confidence: Math.random(),
      model: 'gpt-4',
    }));

    await prismaService.batchCreate('aIAnalysis', aiAnalysisData, 100);
    console.log(`Created ${aiAnalysisData.length} AI analysis records`);

    // Create sync history
    const syncHistoryData = testProjects.slice(0, 200).map((project, i) => ({
      userId: project.ownerId,
      projectId: project.id,
      operation: ['sync', 'create', 'update'][i % 3],
      platform: ['github', 'gitlab', 'bitbucket'][i % 3],
      repositoryUrl: `https://github.com/user/repo-${i}`,
      status: i % 10 === 0 ? 'failed' : 'completed',
      changes: [{ field: 'title', old: 'old', new: 'new' }],
      metadata: { source: 'benchmark' },
      duration: Math.floor(Math.random() * 5000),
      startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      completedAt: new Date(),
    }));

    await prismaService.batchCreate('syncHistory', syncHistoryData, 50);
    console.log(`Created ${syncHistoryData.length} sync history records`);

    const setupDuration = Date.now() - startTime;
    console.log(`Test dataset setup completed in ${setupDuration}ms`);
  }

  async function cleanupTestData() {
    console.log('Cleaning up test data...');

    // Delete in correct order to respect foreign key constraints
    await prismaService.aIAnalysis.deleteMany({
      where: { analysis: { path: ['source'], equals: 'benchmark' } },
    });

    await prismaService.syncHistory.deleteMany({
      where: { metadata: { path: ['source'], equals: 'benchmark' } },
    });

    await prismaService.project.deleteMany({
      where: { title: { startsWith: 'Benchmark Project' } },
    });

    await prismaService.user.deleteMany({
      where: { email: { startsWith: 'benchmark-user-' } },
    });

    console.log('Test data cleanup completed');
  }

  describe('Query Performance Benchmarks', () => {
    it('should benchmark user projects query performance', async () => {
      const testUser = testUsers[0];
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const projects = await projectsService.getAllProjectsForUser(testUser.id);

        const duration = Date.now() - startTime;
        times.push(duration);

        expect(projects).toBeDefined();
        expect(Array.isArray(projects)).toBe(true);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`User projects query benchmark:
                Average: ${avgTime.toFixed(2)}ms
                Min: ${minTime}ms
                Max: ${maxTime}ms
                Iterations: ${iterations}`);

      // Performance assertions
      expect(avgTime).toBeLessThan(200); // Average under 200ms
      expect(maxTime).toBeLessThan(500); // Max under 500ms
    });

    it('should benchmark enhanced projects query with filters', async () => {
      const testUser = testUsers[0];
      const iterations = 5;

      const filters = [
        { categories: ['web'], published: true },
        { languages: ['TypeScript'], featured: true },
        { starCount: { min: 10, max: 100 } },
        { tags: ['frontend'], isPrivate: false },
        { search: 'Project' },
      ];

      for (const filter of filters) {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();

          const result = await projectsService.getEnhancedProjects(
            testUser.id,
            filter,
            { field: 'stars', order: 'desc' },
            { offset: 0, limit: 20 },
          );

          const duration = Date.now() - startTime;
          times.push(duration);

          expect(result).toBeDefined();
          expect(result.edges).toBeDefined();
          expect(result.totalCount).toBeGreaterThanOrEqual(0);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);

        console.log(`Enhanced projects query benchmark (${JSON.stringify(filter)}):
                    Average: ${avgTime.toFixed(2)}ms
                    Max: ${maxTime}ms`);

        // Performance assertions
        expect(avgTime).toBeLessThan(300); // Average under 300ms
        expect(maxTime).toBeLessThan(1000); // Max under 1 second
      }
    });

    it('should benchmark profile statistics calculation', async () => {
      const testUser = testUsers[0];
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const profile = await profilesService.getProfileByUserId(testUser.id);

        const duration = Date.now() - startTime;
        times.push(duration);

        expect(profile).toBeDefined();
        if (profile && profile.stats) {
          expect(profile.stats).toBeDefined();
          expect(typeof profile.stats.totalProjects).toBe('number');
        }
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`Profile statistics benchmark:
                Average: ${avgTime.toFixed(2)}ms
                Min: ${minTime}ms
                Max: ${maxTime}ms
                Iterations: ${iterations}`);

      // Performance assertions
      expect(avgTime).toBeLessThan(150); // Average under 150ms
      expect(maxTime).toBeLessThan(400); // Max under 400ms
    });

    it('should benchmark search queries performance', async () => {
      const testUser = testUsers[0];
      const searchTerms = ['Project', 'TypeScript', 'web', 'benchmark', 'frontend'];
      const iterations = 3;

      for (const searchTerm of searchTerms) {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();

          const results = await projectsService.searchProjects(
            testUser.id,
            searchTerm,
            {},
            { offset: 0, limit: 20 },
          );

          const duration = Date.now() - startTime;
          times.push(duration);

          expect(results).toBeDefined();
          expect(Array.isArray(results)).toBe(true);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);

        console.log(`Search query benchmark ("${searchTerm}"):
                    Average: ${avgTime.toFixed(2)}ms
                    Max: ${maxTime}ms`);

        // Performance assertions
        expect(avgTime).toBeLessThan(400); // Average under 400ms
        expect(maxTime).toBeLessThan(1000); // Max under 1 second
      }
    });

    it('should benchmark aggregation queries', async () => {
      const testUser = testUsers[0];
      const iterations = 5;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const stats = await projectsService.getProjectStatistics(testUser.id);

        const duration = Date.now() - startTime;
        times.push(duration);

        expect(stats).toBeDefined();
        expect(typeof stats.totalProjects).toBe('number');
        expect(Array.isArray(stats.languageStats)).toBe(true);
        expect(Array.isArray(stats.categoryStats)).toBe(true);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      console.log(`Aggregation queries benchmark:
                Average: ${avgTime.toFixed(2)}ms
                Max: ${maxTime}ms`);

      // Performance assertions
      expect(avgTime).toBeLessThan(250); // Average under 250ms
      expect(maxTime).toBeLessThan(600); // Max under 600ms
    });

    it('should benchmark trending projects query', async () => {
      const timeframes = ['1d', '7d', '30d'];
      const iterations = 3;

      for (const timeframe of timeframes) {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();

          const trendingProjects = await projectsService.getTrendingProjects(timeframe, 20);

          const duration = Date.now() - startTime;
          times.push(duration);

          expect(trendingProjects).toBeDefined();
          expect(Array.isArray(trendingProjects)).toBe(true);
          expect(trendingProjects.length).toBeLessThanOrEqual(20);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);

        console.log(`Trending projects benchmark (${timeframe}):
                    Average: ${avgTime.toFixed(2)}ms
                    Max: ${maxTime}ms`);

        // Performance assertions
        expect(avgTime).toBeLessThan(500); // Average under 500ms
        expect(maxTime).toBeLessThan(1200); // Max under 1.2 seconds
      }
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle concurrent queries without pool exhaustion', async () => {
      const concurrentQueries = 50;
      const testUser = testUsers[0];

      const startTime = Date.now();

      // Create many concurrent queries
      const queryPromises = Array.from({ length: concurrentQueries }, (_, i) => {
        const queryType = i % 4;

        switch (queryType) {
          case 0:
            return projectsService.getAllProjectsForUser(testUser.id);
          case 1:
            return profilesService.getProfileByUserId(testUser.id);
          case 2:
            return projectsService.getProjectStatistics(testUser.id);
          case 3:
            return prismaService.project.count({
              where: { ownerId: testUser.id, deletedAt: null },
            });
          default:
            return Promise.resolve(null);
        }
      });

      const results = await Promise.all(queryPromises);
      const totalDuration = Date.now() - startTime;

      console.log(`Concurrent queries benchmark:
                Queries: ${concurrentQueries}
                Total duration: ${totalDuration}ms
                Average per query: ${(totalDuration / concurrentQueries).toFixed(2)}ms`);

      // All queries should complete successfully
      expect(results).toHaveLength(concurrentQueries);
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      // Should handle concurrent load efficiently
      expect(totalDuration).toBeLessThan(10000); // All queries in under 10 seconds
    });

    it('should monitor connection pool health', async () => {
      const poolStats = await prismaService.getConnectionPoolStats();

      console.log('Connection pool statistics:', poolStats);

      expect(poolStats).toBeDefined();
      expect(typeof poolStats.totalConnections).toBe('number');
      expect(typeof poolStats.activeConnections).toBe('number');
      expect(typeof poolStats.idleConnections).toBe('number');
      expect(typeof poolStats.maxConnections).toBe('number');

      // Pool should not be exhausted
      expect(poolStats.totalConnections).toBeLessThanOrEqual(poolStats.maxConnections);
    });
  });

  describe('Index Usage Analysis', () => {
    it('should verify index usage for common queries', async () => {
      const testUser = testUsers[0];

      // Execute queries that should use indexes
      await Promise.all([
        // Should use idx_project_owner_published_featured
        prismaService.project.findMany({
          where: {
            ownerId: testUser.id,
            published: true,
            featured: true,
            deletedAt: null,
          },
        }),

        // Should use idx_project_owner_category_published
        prismaService.project.findMany({
          where: {
            ownerId: testUser.id,
            category: 'web',
            published: true,
            deletedAt: null,
          },
        }),

        // Should use idx_project_tags_gin
        prismaService.project.findMany({
          where: {
            ownerId: testUser.id,
            tags: { hasSome: ['frontend'] },
            deletedAt: null,
          },
        }),

        // Should use idx_project_stars_published
        prismaService.project.findMany({
          where: {
            published: true,
            starCount: { gte: 10 },
            deletedAt: null,
          },
          orderBy: { starCount: 'desc' },
          take: 10,
        }),
      ]);

      // Get performance metrics to verify index usage
      const metrics = await prismaService.getPerformanceMetrics();

      console.log('Database performance metrics:', metrics);

      expect(metrics).toBeDefined();
      expect(typeof metrics.indexUsage).toBe('number');
      expect(typeof metrics.cacheHitRatio).toBe('number');

      // Index usage should be high for optimized queries
      expect(metrics.indexUsage).toBeGreaterThan(50); // At least 50% index usage
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should handle large result sets efficiently', async () => {
      const testUser = testUsers[0];
      const initialMemory = process.memoryUsage();

      // Query large dataset
      const startTime = Date.now();
      const projects = await projectsService.getAllProjectsForUser(testUser.id);
      const queryDuration = Date.now() - startTime;

      const afterQueryMemory = process.memoryUsage();
      const memoryIncrease = afterQueryMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory usage benchmark:
                Projects returned: ${projects.length}
                Query duration: ${queryDuration}ms
                Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB
                Memory per project: ${(memoryIncrease / projects.length / 1024).toFixed(2)} KB`);

      expect(projects.length).toBeGreaterThan(0);
      expect(queryDuration).toBeLessThan(1000); // Query should complete in under 1 second

      // Memory usage should be reasonable
      const memoryPerProject = memoryIncrease / projects.length;
      expect(memoryPerProject).toBeLessThan(50 * 1024); // Less than 50KB per project
    });
  });
});
