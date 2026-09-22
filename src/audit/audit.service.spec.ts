import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditAction,
  AuditLogFilters,
  AuditResource,
  CreateAuditLogDto,
  SecurityEvent,
} from './interfaces/audit.interface';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;

  const mockAuditLog = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    action: AuditAction.LOGIN,
    resource: AuditResource.USER,
    resourceId: 'user-123',
    details: '{"ip": "192.168.1.1"}',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    success: true,
    error: null,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
  };

  beforeEach(async () => {
    const mockPrisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get(PrismaService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue: any) => {
      const config = {
        AUDIT_RETENTION_DAYS: 365,
        AUDIT_ARCHIVE_DAYS: 90,
        AUDIT_COMPRESSION_ENABLED: true,
        AUDIT_EXPORT_BEFORE_DELETE: true,
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logEvent', () => {
    it('should create an audit log entry successfully', async () => {
      const eventData: CreateAuditLogDto = {
        userId: 'user-123',
        action: AuditAction.LOGIN,
        resource: AuditResource.USER,
        resourceId: 'user-123',
        details: { ip: '192.168.1.1' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
      };

      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.logEvent(eventData);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          action: AuditAction.LOGIN,
          resource: AuditResource.USER,
          resourceId: 'user-123',
          details: JSON.stringify({ ip: '192.168.1.1' }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
          error: undefined,
        },
      });
    });

    it('should handle errors gracefully without throwing', async () => {
      const eventData: CreateAuditLogDto = {
        action: AuditAction.LOGIN,
        success: true,
      };

      prisma.auditLog.create.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(service.logEvent(eventData)).resolves.toBeUndefined();
    });

    it('should handle undefined details', async () => {
      const eventData: CreateAuditLogDto = {
        action: AuditAction.LOGIN,
        success: true,
      };

      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.logEvent(eventData);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: undefined,
          action: AuditAction.LOGIN,
          resource: undefined,
          resourceId: undefined,
          details: undefined,
          ipAddress: undefined,
          userAgent: undefined,
          success: true,
          error: undefined,
        },
      });
    });
  });

  describe('logUserAction', () => {
    it('should log user action with context', async () => {
      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.logUserAction(
        'user-123',
        AuditAction.PROJECT_CREATED,
        AuditResource.PROJECT,
        'project-456',
        { projectName: 'Test Project' },
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
        },
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          action: AuditAction.PROJECT_CREATED,
          resource: AuditResource.PROJECT,
          resourceId: 'project-456',
          details: JSON.stringify({ projectName: 'Test Project' }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
          error: undefined,
        },
      });
    });
  });

  describe('logSystemEvent', () => {
    it('should log system event without user context', async () => {
      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.logSystemEvent(
        AuditAction.SYSTEM_ERROR,
        AuditResource.SYSTEM,
        'component-123',
        { errorType: 'Database connection failed' },
        'Connection timeout',
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: undefined,
          action: AuditAction.SYSTEM_ERROR,
          resource: AuditResource.SYSTEM,
          resourceId: 'component-123',
          details: JSON.stringify({ errorType: 'Database connection failed' }),
          ipAddress: undefined,
          userAgent: undefined,
          success: false,
          error: 'Connection timeout',
        },
      });
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event with enhanced details', async () => {
      const securityEvent: SecurityEvent = {
        type: 'multiple_failed_attempts',
        severity: 'high',
        description: 'Multiple failed login attempts detected',
        indicators: { attempts: 5, timeWindow: '1 hour' },
        recommendedActions: ['Lock account', 'Notify admin'],
      };

      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.logSecurityEvent(securityEvent, 'user-123', {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        resourceId: 'user-123',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          action: AuditAction.SECURITY_EVENT,
          resource: AuditResource.SYSTEM,
          resourceId: 'user-123',
          details: JSON.stringify({
            securityEventType: 'multiple_failed_attempts',
            severity: 'high',
            description: 'Multiple failed login attempts detected',
            indicators: { attempts: 5, timeWindow: '1 hour' },
            recommendedActions: ['Lock account', 'Notify admin'],
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: false,
          error: undefined,
        },
      });
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs with pagination', async () => {
      const filters: AuditLogFilters = {
        userId: 'user-123',
        limit: 10,
        offset: 0,
        orderBy: 'timestamp',
        orderDirection: 'desc',
      };

      prisma.auditLog.count.mockResolvedValue(25);
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getAuditLogs(filters);

      expect(result).toEqual({
        logs: [mockAuditLog],
        totalCount: 25,
        hasNextPage: true,
        hasPreviousPage: false,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      });
    });

    it('should handle multiple actions filter', async () => {
      const filters: AuditLogFilters = {
        action: [AuditAction.LOGIN, AuditAction.LOGOUT],
        limit: 50,
        offset: 0,
      };

      prisma.auditLog.count.mockResolvedValue(5);
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      await service.getAuditLogs(filters);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { action: { in: [AuditAction.LOGIN, AuditAction.LOGOUT] } },
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      });
    });

    it('should handle date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const filters: AuditLogFilters = {
        startDate,
        endDate,
        limit: 50,
        offset: 0,
      };

      prisma.auditLog.count.mockResolvedValue(10);
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      await service.getAuditLogs(filters);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      });
    });
  });

  describe('getAuditSummary', () => {
    it('should return audit summary with statistics', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      prisma.auditLog.count
        .mockResolvedValueOnce(100) // total events
        .mockResolvedValueOnce(90) // successful events
        .mockResolvedValueOnce(10); // failed events

      prisma.auditLog.groupBy
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }]) // unique users
        .mockResolvedValueOnce([
          // top actions
          { action: AuditAction.LOGIN, _count: 50 },
          { action: AuditAction.API_CALL, _count: 30 },
        ])
        .mockResolvedValueOnce([
          // top resources
          { resource: AuditResource.USER, _count: 60 },
          { resource: AuditResource.PROJECT, _count: 40 },
        ]);

      const result = await service.getAuditSummary(startDate, endDate, undefined, 10);

      expect(result).toEqual({
        totalEvents: 100,
        successfulEvents: 90,
        failedEvents: 10,
        uniqueUsers: 2,
        topActions: [
          { action: AuditAction.LOGIN, count: 50 },
          { action: AuditAction.API_CALL, count: 30 },
        ],
        topResources: [
          { resource: AuditResource.USER, count: 60 },
          { resource: AuditResource.PROJECT, count: 40 },
        ],
        timeRange: { start: startDate, end: endDate },
      });
    });
  });

  describe('getUserAuditLogs', () => {
    it('should return audit logs for a specific user', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getUserAuditLogs('user-123', 50, 0);

      expect(result).toEqual([mockAuditLog]);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      });
    });
  });

  describe('getResourceAuditLogs', () => {
    it('should return audit logs for a specific resource', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getResourceAuditLogs(
        AuditResource.PROJECT,
        'project-123',
        50,
        0,
      );

      expect(result).toEqual([mockAuditLog]);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          resource: AuditResource.PROJECT,
          resourceId: 'project-123',
        },
        orderBy: { timestamp: 'desc' },
        skip: 0,
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      });
    });
  });

  describe('exportAuditLogs', () => {
    it('should export audit logs as JSON', async () => {
      const filters: AuditLogFilters = { userId: 'user-123' };
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.exportAuditLogs(filters, 'json');

      expect(result).toBe(JSON.stringify([mockAuditLog], null, 2));
    });

    it('should export audit logs as CSV', async () => {
      const filters: AuditLogFilters = { userId: 'user-123' };
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.exportAuditLogs(filters, 'csv');

      expect(result).toContain('id,userId,action');
      expect(result).toContain(mockAuditLog.id);
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect multiple failed login attempts', async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(5) // failed logins
        .mockResolvedValueOnce(100); // api calls

      const result = await service.detectSuspiciousActivity('user-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'multiple_failed_attempts',
        severity: 'high',
        description: '5 failed login attempts in the last hour',
        indicators: { failedAttempts: 5, timeWindow: '1 hour' },
        recommendedActions: ['Temporarily lock account', 'Require additional verification'],
      });
    });

    it('should detect unusual API usage', async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(2) // failed logins (below threshold)
        .mockResolvedValueOnce(1500); // api calls (above threshold)

      const result = await service.detectSuspiciousActivity('user-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'unusual_api_usage',
        severity: 'medium',
        description: 'Unusually high API usage: 1500 calls in the last hour',
        indicators: { apiCalls: 1500, timeWindow: '1 hour' },
        recommendedActions: ['Review API usage patterns', 'Check for automated scripts'],
      });
    });

    it('should return empty array when no suspicious activity detected', async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(2) // failed logins (below threshold)
        .mockResolvedValueOnce(100); // api calls (below threshold)

      const result = await service.detectSuspiciousActivity('user-123');

      expect(result).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      prisma.auditLog.count.mockRejectedValue(new Error('Database error'));

      const result = await service.detectSuspiciousActivity('user-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupOldAuditLogs', () => {
    it('should delete old audit logs based on retention policy', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 100 });
      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      await service.cleanupOldAuditLogs();

      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            lt: expect.any(Date),
          },
        },
      });

      // Should log the cleanup operation
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AuditAction.SYSTEM_ERROR, // Using existing enum value
          resource: AuditResource.SYSTEM,
          details: expect.stringContaining('audit_log_cleanup'),
        }),
      });
    });
  });
});
