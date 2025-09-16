import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ConfigService } from '@nestjs/config';
import { createMockConfigService } from '../../test/test-utils/mocks';

describe('Prisma Database Integration Tests', () => {
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
    // Clean up test data before each test
    await prismaService.project.deleteMany({
      where: { title: { startsWith: 'Test' } },
    });
    await prismaService.user.deleteMany({
      where: { email: { contains: 'test' } },
    });
  });

  describe('User Operations', () => {
    it('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashed-password',
        apiKey: 'hashed-api-key',
      };

      const user = await prismaService.user.create({
        data: userData,
      });

      expect(user).toHaveProperty('id');
      expect(user.email).toBe(userData.email);
      expect(user.username).toBe(userData.username);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce unique email constraint', async () => {
      const userData = {
        email: 'duplicate@example.com',
        username: 'user1',
        password: 'hashed-password',
      };

      await prismaService.user.create({ data: userData });

      await expect(
        prismaService.user.create({
          data: { ...userData, username: 'user2' },
        }),
      ).rejects.toThrow();
    });

    it('should enforce unique username constraint', async () => {
      const userData1 = {
        email: 'user1@example.com',
        username: 'duplicateuser',
        password: 'hashed-password',
      };

      const userData2 = {
        email: 'user2@example.com',
        username: 'duplicateuser',
        password: 'hashed-password',
      };

      await prismaService.user.create({ data: userData1 });

      await expect(prismaService.user.create({ data: userData2 })).rejects.toThrow();
    });

    it('should update user successfully', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'update-test@example.com',
          username: 'updateuser',
          password: 'hashed-password',
        },
      });

      const updatedUser = await prismaService.user.update({
        where: { id: user.id },
        data: {
          username: 'updateduser',
          lastLoginAt: new Date(),
        },
      });

      expect(updatedUser.username).toBe('updateduser');
      expect(updatedUser.lastLoginAt).toBeInstanceOf(Date);
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
    });

    it('should delete user and cascade to related records', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'delete-test@example.com',
          username: 'deleteuser',
          password: 'hashed-password',
        },
      });

      const project = await prismaService.project.create({
        data: {
          ownerId: user.id,
          title: 'Test Project',
          description: 'A test project',
          repoUrl: 'https://github.com/user/test-repo',
          tags: ['test'],
          featured: false,
          published: true,
          markdown: '# Test',
          collaborators: [],
          githubMetadata: {},
          customMetadata: {},
        },
      });

      await prismaService.user.delete({
        where: { id: user.id },
      });

      // Project should be deleted due to cascade
      const deletedProject = await prismaService.project.findUnique({
        where: { id: project.id },
      });
      expect(deletedProject).toBeNull();
    });

    it('should handle user queries with filters', async () => {
      const users = await Promise.all([
        prismaService.user.create({
          data: {
            email: 'active@example.com',
            username: 'activeuser',
            password: 'hashed-password',
            tier: 'premium',
            lastLoginAt: new Date(),
          },
        }),
        prismaService.user.create({
          data: {
            email: 'inactive@example.com',
            username: 'inactiveuser',
            password: 'hashed-password',
            tier: 'free',
            lastLoginAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          },
        }),
      ]);

      // Find premium users
      const premiumUsers = await prismaService.user.findMany({
        where: { tier: 'premium' },
      });
      expect(premiumUsers).toHaveLength(1);
      expect(premiumUsers[0].tier).toBe('premium');

      // Find recently active users (last 7 days)
      const recentlyActive = await prismaService.user.findMany({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      });
      expect(recentlyActive).toHaveLength(1);
      expect(recentlyActive[0].username).toBe('activeuser');
    });
  });

  describe('Project Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await prismaService.user.create({
        data: {
          email: 'project-test@example.com',
          username: 'projectuser',
          password: 'hashed-password',
        },
      });
    });

    it('should create a project successfully', async () => {
      const projectData = {
        ownerId: testUser.id,
        title: 'Test Project',
        description: 'A test project for integration testing',
        tags: ['test', 'integration'],
        repoUrl: 'https://github.com/user/test-repo',
        featured: false,
        published: true,
        category: 'web',
        markdown: '# Test Project\n\nThis is a test.',
        collaborators: ['user1', 'user2'],
        githubMetadata: {
          stars: 10,
          forks: 2,
          language: 'TypeScript',
        },
        customMetadata: {
          customField: 'customValue',
        },
      };

      const project = await prismaService.project.create({
        data: projectData,
      });

      expect(project).toHaveProperty('id');
      expect(project.title).toBe(projectData.title);
      expect(project.tags).toEqual(projectData.tags);
      expect(project.githubMetadata).toEqual(projectData.githubMetadata);
      expect(project.customMetadata).toEqual(projectData.customMetadata);
      expect(project.createdAt).toBeInstanceOf(Date);
    });

    it('should enforce unique constraint on ownerId_repoUrl', async () => {
      const projectData = {
        ownerId: testUser.id,
        title: 'Test Project 1',
        description: 'First project',
        repoUrl: 'https://github.com/user/same-repo',
        tags: ['test'],
        featured: false,
        published: true,
        markdown: '# Test',
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      };

      await prismaService.project.create({ data: projectData });

      await expect(
        prismaService.project.create({
          data: { ...projectData, title: 'Test Project 2' },
        }),
      ).rejects.toThrow();
    });

    it('should update project successfully', async () => {
      const project = await prismaService.project.create({
        data: {
          ownerId: testUser.id,
          title: 'Original Title',
          description: 'Original description',
          repoUrl: 'https://github.com/user/update-test',
          tags: ['original'],
          featured: false,
          published: false,
          markdown: '# Original',
          collaborators: [],
          githubMetadata: {},
          customMetadata: {},
        },
      });

      const updatedProject = await prismaService.project.update({
        where: { id: project.id },
        data: {
          title: 'Updated Title',
          featured: true,
          published: true,
          tags: ['updated', 'test'],
          customMetadata: { updated: true },
        },
      });

      expect(updatedProject.title).toBe('Updated Title');
      expect(updatedProject.featured).toBe(true);
      expect(updatedProject.published).toBe(true);
      expect(updatedProject.tags).toEqual(['updated', 'test']);
      expect(updatedProject.customMetadata).toEqual({ updated: true });
    });

    it('should upsert project correctly', async () => {
      const projectData = {
        ownerId: testUser.id,
        title: 'Upsert Test',
        description: 'Testing upsert functionality',
        repoUrl: 'https://github.com/user/upsert-test',
        tags: ['upsert'],
        featured: false,
        published: true,
        markdown: '# Upsert Test',
        collaborators: [],
        githubMetadata: { stars: 5 },
        customMetadata: {},
      };

      // First upsert (create)
      const project1 = await prismaService.project.upsert({
        where: {
          ownerId_repoUrl: {
            ownerId: testUser.id,
            repoUrl: projectData.repoUrl,
          },
        },
        create: projectData,
        update: {
          title: 'Updated via Upsert',
          githubMetadata: { stars: 10 },
        },
      });

      expect(project1.title).toBe('Upsert Test');
      expect(project1.githubMetadata).toEqual({ stars: 5 });

      // Second upsert (update)
      const project2 = await prismaService.project.upsert({
        where: {
          ownerId_repoUrl: {
            ownerId: testUser.id,
            repoUrl: projectData.repoUrl,
          },
        },
        create: projectData,
        update: {
          title: 'Updated via Upsert',
          githubMetadata: { stars: 10 },
        },
      });

      expect(project2.id).toBe(project1.id);
      expect(project2.title).toBe('Updated via Upsert');
      expect(project2.githubMetadata).toEqual({ stars: 10 });
    });

    it('should handle complex project queries', async () => {
      // Create multiple projects with different attributes
      const projects = await Promise.all([
        prismaService.project.create({
          data: {
            ownerId: testUser.id,
            title: 'React App',
            description: 'A React application',
            repoUrl: 'https://github.com/user/react-app',
            tags: ['react', 'frontend'],
            category: 'web',
            featured: true,
            published: true,
            starCount: 50,
            language: 'JavaScript',
            markdown: '# React App',
            collaborators: [],
            githubMetadata: {},
            customMetadata: {},
          },
        }),
        prismaService.project.create({
          data: {
            ownerId: testUser.id,
            title: 'Node API',
            description: 'A Node.js API',
            repoUrl: 'https://github.com/user/node-api',
            tags: ['nodejs', 'api', 'backend'],
            category: 'api',
            featured: false,
            published: true,
            starCount: 25,
            language: 'TypeScript',
            markdown: '# Node API',
            collaborators: [],
            githubMetadata: {},
            customMetadata: {},
          },
        }),
        prismaService.project.create({
          data: {
            ownerId: testUser.id,
            title: 'Python Script',
            description: 'A Python utility script',
            repoUrl: 'https://github.com/user/python-script',
            tags: ['python', 'utility'],
            category: 'tool',
            featured: false,
            published: false,
            starCount: 5,
            language: 'Python',
            markdown: '# Python Script',
            collaborators: [],
            githubMetadata: {},
            customMetadata: {},
          },
        }),
      ]);

      // Test filtering by category
      const webProjects = await prismaService.project.findMany({
        where: { ownerId: testUser.id, category: 'web' },
      });
      expect(webProjects).toHaveLength(1);
      expect(webProjects[0].title).toBe('React App');

      // Test filtering by tags
      const frontendProjects = await prismaService.project.findMany({
        where: { ownerId: testUser.id, tags: { has: 'frontend' } },
      });
      expect(frontendProjects).toHaveLength(1);

      // Test filtering by multiple tags
      const backendProjects = await prismaService.project.findMany({
        where: {
          ownerId: testUser.id,
          tags: { hasSome: ['backend', 'api'] },
        },
      });
      expect(backendProjects).toHaveLength(1);
      expect(backendProjects[0].title).toBe('Node API');

      // Test filtering by featured status
      const featuredProjects = await prismaService.project.findMany({
        where: { ownerId: testUser.id, featured: true },
      });
      expect(featuredProjects).toHaveLength(1);

      // Test filtering by published status
      const publishedProjects = await prismaService.project.findMany({
        where: { ownerId: testUser.id, published: true },
      });
      expect(publishedProjects).toHaveLength(2);

      // Test ordering by star count
      const projectsByStars = await prismaService.project.findMany({
        where: { ownerId: testUser.id },
        orderBy: { starCount: 'desc' },
      });
      expect(projectsByStars[0].starCount).toBe(50);
      expect(projectsByStars[1].starCount).toBe(25);
      expect(projectsByStars[2].starCount).toBe(5);

      // Test aggregation
      const stats = await prismaService.project.aggregate({
        where: { ownerId: testUser.id, published: true },
        _sum: { starCount: true },
        _avg: { starCount: true },
        _count: { id: true },
      });
      expect(stats._sum.starCount).toBe(75);
      expect(stats._avg.starCount).toBe(37.5);
      expect(stats._count.id).toBe(2);

      // Test groupBy
      const languageStats = await prismaService.project.groupBy({
        by: ['language'],
        where: { ownerId: testUser.id },
        _count: { language: true },
        _sum: { starCount: true },
      });
      expect(languageStats).toHaveLength(3);

      const jsStats = languageStats.find(stat => stat.language === 'JavaScript');
      expect(jsStats?._count.language).toBe(1);
      expect(jsStats?._sum.starCount).toBe(50);
    });
  });

  describe('Audit Log Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await prismaService.user.create({
        data: {
          email: 'audit-test@example.com',
          username: 'audituser',
          password: 'hashed-password',
        },
      });
    });

    it('should create audit log entries', async () => {
      const auditData = {
        userId: testUser.id,
        action: 'project_sync',
        resource: 'project',
        resourceId: 'project-123',
        details: {
          repoUrl: 'https://github.com/user/repo',
          changes: ['title', 'description'],
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const auditLog = await prismaService.auditLog.create({
        data: auditData,
      });

      expect(auditLog).toHaveProperty('id');
      expect(auditLog.userId).toBe(testUser.id);
      expect(auditLog.action).toBe('project_sync');
      expect(auditLog.details).toEqual(auditData.details);
      expect(auditLog.timestamp).toBeInstanceOf(Date);
    });

    it('should query audit logs with filters', async () => {
      const auditEntries = await Promise.all([
        prismaService.auditLog.create({
          data: {
            userId: testUser.id,
            action: 'project_create',
            resource: 'project',
            resourceId: 'project-1',
            details: {},
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
          },
        }),
        prismaService.auditLog.create({
          data: {
            userId: testUser.id,
            action: 'project_update',
            resource: 'project',
            resourceId: 'project-1',
            details: {},
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
          },
        }),
        prismaService.auditLog.create({
          data: {
            userId: testUser.id,
            action: 'user_login',
            resource: 'user',
            resourceId: testUser.id,
            details: {},
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
          },
        }),
      ]);

      // Filter by action
      const projectActions = await prismaService.auditLog.findMany({
        where: {
          userId: testUser.id,
          action: { startsWith: 'project_' },
        },
        orderBy: { timestamp: 'desc' },
      });
      expect(projectActions).toHaveLength(2);

      // Filter by resource
      const userActions = await prismaService.auditLog.findMany({
        where: {
          userId: testUser.id,
          resource: 'user',
        },
      });
      expect(userActions).toHaveLength(1);

      // Filter by date range
      const recentActions = await prismaService.auditLog.findMany({
        where: {
          userId: testUser.id,
          timestamp: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      });
      expect(recentActions).toHaveLength(3);
    });
  });

  describe('Transaction Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await prismaService.user.create({
        data: {
          email: 'transaction-test@example.com',
          username: 'transactionuser',
          password: 'hashed-password',
        },
      });
    });

    it('should handle successful transactions', async () => {
      const result = await prismaService.$transaction(async tx => {
        const project = await tx.project.create({
          data: {
            ownerId: testUser.id,
            title: 'Transaction Test Project',
            description: 'Testing transactions',
            repoUrl: 'https://github.com/user/transaction-test',
            tags: ['transaction'],
            featured: false,
            published: true,
            markdown: '# Transaction Test',
            collaborators: [],
            githubMetadata: {},
            customMetadata: {},
          },
        });

        const auditLog = await tx.auditLog.create({
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

        return { project, auditLog };
      });

      expect(result.project).toHaveProperty('id');
      expect(result.auditLog).toHaveProperty('id');
      expect(result.auditLog.resourceId).toBe(result.project.id);

      // Verify both records exist
      const project = await prismaService.project.findUnique({
        where: { id: result.project.id },
      });
      const auditLog = await prismaService.auditLog.findUnique({
        where: { id: result.auditLog.id },
      });

      expect(project).not.toBeNull();
      expect(auditLog).not.toBeNull();
    });

    it('should rollback failed transactions', async () => {
      const initialProjectCount = await prismaService.project.count({
        where: { ownerId: testUser.id },
      });

      await expect(
        prismaService.$transaction(async tx => {
          await tx.project.create({
            data: {
              ownerId: testUser.id,
              title: 'Transaction Rollback Test',
              description: 'This should be rolled back',
              repoUrl: 'https://github.com/user/rollback-test',
              tags: ['rollback'],
              featured: false,
              published: true,
              markdown: '# Rollback Test',
              collaborators: [],
              githubMetadata: {},
              customMetadata: {},
            },
          });

          // This will cause the transaction to fail
          throw new Error('Intentional transaction failure');
        }),
      ).rejects.toThrow('Intentional transaction failure');

      // Verify no project was created
      const finalProjectCount = await prismaService.project.count({
        where: { ownerId: testUser.id },
      });
      expect(finalProjectCount).toBe(initialProjectCount);
    });
  });

  describe('Performance Tests', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await prismaService.user.create({
        data: {
          email: 'performance-test@example.com',
          username: 'performanceuser',
          password: 'hashed-password',
        },
      });
    });

    it('should handle bulk operations efficiently', async () => {
      const projectsData = Array.from({ length: 100 }, (_, i) => ({
        ownerId: testUser.id,
        title: `Bulk Test Project ${i}`,
        description: `Description for project ${i}`,
        repoUrl: `https://github.com/user/bulk-test-${i}`,
        tags: [`tag${i % 5}`, 'bulk-test'],
        featured: i % 10 === 0,
        published: true,
        category: i % 2 === 0 ? 'web' : 'api',
        starCount: Math.floor(Math.random() * 100),
        language: i % 3 === 0 ? 'TypeScript' : i % 3 === 1 ? 'JavaScript' : 'Python',
        markdown: `# Project ${i}`,
        collaborators: [],
        githubMetadata: { stars: Math.floor(Math.random() * 50) },
        customMetadata: { index: i },
      }));

      const startTime = Date.now();

      // Use createMany for bulk insert
      const result = await prismaService.project.createMany({
        data: projectsData,
      });

      const duration = Date.now() - startTime;

      expect(result.count).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify projects were created
      const createdProjects = await prismaService.project.findMany({
        where: { ownerId: testUser.id, title: { startsWith: 'Bulk Test' } },
      });
      expect(createdProjects).toHaveLength(100);
    });

    it('should handle complex queries efficiently', async () => {
      // Create test data
      await prismaService.project.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          ownerId: testUser.id,
          title: `Performance Test ${i}`,
          description: `Performance test project ${i}`,
          repoUrl: `https://github.com/user/perf-test-${i}`,
          tags: [`perf${i % 3}`, 'performance'],
          featured: i % 5 === 0,
          published: i % 4 !== 0,
          category: i % 2 === 0 ? 'web' : 'api',
          starCount: i * 2,
          language: i % 2 === 0 ? 'TypeScript' : 'JavaScript',
          markdown: `# Performance Test ${i}`,
          collaborators: [],
          githubMetadata: {},
          customMetadata: {},
        })),
      });

      const startTime = Date.now();

      // Complex query with multiple filters, sorting, and aggregation
      const [projects, stats, languageStats] = await Promise.all([
        prismaService.project.findMany({
          where: {
            ownerId: testUser.id,
            published: true,
            starCount: { gte: 10 },
            tags: { hasSome: ['performance'] },
          },
          orderBy: [{ featured: 'desc' }, { starCount: 'desc' }],
          take: 10,
        }),
        prismaService.project.aggregate({
          where: { ownerId: testUser.id },
          _sum: { starCount: true },
          _avg: { starCount: true },
          _max: { starCount: true },
          _min: { starCount: true },
          _count: { id: true },
        }),
        prismaService.project.groupBy({
          by: ['language'],
          where: { ownerId: testUser.id },
          _count: { language: true },
          _sum: { starCount: true },
        }),
      ]);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(projects.length).toBeGreaterThan(0);
      expect(stats._count.id).toBe(50);
      expect(languageStats.length).toBe(2);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'integrity-test@example.com',
          username: 'integrityuser',
          password: 'hashed-password',
        },
      });

      const project = await prismaService.project.create({
        data: {
          ownerId: user.id,
          title: 'Integrity Test Project',
          description: 'Testing referential integrity',
          repoUrl: 'https://github.com/user/integrity-test',
          tags: ['integrity'],
          featured: false,
          published: true,
          markdown: '# Integrity Test',
          collaborators: [],
          githubMetadata: {},
          customMetadata: {},
        },
      });

      // Try to create project with non-existent user
      await expect(
        prismaService.project.create({
          data: {
            ownerId: 'non-existent-user-id',
            title: 'Invalid Project',
            description: 'This should fail',
            repoUrl: 'https://github.com/user/invalid',
            tags: [],
            featured: false,
            published: true,
            markdown: '# Invalid',
            collaborators: [],
            githubMetadata: {},
            customMetadata: {},
          },
        }),
      ).rejects.toThrow();

      // Verify original project still exists
      const existingProject = await prismaService.project.findUnique({
        where: { id: project.id },
      });
      expect(existingProject).not.toBeNull();
    });

    it('should handle concurrent operations safely', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'concurrent-test@example.com',
          username: 'concurrentuser',
          password: 'hashed-password',
        },
      });

      // Simulate concurrent updates to the same user
      const concurrentUpdates = Array.from({ length: 10 }, (_, i) =>
        prismaService.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }),
      );

      const results = await Promise.all(concurrentUpdates);

      // All updates should succeed
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.id).toBe(user.id);
        expect(result.lastLoginAt).toBeInstanceOf(Date);
      });
    });
  });
});
