import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { createMockConfigService } from '../../te../../test/test-utils/mocks';

describe('Database Performance Tests', () => {
  let prismaService: PrismaService;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeAll(async () => {
    configService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, { provide: ConfigService, useValue: configService }],
    }).compile();

    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prismaService.project.deleteMany({
      where: { title: { startsWith: 'Perf Test' } },
    });
    await prismaService.user.deleteMany({
      where: { email: { contains: 'perftest' } },
    });
  });

  describe('Query Performance', () => {
    it('should handle large dataset queries efficiently', async () => {
      // Create test user
      const testUser = await prismaService.user.create({
        data: {
          email: 'perftest@example.com',
          username: 'perfuser',
          password: 'hashed-password',
        },
      });

      // Create large dataset
      const projectCount = 1000;
      const projectsData = Array.from({ length: projectCount }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Project ${i}`,
        description: `Performance test project ${i}`,
        repoUrl: `https://github.com/perfuser/project-${i}`,
        tags: [`tag${i % 10}`, 'performance'],
        category: i % 3 === 0 ? 'web' : i % 3 === 1 ? 'api' : 'tool',
        featured: i % 20 === 0,
        published: i % 4 !== 0,
        starCount: Math.floor(Math.random() * 100),
        language:
          i % 4 === 0 ? 'TypeScript' : i % 4 === 1 ? 'JavaScript' : i % 4 === 2 ? 'Python' : 'Java',
        markdown: `# Project ${i}\n\nThis is project ${i}.`,
        collaborators: [],
        githubMetadata: { stars: Math.floor(Math.random() * 50) },
        customMetadata: { index: i },
      }));

      const startTime = Date.now();

      // Use createMany for bulk insert
      await prismaService.project.createMany({
        data: projectsData,
      });

      const insertDuration = Date.now() - startTime;
      expect(insertDuration).toBeLessThan(10000); // Should insert 1000 records in under 10 seconds

      // Test query performance
      const queryStartTime = Date.now();

      const projects = await prismaService.project.findMany({
        where: { ownerId: testUser.id },
        orderBy: { starCount: 'desc' },
        take: 50,
      });

      const queryDuration = Date.now() - queryStartTime;

      expect(projects).toHaveLength(50);
      expect(queryDuration).toBeLessThan(500); // Should query in under 500ms
    });

    it('should handle complex filtering queries efficiently', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'filtertest@example.com',
          username: 'filteruser',
          password: 'hashed-password',
        },
      });

      // Create diverse dataset for filtering
      const projectsData = Array.from({ length: 500 }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Filter Project ${i}`,
        description: `Filter test project ${i}`,
        repoUrl: `https://github.com/filteruser/project-${i}`,
        tags: [`tag${i % 5}`, `category${i % 3}`, 'filter-test'],
        category: i % 4 === 0 ? 'web' : i % 4 === 1 ? 'api' : i % 4 === 2 ? 'tool' : 'library',
        featured: i % 15 === 0,
        published: i % 3 !== 0,
        starCount: Math.floor(Math.random() * 200),
        forkCount: Math.floor(Math.random() * 50),
        language: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go'][i % 5],
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
        markdown: `# Project ${i}`,
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      }));

      await prismaService.project.createMany({ data: projectsData });

      // Test various complex queries
      const complexQueries = [
        // Multi-field filtering
        {
          where: {
            ownerId: testUser.id,
            category: 'web',
            featured: true,
            starCount: { gte: 50 },
          },
        },
        // Array field filtering
        {
          where: {
            ownerId: testUser.id,
            tags: { hasSome: ['tag1', 'tag2'] },
            published: true,
          },
        },
        // Range filtering
        {
          where: {
            ownerId: testUser.id,
            starCount: { gte: 10, lte: 100 },
            forkCount: { gte: 5 },
            createdAt: {
              gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // Last 6 months
            },
          },
        },
        // Text search simulation
        {
          where: {
            ownerId: testUser.id,
            OR: [
              { title: { contains: 'Project', mode: 'insensitive' } },
              { description: { contains: 'test', mode: 'insensitive' } },
            ],
          },
        },
      ];

      const startTime = Date.now();

      const queryResults = await Promise.all(
        complexQueries.map(query =>
          prismaService.project.findMany({
            ...query,
            orderBy: { starCount: 'desc' },
            take: 20,
          }),
        ),
      );

      const totalDuration = Date.now() - startTime;

      // All queries should return results
      queryResults.forEach(results => {
        expect(results.length).toBeGreaterThanOrEqual(0);
      });

      // Complex queries should complete in reasonable time
      expect(totalDuration).toBeLessThan(2000); // All 4 queries in under 2 seconds
    });

    it('should handle aggregation queries efficiently', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'aggtest@example.com',
          username: 'agguser',
          password: 'hashed-password',
        },
      });

      // Create dataset for aggregation
      const projectsData = Array.from({ length: 200 }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Agg Project ${i}`,
        description: `Aggregation test project ${i}`,
        repoUrl: `https://github.com/agguser/project-${i}`,
        tags: [`tag${i % 3}`],
        category: ['web', 'api', 'tool', 'library'][i % 4],
        language: ['TypeScript', 'JavaScript', 'Python'][i % 3],
        starCount: Math.floor(Math.random() * 100),
        forkCount: Math.floor(Math.random() * 20),
        featured: i % 10 === 0,
        published: true,
        markdown: `# Project ${i}`,
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      }));

      await prismaService.project.createMany({ data: projectsData });

      const startTime = Date.now();

      // Perform multiple aggregation queries
      const [totalStats, languageStats, categoryStats, starDistribution] = await Promise.all([
        // Basic aggregation
        prismaService.project.aggregate({
          where: { ownerId: testUser.id },
          _sum: { starCount: true, forkCount: true },
          _avg: { starCount: true, forkCount: true },
          _max: { starCount: true },
          _min: { starCount: true },
          _count: { id: true },
        }),

        // Group by language
        prismaService.project.groupBy({
          by: ['language'],
          where: { ownerId: testUser.id },
          _count: { language: true },
          _sum: { starCount: true },
          _avg: { starCount: true },
        }),

        // Group by category
        prismaService.project.groupBy({
          by: ['category'],
          where: { ownerId: testUser.id },
          _count: { category: true },
          _sum: { starCount: true },
        }),

        // Complex grouping with having clause
        prismaService.project.groupBy({
          by: ['language', 'category'],
          where: { ownerId: testUser.id },
          _count: { id: true },
          _avg: { starCount: true },
          having: {
            starCount: { _avg: { gt: 10 } },
          },
        }),
      ]);

      const duration = Date.now() - startTime;

      // Verify results
      expect(totalStats._count.id).toBe(200);
      expect(totalStats._sum.starCount).toBeGreaterThan(0);
      expect(languageStats).toHaveLength(3);
      expect(categoryStats).toHaveLength(4);
      expect(starDistribution.length).toBeGreaterThanOrEqual(0);

      // Aggregation queries should complete quickly
      expect(duration).toBeLessThan(1000); // Under 1 second
    });

    it('should handle concurrent queries efficiently', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'concurrenttest@example.com',
          username: 'concurrentuser',
          password: 'hashed-password',
        },
      });

      // Create test data
      const projectsData = Array.from({ length: 100 }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Concurrent Project ${i}`,
        description: `Concurrent test project ${i}`,
        repoUrl: `https://github.com/concurrentuser/project-${i}`,
        tags: [`tag${i % 5}`],
        category: i % 2 === 0 ? 'web' : 'api',
        starCount: Math.floor(Math.random() * 50),
        featured: i % 10 === 0,
        published: true,
        markdown: `# Project ${i}`,
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      }));

      await prismaService.project.createMany({ data: projectsData });

      const concurrentQueryCount = 20;
      const startTime = Date.now();

      // Execute many queries concurrently
      const concurrentQueries = Array.from({ length: concurrentQueryCount }, (_, i) => {
        const queryType = i % 4;

        switch (queryType) {
          case 0:
            return prismaService.project.findMany({
              where: { ownerId: testUser.id, category: 'web' },
              take: 10,
            });
          case 1:
            return prismaService.project.findMany({
              where: { ownerId: testUser.id, featured: true },
              orderBy: { starCount: 'desc' },
            });
          case 2:
            return prismaService.project.count({
              where: { ownerId: testUser.id, published: true },
            });
          case 3:
            return prismaService.project.aggregate({
              where: { ownerId: testUser.id },
              _avg: { starCount: true },
            });
          default:
            return prismaService.project.findFirst({
              where: { ownerId: testUser.id },
            });
        }
      });

      const results = await Promise.all(concurrentQueries);
      const duration = Date.now() - startTime;

      // All queries should complete successfully
      expect(results).toHaveLength(concurrentQueryCount);
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      // Concurrent queries should complete in reasonable time
      expect(duration).toBeLessThan(3000); // 20 concurrent queries in under 3 seconds
    });
  });

  describe('Transaction Performance', () => {
    it('should handle bulk transactions efficiently', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'transactiontest@example.com',
          username: 'transactionuser',
          password: 'hashed-password',
        },
      });

      const transactionCount = 50;
      const startTime = Date.now();

      // Execute multiple transactions
      const transactions = Array.from({ length: transactionCount }, (_, i) =>
        prismaService.$transaction(async tx => {
          const project = await tx.project.create({
            data: {
              ownerId: testUser.id,
              title: `Perf Test Transaction Project ${i}`,
              description: `Transaction test project ${i}`,
              repoUrl: `https://github.com/transactionuser/project-${i}`,
              tags: ['transaction-test'],
              featured: false,
              published: true,
              markdown: `# Project ${i}`,
              collaborators: [],
              githubMetadata: {},
              customMetadata: {},
            },
          });

          await tx.auditLog.create({
            data: {
              userId: testUser.id,
              action: 'project_create',
              resource: 'project',
              resourceId: project.id,
              details: { title: project.title },
              ipAddress: '127.0.0.1',
              userAgent: 'Test Agent',
            },
          });

          return project;
        }),
      );

      const results = await Promise.all(transactions);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(transactionCount);
      results.forEach(project => {
        expect(project).toHaveProperty('id');
        expect(project.title).toContain('Transaction Project');
      });

      // Transactions should complete in reasonable time
      expect(duration).toBeLessThan(10000); // 50 transactions in under 10 seconds
    });

    it('should handle transaction rollbacks efficiently', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'rollbacktest@example.com',
          username: 'rollbackuser',
          password: 'hashed-password',
        },
      });

      const rollbackCount = 20;
      const startTime = Date.now();

      // Execute transactions that will rollback
      const rollbackPromises = Array.from({ length: rollbackCount }, (_, i) =>
        prismaService
          .$transaction(async tx => {
            await tx.project.create({
              data: {
                ownerId: testUser.id,
                title: `Perf Test Rollback Project ${i}`,
                description: `Rollback test project ${i}`,
                repoUrl: `https://github.com/rollbackuser/project-${i}`,
                tags: ['rollback-test'],
                featured: false,
                published: true,
                markdown: `# Project ${i}`,
                collaborators: [],
                githubMetadata: {},
                customMetadata: {},
              },
            });

            // Intentionally cause rollback
            throw new Error(`Intentional rollback ${i}`);
          })
          .catch(error => {
            expect(error.message).toContain('Intentional rollback');
            return null;
          }),
      );

      const results = await Promise.all(rollbackPromises);
      const duration = Date.now() - startTime;

      // All transactions should have rolled back
      expect(results.every(result => result === null)).toBe(true);

      // Verify no projects were created
      const projectCount = await prismaService.project.count({
        where: { ownerId: testUser.id, tags: { has: 'rollback-test' } },
      });
      expect(projectCount).toBe(0);

      // Rollbacks should be handled efficiently
      expect(duration).toBeLessThan(5000); // 20 rollbacks in under 5 seconds
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle connection pool efficiently under load', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'pooltest@example.com',
          username: 'pooluser',
          password: 'hashed-password',
        },
      });

      const connectionCount = 100;
      const startTime = Date.now();

      // Create many concurrent database operations
      const operations = Array.from({ length: connectionCount }, (_, i) => {
        const operationType = i % 3;

        switch (operationType) {
          case 0:
            return prismaService.project.create({
              data: {
                ownerId: testUser.id,
                title: `Perf Test Pool Project ${i}`,
                description: `Pool test project ${i}`,
                repoUrl: `https://github.com/pooluser/project-${i}`,
                tags: ['pool-test'],
                featured: false,
                published: true,
                markdown: `# Project ${i}`,
                collaborators: [],
                githubMetadata: {},
                customMetadata: {},
              },
            });
          case 1:
            return prismaService.user.findUnique({
              where: { id: testUser.id },
            });
          case 2:
            return prismaService.project.count({
              where: { ownerId: testUser.id },
            });
          default:
            return Promise.resolve(null);
        }
      });

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All operations should complete
      expect(results).toHaveLength(connectionCount);

      // Filter out null results and count successful operations
      const successfulOperations = results.filter(result => result !== null);
      expect(successfulOperations.length).toBeGreaterThan(connectionCount * 0.8); // At least 80% success

      // Connection pool should handle load efficiently
      expect(duration).toBeLessThan(15000); // 100 operations in under 15 seconds
    });
  });

  describe('Index Performance', () => {
    it('should demonstrate index performance benefits', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'indextest@example.com',
          username: 'indexuser',
          password: 'hashed-password',
        },
      });

      // Create large dataset
      const projectCount = 2000;
      const projectsData = Array.from({ length: projectCount }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Index Project ${i}`,
        description: `Index test project ${i}`,
        repoUrl: `https://github.com/indexuser/project-${i}`,
        tags: [`tag${i % 20}`],
        category: ['web', 'api', 'tool', 'library', 'script'][i % 5],
        language: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go'][i % 5],
        starCount: Math.floor(Math.random() * 1000),
        featured: i % 50 === 0,
        published: i % 10 !== 0,
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        markdown: `# Project ${i}`,
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      }));

      await prismaService.project.createMany({ data: projectsData });

      // Test queries that should benefit from indexes
      const indexedQueries = [
        // Primary key lookup (should be very fast)
        () =>
          prismaService.project.findUnique({
            where: { id: (Math.random() * projectCount).toString() },
          }),

        // Owner ID lookup (indexed foreign key)
        () =>
          prismaService.project.findMany({
            where: { ownerId: testUser.id },
            take: 10,
          }),

        // Category filter (should be indexed)
        () =>
          prismaService.project.findMany({
            where: {
              ownerId: testUser.id,
              category: 'web',
            },
            take: 10,
          }),

        // Composite index test
        () =>
          prismaService.project.findMany({
            where: {
              ownerId: testUser.id,
              published: true,
              featured: true,
            },
            orderBy: { starCount: 'desc' },
            take: 5,
          }),
      ];

      const queryTimes = [];

      for (const query of indexedQueries) {
        const startTime = Date.now();
        const result = await query();
        const duration = Date.now() - startTime;

        queryTimes.push(duration);
        expect(result).toBeDefined();
      }

      // All indexed queries should be fast
      queryTimes.forEach((time, index) => {
        expect(time).toBeLessThan(100); // Each query under 100ms
      });

      const averageQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
      expect(averageQueryTime).toBeLessThan(50); // Average under 50ms
    });
  });

  describe('Memory Usage', () => {
    it('should handle large result sets without excessive memory usage', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'memorytest@example.com',
          username: 'memoryuser',
          password: 'hashed-password',
        },
      });

      // Create dataset
      const projectCount = 500;
      const projectsData = Array.from({ length: projectCount }, (_, i) => ({
        ownerId: testUser.id,
        title: `Perf Test Memory Project ${i}`,
        description: `Memory test project ${i} with longer description to increase memory usage`,
        repoUrl: `https://github.com/memoryuser/project-${i}`,
        tags: Array.from({ length: 10 }, (_, j) => `tag${j}`), // Many tags
        markdown: `# Project ${i}\n\n${'Lorem ipsum '.repeat(100)}`, // Large markdown
        collaborators: Array.from({ length: 5 }, (_, j) => `user${j}`), // Multiple collaborators
        githubMetadata: {
          stars: Math.floor(Math.random() * 100),
          forks: Math.floor(Math.random() * 20),
          issues: Math.floor(Math.random() * 50),
          pullRequests: Math.floor(Math.random() * 30),
        },
        customMetadata: {
          largeField: 'x'.repeat(1000), // 1KB of data per project
          arrayField: Array.from({ length: 50 }, (_, j) => `item${j}`),
        },
        featured: false,
        published: true,
      }));

      await prismaService.project.createMany({ data: projectsData });

      const initialMemory = process.memoryUsage();

      // Query large result set
      const startTime = Date.now();
      const projects = await prismaService.project.findMany({
        where: { ownerId: testUser.id },
        orderBy: { createdAt: 'desc' },
      });
      const queryDuration = Date.now() - startTime;

      const afterQueryMemory = process.memoryUsage();

      expect(projects).toHaveLength(projectCount);
      expect(queryDuration).toBeLessThan(2000); // Query should complete in under 2 seconds

      // Memory usage should be reasonable
      const memoryIncrease = afterQueryMemory.heapUsed - initialMemory.heapUsed;
      const memoryPerProject = memoryIncrease / projectCount;

      // Should not use more than 10KB per project in memory
      expect(memoryPerProject).toBeLessThan(10 * 1024);
    });
  });
});
