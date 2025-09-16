import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  SecurityMonitoringService,
  SecurityEventType,
  SecuritySeverity,
} from './security-monitoring.service';
import { PrismaService } from '@prisma/prisma.service';
import { MetricsService } from '@metrics/metrics.service';
import { Request } from 'express';

describe('SecurityMonitoringService', () => {
  let service: SecurityMonitoringService;
  let cacheManager: jest.Mocked<Cache>;
  let prismaService: jest.Mocked<PrismaService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockCounter = {
    inc: jest.fn(),
  };

  const mockGauge = {
    set: jest.fn(),
  };

  beforeEach(async () => {
    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockPrismaService = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    const mockMetricsService = {
      createCustomCounter: jest.fn().mockReturnValue(mockCounter),
      createCustomGauge: jest.fn().mockReturnValue(mockGauge),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityMonitoringService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<SecurityMonitoringService>(SecurityMonitoringService);
    cacheManager = module.get(CACHE_MANAGER);
    prismaService = module.get(PrismaService);
    metricsService = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordSecurityEvent', () => {
    it('should record a security event successfully', async () => {
      // Arrange
      const event = {
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        severity: SecuritySeverity.MEDIUM,
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        endpoint: '/auth/signin',
        details: { reason: 'unusual location' },
        timestamp: new Date(),
      };

      prismaService.auditLog.create.mockResolvedValue({} as any);

      // Act
      await service.recordSecurityEvent(event);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        event_type: event.type,
        severity: event.severity,
      });

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: event.userId,
          action: `security_event_${event.type}`,
          resource: 'security',
          details: expect.objectContaining({
            eventType: event.type,
            severity: event.severity,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            endpoint: event.endpoint,
            reason: 'unusual location',
          }),
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          success: false,
          timestamp: event.timestamp,
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const event = {
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        severity: SecuritySeverity.MEDIUM,
        details: {},
        timestamp: new Date(),
      };

      prismaService.auditLog.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.recordSecurityEvent(event)).resolves.not.toThrow();
    });
  });

  describe('isIpBlocked', () => {
    it('should return false for whitelisted IPs', () => {
      // Act
      const result = service.isIpBlocked('127.0.0.1');

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for blocked IPs', async () => {
      // Arrange
      const ipAddress = '192.168.1.100';
      await service.blockIp(ipAddress, 'test block', 60);

      // Act
      const result = service.isIpBlocked(ipAddress);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for expired blocks', async () => {
      // Arrange
      const ipAddress = '192.168.1.101';
      await service.blockIp(ipAddress, 'test block', -1); // Expired block

      // Act
      const result = service.isIpBlocked(ipAddress);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for non-blocked IPs', () => {
      // Act
      const result = service.isIpBlocked('192.168.1.200');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('blockIp', () => {
    it('should block an IP address successfully', async () => {
      // Arrange
      const ipAddress = '192.168.1.100';
      const reason = 'Suspicious activity';
      const durationMinutes = 60;

      prismaService.auditLog.create.mockResolvedValue({} as any);

      // Act
      await service.blockIp(ipAddress, reason, durationMinutes);

      // Assert
      expect(service.isIpBlocked(ipAddress)).toBe(true);
      expect(prismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should not block whitelisted IPs', async () => {
      // Arrange
      const ipAddress = '127.0.0.1';
      const reason = 'Test block';

      // Act
      await service.blockIp(ipAddress, reason);

      // Assert
      expect(service.isIpBlocked(ipAddress)).toBe(false);
    });

    it('should handle audit log creation errors gracefully', async () => {
      // Arrange
      const ipAddress = '192.168.1.102';
      const reason = 'Test block';
      prismaService.auditLog.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.blockIp(ipAddress, reason)).resolves.not.toThrow();
      expect(service.isIpBlocked(ipAddress)).toBe(true);
    });
  });

  describe('unblockIp', () => {
    it('should unblock an IP address successfully', async () => {
      // Arrange
      const ipAddress = '192.168.1.103';
      await service.blockIp(ipAddress, 'test block');

      // Act
      await service.unblockIp(ipAddress);

      // Assert
      expect(service.isIpBlocked(ipAddress)).toBe(false);
    });

    it('should handle unblocking non-blocked IPs gracefully', async () => {
      // Act & Assert
      await expect(service.unblockIp('192.168.1.200')).resolves.not.toThrow();
    });
  });

  describe('detectSuspiciousPatterns', () => {
    it('should detect SQL injection patterns', async () => {
      // Arrange
      const mockRequest = {
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        path: '/api/test',
        query: { search: "'; DROP TABLE users; --" },
        body: {},
      } as unknown as Request;

      // Act
      const events = await service.detectSuspiciousPatterns(mockRequest);

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.SQL_INJECTION_ATTEMPT);
      expect(events[0].severity).toBe(SecuritySeverity.HIGH);
    });

    it('should detect XSS patterns', async () => {
      // Arrange
      const mockRequest = {
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        path: '/api/test',
        query: {},
        body: { comment: '<script>alert("xss")</script>' },
      } as unknown as Request;

      // Act
      const events = await service.detectSuspiciousPatterns(mockRequest);

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.XSS_ATTEMPT);
      expect(events[0].severity).toBe(SecuritySeverity.MEDIUM);
    });

    it('should detect suspicious user agents', async () => {
      // Arrange
      const mockRequest = {
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('curl/7.68.0'),
        path: '/api/test',
        query: {},
        body: {},
      } as unknown as Request;

      // Act
      const events = await service.detectSuspiciousPatterns(mockRequest);

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.SUSPICIOUS_USER_AGENT);
      expect(events[0].severity).toBe(SecuritySeverity.LOW);
    });

    it('should not flag legitimate bots', async () => {
      // Arrange
      const mockRequest = {
        ip: '192.168.1.1',
        get: jest
          .fn()
          .mockReturnValue(
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          ),
        path: '/api/test',
        query: {},
        body: {},
      } as unknown as Request;

      // Act
      const events = await service.detectSuspiciousPatterns(mockRequest);

      // Assert
      expect(events).toHaveLength(0);
    });

    it('should return empty array for clean requests', async () => {
      // Arrange
      const mockRequest = {
        ip: '192.168.1.1',
        get: jest
          .fn()
          .mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
        path: '/api/test',
        query: { page: '1' },
        body: { name: 'John Doe' },
      } as unknown as Request;

      // Act
      const events = await service.detectSuspiciousPatterns(mockRequest);

      // Assert
      expect(events).toHaveLength(0);
    });
  });

  describe('getSuspiciousActivity', () => {
    it('should return cached suspicious activity', async () => {
      // Arrange
      const identifier = 'ip:192.168.1.1';
      const cachedActivity = {
        identifier,
        score: 50,
        events: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
        isBlocked: false,
      };

      cacheManager.get.mockResolvedValue(cachedActivity);

      // Act
      const result = await service.getSuspiciousActivity(identifier);

      // Assert
      expect(result).toEqual(cachedActivity);
      expect(cacheManager.get).toHaveBeenCalledWith(`suspicious_activity:${identifier}`);
    });

    it('should return null when no activity found', async () => {
      // Arrange
      const identifier = 'ip:192.168.1.1';
      cacheManager.get.mockResolvedValue(null);
      prismaService.auditLog.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getSuspiciousActivity(identifier);

      // Assert
      expect(result).toBeNull();
    });

    it('should calculate activity from audit logs when not cached', async () => {
      // Arrange
      const identifier = 'ip:192.168.1.1';
      const mockAuditLogs = [
        {
          action: 'security_event_suspicious_login',
          details: {
            eventType: SecurityEventType.SUSPICIOUS_LOGIN,
            severity: SecuritySeverity.MEDIUM,
          },
          userId: null,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          timestamp: new Date(),
        },
      ];

      cacheManager.get.mockResolvedValue(null);
      prismaService.auditLog.findMany.mockResolvedValue(mockAuditLogs as any);

      // Act
      const result = await service.getSuspiciousActivity(identifier);

      // Assert
      expect(result).toBeDefined();
      expect(result?.identifier).toBe(identifier);
      expect(result?.score).toBeGreaterThan(0);
      expect(result?.events).toHaveLength(1);
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const identifier = 'ip:192.168.1.1';
      cacheManager.get.mockResolvedValue(null);
      prismaService.auditLog.findMany.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.getSuspiciousActivity(identifier);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getSecurityStats', () => {
    it('should return security statistics', async () => {
      // Arrange
      const mockAuditLogs = [
        {
          action: 'security_event_suspicious_login',
          details: {
            eventType: SecurityEventType.SUSPICIOUS_LOGIN,
            severity: SecuritySeverity.MEDIUM,
          },
          timestamp: new Date(),
        },
        {
          action: 'security_event_rate_limit_exceeded',
          details: {
            eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
            severity: SecuritySeverity.LOW,
          },
          timestamp: new Date(),
        },
      ];

      prismaService.auditLog.findMany.mockResolvedValue(mockAuditLogs as any);

      // Act
      const result = await service.getSecurityStats();

      // Assert
      expect(result).toBeDefined();
      expect(result.totalEvents).toBe(2);
      expect(result.eventsByType[SecurityEventType.SUSPICIOUS_LOGIN]).toBe(1);
      expect(result.eventsByType[SecurityEventType.RATE_LIMIT_EXCEEDED]).toBe(1);
      expect(result.eventsBySeverity[SecuritySeverity.MEDIUM]).toBe(1);
      expect(result.eventsBySeverity[SecuritySeverity.LOW]).toBe(1);
    });

    it('should handle time range parameter', async () => {
      // Arrange
      const timeRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      };

      prismaService.auditLog.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getSecurityStats(timeRange);

      // Assert
      expect(result).toBeDefined();
      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: {
            startsWith: 'security_event_',
          },
          timestamp: {
            gte: timeRange.from,
            lte: timeRange.to,
          },
        },
        select: {
          action: true,
          details: true,
          timestamp: true,
        },
      });
    });

    it('should handle database errors', async () => {
      // Arrange
      prismaService.auditLog.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getSecurityStats()).rejects.toThrow('Database error');
    });
  });
});
