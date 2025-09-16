import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { createMockConfigService } from '../../test/test-utils/mocks';

describe('Database Fixes Integration Tests', () => {
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

  describe('Index Verification', () => {
    it('should verify that performance indexes exist', async () => {
      const indexes = await prismaService.$queryRaw<
        Array<{
          indexname: string;
          tablename: string;
          indexdef: string;
        }>
      >`
                SELECT indexname, tablename, indexdef
                FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND indexname LIKE 'idx_%'
                ORDER BY tablename, indexname
            `;

      expect(Array.isArray(indexes)).toBe(true);
      expect(indexes.length).toBeGreaterThan(0);

      // Check for specific critical indexes
      const indexNames = indexes.map(idx => idx.indexname);

      // User table indexes
      expect(indexNames).toContain('idx_user_email_deleted');
      expect(indexNames).toContain('idx_user_api_key_active');
      expect(indexNames).toContain('idx_user_tier_active');

      // Project table indexes
      expect(indexNames).toContain('idx_project_owner_published_featured');
      expect(indexNames).toContain('idx_project_owner_category_published');
      expect(indexNames).toContain('idx_project_tags_gin');
      expect(indexNames).toContain('idx_project_search_text');

      // Sync history indexes
      expect(indexNames).toContain('idx_sync_history_user_started_desc');
      expect(indexNames).toContain('idx_sync_history_status_started');

      console.log(`✅ Verified ${indexes.length} performance indexes`);
    });

    it('should verify GIN indexes for array and JSON fields', async () => {
      const ginIndexes = await prismaService.$queryRaw<
        Array<{
          indexname: string;
          tablename: string;
        }>
      >`
                SELECT i.indexname, i.tablename
                FROM pg_indexes i
                JOIN pg_class c ON c.relname = i.indexname
                JOIN pg_am am ON am.oid = c.relam
                WHERE i.schemaname = 'public' 
                AND am.amname = 'gin'
                AND i.indexname LIKE 'idx_%'
            `;

      expect(Array.isArray(ginIndexes)).toBe(true);
      expect(ginIndexes.length).toBeGreaterThan(0);

      const ginIndexNames = ginIndexes.map(idx => idx.indexname);

      // Verify specific GIN indexes
      expect(ginIndexNames).toContain('idx_project_tags_gin');
      expect(ginIndexNames).toContain('idx_project_topics_gin');
      expect(ginIndexNames).toContain('idx_project_search_text');

      console.log(`✅ Verified ${ginIndexes.length} GIN indexes for arrays and full-text search`);
    });
  });

  describe('Constraint Verification', () => {
    it('should verify check constraints exist', async () => {
      const constraints = await prismaService.$queryRaw<
        Array<{
          constraint_name: string;
          table_name: string;
          constraint_type: string;
        }>
      >`
                SELECT constraint_name, table_name, constraint_type
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'public'
                AND constraint_type = 'CHECK'
                AND constraint_name LIKE 'chk_%'
                ORDER BY table_name, constraint_name
            `;

      expect(Array.isArray(constraints)).toBe(true);
      expect(constraints.length).toBeGreaterThan(0);

      const constraintNames = constraints.map(c => c.constraint_name);

      // Verify specific check constraints
      expect(constraintNames).toContain('chk_user_tier');
      expect(constraintNames).toContain('chk_project_platform');
      expect(constraintNames).toContain('chk_project_star_count');
      expect(constraintNames).toContain('chk_sync_history_operation');

      console.log(`✅ Verified ${constraints.length} check constraints`);
    });

    it('should verify foreign key constraints with proper cascade behavior', async () => {
      const foreignKeys = await prismaService.$queryRaw<
        Array<{
          constraint_name: string;
          table_name: string;
          column_name: string;
          foreign_table_name: string;
          foreign_column_name: string;
          delete_rule: string;
        }>
      >`
                SELECT 
                    tc.constraint_name,
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name,
                    rc.delete_rule
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                JOIN information_schema.referential_constraints AS rc
                    ON tc.constraint_name = rc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
                ORDER BY tc.table_name, tc.constraint_name
            `;

      expect(Array.isArray(foreignKeys)).toBe(true);
      expect(foreignKeys.length).toBeGreaterThan(0);

      // Verify cascade behavior for critical relationships
      const cascadeConstraints = foreignKeys.filter(fk => fk.delete_rule === 'CASCADE');
      expect(cascadeConstraints.length).toBeGreaterThan(0);

      console.log(
        `✅ Verified ${foreignKeys.length} foreign key constraints (${cascadeConstraints.length} with CASCADE)`,
      );
    });
  });

  describe('Soft Delete Functionality', () => {
    it('should test soft delete operations', async () => {
      // Create test user
      const testUser = await prismaService.user.create({
        data: {
          email: 'softdelete-test@example.com',
          username: 'softdeleteuser',
          password: 'hashed-password',
        },
      });

      // Create test project
      const testProject = await prismaService.project.create({
        data: {
          ownerId: testUser.id,
          title: 'Soft Delete Test Project',
          description: 'Test project for soft delete functionality',
          repoUrl: 'https://github.com/test/soft-delete-test',
          tags: ['test'],
          featured: false,
          published: true,
          markdown: '# Test Project',
          collaborators: [],
          githubMetadata: {},
          customMetadata: {},
        },
      });

      // Test soft delete
      const softDeletedProject = await prismaService.softDelete('project', {
        id: testProject.id,
      });
      expect(softDeletedProject.deletedAt).toBeDefined();
      expect(softDeletedProject.deletedAt).toBeInstanceOf(Date);

      // Verify project is excluded from active queries
      const activeProjects = await prismaService.findManyActive('project', {
        where: { ownerId: testUser.id },
      });
      expect(activeProjects.find(p => p.id === testProject.id)).toBeUndefined();

      // Test restore
      const restoredProject = await prismaService.restore('project', {
        id: testProject.id,
      });
      expect(restoredProject.deletedAt).toBeNull();

      // Verify project is included in active queries again
      const activeProjectsAfterRestore = await prismaService.findManyActive('project', {
        where: { ownerId: testUser.id },
      });
      expect(activeProjectsAfterRestore.find(p => p.id === testProject.id)).toBeDefined();

      // Cleanup
      await prismaService.project.delete({ where: { id: testProject.id } });
      await prismaService.user.delete({ where: { id: testUser.id } });
    });

    it('should test batch soft delete operations', async () => {
      // Create test user
      const testUser = await prismaService.user.create({
        data: {
          email: 'batch-softdelete-test@example.com',
          username: 'batchsoftdeleteuser',
          password: 'hashed-password',
        },
      });

      // Create multiple test projects
      const projectsData = Array.from({ length: 5 }, (_, i) => ({
        ownerId: testUser.id,
        title: `Batch Soft Delete Test Project ${i}`,
        description: `Test project ${i} for batch soft delete`,
        repoUrl: `https://github.com/test/batch-soft-delete-${i}`,
        tags: ['batch-test'],
        featured: false,
        published: true,
        markdown: `# Test Project ${i}`,
        collaborators: [],
        githubMetadata: {},
        customMetadata: {},
      }));

      const createdProjects = await prismaService.batchCreate('project', projectsData);
      expect(createdProjects.count).toBe(5);

      // Test batch soft delete
      const batchDeleteResult = await prismaService.softDeleteMany('project', {
        ownerId: testUser.id,
        tags: { has: 'batch-test' },
      });
      expect(batchDeleteResult.count).toBe(5);

      // Verify all projects are soft deleted
      const activeCount = await prismaService.countActive('project', {
        ownerId: testUser.id,
        tags: { has: 'batch-test' },
      });
      expect(activeCount).toBe(0);

      // Cleanup
      await prismaService.project.deleteMany({
        where: { ownerId: testUser.id, tags: { has: 'batch-test' } },
      });
      await prismaService.user.delete({ where: { id: testUser.id } });
    });
  });

  describe('Connection Pool Performance', () => {
    it('should test connection pool statistics', async () => {
      const poolStats = await prismaService.getConnectionPoolStats();

      expect(poolStats).toBeDefined();
      expect(typeof poolStats.totalConnections).toBe('number');
      expect(typeof poolStats.activeConnections).toBe('number');
      expect(typeof poolStats.idleConnections).toBe('number');
      expect(typeof poolStats.maxConnections).toBe('number');

      expect(poolStats.totalConnections).toBeGreaterThanOrEqual(0);
      expect(poolStats.activeConnections).toBeGreaterThanOrEqual(0);
      expect(poolStats.idleConnections).toBeGreaterThanOrEqual(0);
      expect(poolStats.maxConnections).toBeGreaterThan(0);

      // Total should not exceed max
      expect(poolStats.totalConnections).toBeLessThanOrEqual(poolStats.maxConnections);

      console.log('Connection pool stats:', poolStats);
    });

    it('should handle concurrent connections efficiently', async () => {
      const concurrentQueries = 20;
      const startTime = Date.now();

      // Create concurrent database operations
      const queryPromises = Array.from({ length: concurrentQueries }, (_, i) => {
        return prismaService.user.count();
      });

      const results = await Promise.all(queryPromises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentQueries);
      results.forEach(result => {
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
      });

      // Should handle concurrent queries efficiently
      expect(duration).toBeLessThan(5000); // Under 5 seconds for 20 queries

      console.log(`Concurrent queries test: ${concurrentQueries} queries in ${duration}ms`);
    });
  });

  describe('Transaction Performance', () => {
    it('should test enhanced transaction functionality', async () => {
      const testUser = await prismaService.user.create({
        data: {
          email: 'transaction-test@example.com',
          username: 'transactionuser',
          password: 'hashed-password',
        },
      });

      // Test successful transaction
      const result = await prismaService.executeTransaction(async tx => {
        const project = await tx.project.create({
          data: {
            ownerId: testUser.id,
            title: 'Transaction Test Project',
            description: 'Test project for transaction functionality',
            repoUrl: 'https://github.com/test/transaction-test',
            tags: ['transaction-test'],
            featured: false,
            published: true,
            markdown: '# Transaction Test',
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
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Transaction Test Project');

      // Verify both records were created
      const project = await prismaService.project.findUnique({
        where: { id: result.id },
      });
      expect(project).toBeDefined();

      const auditLog = await prismaService.auditLog.findFirst({
        where: { resourceId: result.id },
      });
      expect(auditLog).toBeDefined();

      // Test transaction rollback
      await expect(
        prismaService.executeTransaction(async tx => {
          await tx.project.create({
            data: {
              ownerId: testUser.id,
              title: 'Rollback Test Project',
              description: 'This should be rolled back',
              repoUrl: 'https://github.com/test/rollback-test',
              tags: ['rollback-test'],
              featured: false,
              published: true,
              markdown: '# Rollback Test',
              collaborators: [],
              githubMetadata: {},
              customMetadata: {},
            },
          });

          // Intentionally cause rollback
          throw new Error('Intentional rollback');
        }),
      ).rejects.toThrow('Intentional rollback');

      // Verify rollback worked
      const rollbackProject = await prismaService.project.findFirst({
        where: { title: 'Rollback Test Project' },
      });
      expect(rollbackProject).toBeNull();

      // Cleanup
      await prismaService.auditLog.deleteMany({
        where: { userId: testUser.id },
      });
      await prismaService.project.delete({ where: { id: result.id } });
      await prismaService.user.delete({ where: { id: testUser.id } });
    });

    it('should test transaction retry logic', async () => {
      let attemptCount = 0;

      // Mock a retryable error on first attempt
      const originalExecuteRaw = prismaService.$executeRaw;
      prismaService.$executeRaw = jest.fn().mockImplementation((...args) => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('Serialization failure') as any;
          error.code = '40001'; // Serialization failure code
          throw error;
        }
        return originalExecuteRaw.apply(prismaService, args);
      });

      const testUser = await prismaService.user.create({
        data: {
          email: 'retry-test@example.com',
          username: 'retryuser',
          password: 'hashed-password',
        },
      });

      // This should succeed after retry
      const result = await prismaService.executeTransaction(async tx => {
        return tx.user.findUnique({ where: { id: testUser.id } });
      });

      expect(result).toBeDefined();
      expect(attemptCount).toBeGreaterThan(1); // Should have retried

      // Restore original method
      prismaService.$executeRaw = originalExecuteRaw;

      // Cleanup
      await prismaService.user.delete({ where: { id: testUser.id } });
    });
  });

  describe('Performance Metrics', () => {
    it('should test database performance metrics collection', async () => {
      const metrics = await prismaService.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.slowQueries).toBe('number');
      expect(typeof metrics.avgQueryTime).toBe('number');
      expect(typeof metrics.cacheHitRatio).toBe('number');
      expect(typeof metrics.indexUsage).toBe('number');

      expect(metrics.slowQueries).toBeGreaterThanOrEqual(0);
      expect(metrics.avgQueryTime).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.indexUsage).toBeGreaterThanOrEqual(0);

      console.log('Database performance metrics:', metrics);
    });
  });

  describe('Cleanup Functions', () => {
    it('should test token cleanup function', async () => {
      // Create expired tokens
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

      await prismaService.refreshToken.create({
        data: {
          userId: 'test-user-id',
          tokenHash: 'expired-token-hash',
          expiresAt: expiredDate,
          deviceId: 'test-device',
          ipAddress: '127.0.0.1',
        },
      });

      await prismaService.magicLinkToken.create({
        data: {
          tokenHash: 'expired-magic-token',
          email: 'test@example.com',
          expiresAt: expiredDate,
        },
      });

      // Run cleanup function
      const cleanedCount = await prismaService.$queryRaw<Array<{ cleanup_expired_tokens: number }>>`
                SELECT cleanup_expired_tokens()
            `;

      expect(Array.isArray(cleanedCount)).toBe(true);
      expect(cleanedCount.length).toBeGreaterThan(0);
      expect(typeof cleanedCount[0].cleanup_expired_tokens).toBe('number');
      expect(cleanedCount[0].cleanup_expired_tokens).toBeGreaterThan(0);

      console.log(`Cleaned up ${cleanedCount[0].cleanup_expired_tokens} expired tokens`);
    });

    it('should test audit log cleanup function', async () => {
      // Create old audit log entries
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      await prismaService.auditLog.create({
        data: {
          action: 'test_action',
          resource: 'test_resource',
          details: { test: true },
          timestamp: oldDate,
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
        },
      });

      // Run cleanup function
      const cleanedCount = await prismaService.$queryRaw<Array<{ cleanup_old_audit_logs: number }>>`
                SELECT cleanup_old_audit_logs()
            `;

      expect(Array.isArray(cleanedCount)).toBe(true);
      expect(cleanedCount.length).toBeGreaterThan(0);
      expect(typeof cleanedCount[0].cleanup_old_audit_logs).toBe('number');

      console.log(`Cleaned up ${cleanedCount[0].cleanup_old_audit_logs} old audit logs`);
    });
  });

  describe('Monitoring Views', () => {
    it('should test performance monitoring views', async () => {
      // Test slow_queries view
      const slowQueries = await prismaService.$queryRaw`
                SELECT * FROM slow_queries LIMIT 5
            `;
      expect(Array.isArray(slowQueries)).toBe(true);

      // Test index_usage view
      const indexUsage = await prismaService.$queryRaw`
                SELECT * FROM index_usage LIMIT 10
            `;
      expect(Array.isArray(indexUsage)).toBe(true);

      // Test table_sizes view
      const tableSizes = await prismaService.$queryRaw`
                SELECT * FROM table_sizes LIMIT 10
            `;
      expect(Array.isArray(tableSizes)).toBe(true);

      console.log(
        `Monitoring views accessible: slow_queries (${Array.isArray(slowQueries) ? slowQueries.length : 0}), index_usage (${Array.isArray(indexUsage) ? indexUsage.length : 0}), table_sizes (${Array.isArray(tableSizes) ? tableSizes.length : 0})`,
      );
    });
  });
});
