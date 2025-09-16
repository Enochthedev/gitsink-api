import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportingService } from './audit-reporting.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { SyncHistoryService } from './sync-history.service';
import { AuditAction, AuditResource } from './interfaces/audit.interface';

describe('AuditReportingService', () => {
  let service: AuditReportingService;
  let prisma: jest.Mocked<PrismaService>;
  let auditService: jest.Mocked<AuditService>;
  let syncHistoryService: jest.Mocked<SyncHistoryService>;

  beforeEach(async () => {
    const mockPrisma = {
      auditLog: {
        groupBy: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      project: {
        count: jest.fn(),
      },
      syncHistory: {
        findMany: jest.fn(),
      },
    } as any;

    const mockAuditService = {
      getAuditLogs: jest.fn(),
    } as any;

    const mockSyncHistoryService = {
      getSyncHistoryStats: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SyncHistoryService, useValue: mockSyncHistoryService },
      ],
    }).compile();

    service = module.get<AuditReportingService>(AuditReportingService);
    prisma = module.get(PrismaService);
    auditService = module.get(AuditService);
    syncHistoryService = module.get(SyncHistoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSecurityReport', () => {
    it('should generate a comprehensive security report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user-123';

      // Mock security events
      prisma.auditLog.groupBy.mockResolvedValue([
        { details: JSON.stringify({ severity: 'high' }), _count: 5 },
        { details: JSON.stringify({ severity: 'medium' }), _count: 10 },
      ]);

      // Mock failed login attempts
      prisma.auditLog.count
        .mockResolvedValueOnce(25) // failed logins
        .mockResolvedValueOnce(15); // rate limit violations

      // Mock unique failed users
      prisma.auditLog.groupBy
        .mockResolvedValueOnce([
          { userId: 'user-1', _count: 10 },
          { userId: 'user-2', _count: 8 },
        ])
        .mockResolvedValueOnce([
          { userId: 'user-1', _count: 5 },
          { userId: 'user-3', _count: 3 },
        ]);

      // Mock user lookups
      prisma.user.findUnique
        .mockResolvedValueOnce({
          username: 'testuser1',
          email: 'test1@example.com',
        })
        .mockResolvedValueOnce({
          username: 'testuser2',
          email: 'test2@example.com',
        })
        .mockResolvedValueOnce({
          username: 'testuser1',
          email: 'test1@example.com',
        })
        .mockResolvedValueOnce({
          username: 'testuser3',
          email: 'test3@example.com',
        });

      const report = await service.generateSecurityReport(startDate, endDate, userId);

      expect(report).toEqual({
        reportId: expect.stringContaining('security-'),
        timeRange: { start: startDate, end: endDate },
        summary: {
          totalSecurityEvents: 15,
          criticalEvents: 0,
          highSeverityEvents: 5,
          mediumSeverityEvents: 10,
          lowSeverityEvents: 0,
        },
        failedLoginAttempts: {
          total: 25,
          uniqueUsers: 2,
          topFailedUsers: [
            { userId: 'user-1', username: 'testuser1', attempts: 10 },
            { userId: 'user-2', username: 'testuser2', attempts: 8 },
          ],
        },
        suspiciousActivities: [],
        rateLimitViolations: {
          total: 15,
          uniqueUsers: 2,
          topViolators: [
            { userId: 'user-1', username: 'testuser1', violations: 5 },
            { userId: 'user-3', username: 'testuser3', violations: 3 },
          ],
        },
        recommendations: expect.arrayContaining([expect.stringContaining('security')]),
      });

      expect(prisma.auditLog.groupBy).toHaveBeenCalledWith({
        by: ['details'],
        where: {
          action: AuditAction.SECURITY_EVENT,
          timestamp: { gte: startDate, lte: endDate },
          userId,
        },
        _count: true,
      });
    });

    it('should handle empty security events', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      prisma.auditLog.groupBy.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const report = await service.generateSecurityReport(startDate, endDate);

      expect(report.summary.totalSecurityEvents).toBe(0);
      expect(report.recommendations).toContain('No immediate security concerns identified');
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate a comprehensive compliance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user-123';

      // Mock various counts
      prisma.auditLog.count
        .mockResolvedValueOnce(1000) // total accesses
        .mockResolvedValueOnce(800) // user data accesses
        .mockResolvedValueOnce(50) // admin data accesses
        .mockResolvedValueOnce(25) // export operations
        .mockResolvedValueOnce(15) // account creations
        .mockResolvedValueOnce(2) // account deletions
        .mockResolvedValueOnce(100) // profile updates
        .mockResolvedValueOnce(25) // data exports
        .mockResolvedValueOnce(1000); // total records for integrity

      const report = await service.generateComplianceReport(startDate, endDate, userId);

      expect(report).toEqual({
        reportId: expect.stringContaining('compliance-'),
        timeRange: { start: startDate, end: endDate },
        dataAccess: {
          totalAccesses: 1000,
          userDataAccesses: 800,
          adminDataAccesses: 50,
          exportOperations: 25,
        },
        userActions: {
          accountCreations: 15,
          accountDeletions: 2,
          profileUpdates: 100,
          dataExports: 25,
        },
        systemChanges: {
          configurationChanges: 0,
          securityPolicyChanges: 0,
          userPermissionChanges: 0,
        },
        auditTrailIntegrity: {
          totalRecords: 1000,
          integrityChecks: 1,
          anomaliesDetected: 0,
        },
      });
    });
  });

  describe('generateActivityReport', () => {
    it('should generate a comprehensive activity report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Mock user counts
      prisma.user.count.mockResolvedValue(500);
      prisma.project.count.mockResolvedValue(1200);

      // Mock active users
      prisma.auditLog.groupBy
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }])
        .mockResolvedValueOnce([
          { userId: 'user-1', _count: 150 },
          { userId: 'user-2', _count: 120 },
        ])
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }]);

      // Mock various activity counts
      prisma.auditLog.count
        .mockResolvedValueOnce(25) // new users
        .mockResolvedValueOnce(50) // new projects
        .mockResolvedValueOnce(200) // synced projects
        .mockResolvedValueOnce(15) // platform connections
        .mockResolvedValueOnce(5000); // api calls

      // Mock user lookups
      prisma.user.findUnique
        .mockResolvedValueOnce({
          username: 'activeuser1',
          email: 'active1@example.com',
        })
        .mockResolvedValueOnce({
          username: 'activeuser2',
          email: 'active2@example.com',
        });

      const report = await service.generateActivityReport(startDate, endDate);

      expect(report).toEqual({
        reportId: expect.stringContaining('activity-'),
        timeRange: { start: startDate, end: endDate },
        userActivity: {
          totalUsers: 500,
          activeUsers: 3,
          newUsers: 25,
          topActiveUsers: [
            { userId: 'user-1', username: 'activeuser1', actionCount: 150 },
            { userId: 'user-2', username: 'activeuser2', actionCount: 120 },
          ],
        },
        projectActivity: {
          totalProjects: 1200,
          newProjects: 50,
          syncedProjects: 200,
          topSyncedProjects: [],
        },
        platformActivity: {
          totalConnections: 15,
          newConnections: 15,
          byPlatform: [],
        },
        apiUsage: {
          totalCalls: 5000,
          uniqueUsers: 2,
          topEndpoints: [],
        },
      });
    });
  });

  describe('generatePerformanceReport', () => {
    it('should generate a comprehensive performance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user-123';

      // Mock sync history stats
      syncHistoryService.getSyncHistoryStats.mockResolvedValue({
        totalOperations: 1000,
        successfulOperations: 950,
        failedOperations: 50,
        averageDuration: 5000,
        operationsByPlatform: [],
        operationsByType: [],
        recentFailures: [],
      });

      // Mock slowest sync operations
      prisma.syncHistory.findMany.mockResolvedValue([
        {
          id: 'sync-1',
          operation: 'sync',
          platform: 'github',
          duration: 30000,
        },
        {
          id: 'sync-2',
          operation: 'create',
          platform: 'gitlab',
          duration: 25000,
        },
      ]);

      // Mock error count
      prisma.auditLog.count.mockResolvedValue(100);

      const report = await service.generatePerformanceReport(startDate, endDate, userId);

      expect(report).toEqual({
        reportId: expect.stringContaining('performance-'),
        timeRange: { start: startDate, end: endDate },
        syncPerformance: {
          totalOperations: 1000,
          successRate: 95,
          averageDuration: 5000,
          slowestOperations: [
            {
              id: 'sync-1',
              operation: 'sync',
              platform: 'github',
              duration: 30000,
            },
            {
              id: 'sync-2',
              operation: 'create',
              platform: 'gitlab',
              duration: 25000,
            },
          ],
        },
        apiPerformance: {
          totalRequests: 0,
          averageResponseTime: 0,
          errorRate: 0,
          slowestEndpoints: [],
        },
        systemHealth: {
          uptime: 99.9,
          errorCount: 100,
          warningCount: 0,
          criticalIssues: 0,
        },
      });

      expect(syncHistoryService.getSyncHistoryStats).toHaveBeenCalledWith(
        userId,
        startDate,
        endDate,
      );
    });
  });

  describe('exportAuditData', () => {
    it('should export audit data as JSON', async () => {
      const filters = { userId: 'user-123' };
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-123',
          action: AuditAction.LOGIN,
          success: true,
          timestamp: new Date(),
        },
      ];

      auditService.getAuditLogs.mockResolvedValue({
        logs: mockLogs,
        totalCount: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      const result = await service.exportAuditData(filters, 'json', true);

      expect(result.contentType).toBe('application/json');
      expect(result.filename).toMatch(/audit-export-\d{4}-\d{2}-\d{2}\.json/);
      expect(JSON.parse(result.data as string)).toEqual({
        metadata: {
          exportedAt: expect.any(String),
          totalRecords: 1,
          filters,
        },
        data: mockLogs,
      });
    });

    it('should export audit data as CSV', async () => {
      const filters = { userId: 'user-123' };
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-123',
          action: AuditAction.LOGIN,
          resource: AuditResource.USER,
          resourceId: 'user-123',
          success: true,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          error: null,
        },
      ];

      auditService.getAuditLogs.mockResolvedValue({
        logs: mockLogs,
        totalCount: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      const result = await service.exportAuditData(filters, 'csv', false);

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/audit-export-\d{4}-\d{2}-\d{2}\.csv/);
      expect(result.data).toContain('ID,User ID,Action,Resource');
      expect(result.data).toContain('log-1,user-123,login,user');
    });
  });

  describe('searchAuditLogs', () => {
    it('should search audit logs with query terms', async () => {
      const searchQuery = 'login failed error';
      const filters = { userId: 'user-123' };
      const mockLogs = [
        {
          id: 'log-1',
          action: AuditAction.LOGIN,
          success: false,
          error: 'Invalid credentials',
          details: 'Login attempt failed',
        },
        {
          id: 'log-2',
          action: AuditAction.API_CALL,
          success: true,
          error: null,
          details: 'API call successful',
        },
      ];

      auditService.getAuditLogs.mockResolvedValue({
        logs: mockLogs,
        totalCount: 2,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      const result = await service.searchAuditLogs(searchQuery, filters);

      expect(result.searchTerms).toEqual(['login', 'failed', 'error']);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe('log-1');
      expect(result.totalCount).toBe(1);
    });

    it('should return all logs when no search terms provided', async () => {
      const searchQuery = 'a b'; // Short terms that get filtered out
      const filters = { userId: 'user-123' };
      const mockLogs = [{ id: 'log-1' }, { id: 'log-2' }];

      auditService.getAuditLogs.mockResolvedValue({
        logs: mockLogs,
        totalCount: 2,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      const result = await service.searchAuditLogs(searchQuery, filters);

      expect(result.searchTerms).toEqual([]);
      expect(result.logs).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });
  });
});
