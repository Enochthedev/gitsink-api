import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LogAggregationService, LogQuery, LogEntry, AlertRule } from './log-aggregation.service';
import { LoggingService } from './logging.service';

describe('LogAggregationService', () => {
  let service: LogAggregationService;
  let configService: jest.Mocked<ConfigService>;
  let loggingService: jest.Mocked<LoggingService>;

  const mockLogEntries: LogEntry[] = [
    {
      timestamp: new Date('2024-01-01T10:00:00Z'),
      level: 'info',
      message: 'User login successful',
      category: 'security',
      service: 'gitsink-api',
      version: '1.0.0',
      environment: 'test',
      requestId: 'req-1',
      userId: 'user-1',
      endpoint: '/auth/login',
      method: 'POST',
      statusCode: 200,
      duration: 150,
      ip: '192.168.1.1',
    },
    {
      timestamp: new Date('2024-01-01T10:01:00Z'),
      level: 'error',
      message: 'Database connection failed',
      category: 'application',
      service: 'gitsink-api',
      version: '1.0.0',
      environment: 'test',
      requestId: 'req-2',
      endpoint: '/api/projects',
      method: 'GET',
      statusCode: 500,
      duration: 5000,
      error: {
        name: 'ConnectionError',
        message: 'Database connection failed',
        stack: 'Error stack trace...',
      },
    },
    {
      timestamp: new Date('2024-01-01T10:02:00Z'),
      level: 'warn',
      message: 'Rate limit exceeded',
      category: 'security',
      service: 'gitsink-api',
      version: '1.0.0',
      environment: 'test',
      requestId: 'req-3',
      userId: 'user-2',
      endpoint: '/api/sync',
      method: 'POST',
      statusCode: 429,
      duration: 100,
      ip: '10.0.0.1',
    },
  ];

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          LOG_BUFFER_SIZE: 1000,
          LOG_FLUSH_INTERVAL: 1000, // 1 second for testing
        };
        return config[key as keyof typeof config] || defaultValue;
      }),
    };

    const mockLoggingService = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogAggregationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggingService,
          useValue: mockLoggingService,
        },
      ],
    }).compile();

    service = module.get<LogAggregationService>(LogAggregationService);
    configService = module.get(ConfigService);
    loggingService = module.get(LoggingService);

    // Add mock log entries to the service
    mockLogEntries.forEach(entry => service.addLogEntry(entry));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('searchLogs', () => {
    it('should return all logs when no filters are applied', async () => {
      const result = await service.searchLogs({});

      expect(result.total).toBe(3);
      expect(result.logs).toHaveLength(3);
      expect(result.logs[0].timestamp.getTime()).toBeGreaterThan(
        result.logs[1].timestamp.getTime(),
      );
    });

    it('should filter logs by category', async () => {
      const result = await service.searchLogs({ category: 'security' });

      expect(result.total).toBe(2);
      expect(result.logs.every(log => log.category === 'security')).toBe(true);
    });

    it('should filter logs by level', async () => {
      const result = await service.searchLogs({ level: 'error' });

      expect(result.total).toBe(1);
      expect(result.logs[0].level).toBe('error');
      expect(result.logs[0].message).toBe('Database connection failed');
    });

    it('should filter logs by date range', async () => {
      const startDate = new Date('2024-01-01T10:00:30Z');
      const endDate = new Date('2024-01-01T10:01:30Z');

      const result = await service.searchLogs({ startDate, endDate });

      expect(result.total).toBe(1);
      expect(result.logs[0].message).toBe('Database connection failed');
    });

    it('should filter logs by userId', async () => {
      const result = await service.searchLogs({ userId: 'user-1' });

      expect(result.total).toBe(1);
      expect(result.logs[0].userId).toBe('user-1');
    });

    it('should filter logs by endpoint', async () => {
      const result = await service.searchLogs({ endpoint: '/auth' });

      expect(result.total).toBe(1);
      expect(result.logs[0].endpoint).toBe('/auth/login');
    });

    it('should search logs by message content', async () => {
      const result = await service.searchLogs({ search: 'database' });

      expect(result.total).toBe(1);
      expect(result.logs[0].message.toLowerCase()).toContain('database');
    });

    it('should apply pagination', async () => {
      const result = await service.searchLogs({ limit: 2, offset: 1 });

      expect(result.total).toBe(3);
      expect(result.logs).toHaveLength(2);
    });

    it('should handle search errors gracefully', async () => {
      // Mock an error in the search process
      jest.spyOn(service as any, 'logBuffer', 'get').mockImplementation(() => {
        throw new Error('Search error');
      });

      const result = await service.searchLogs({});

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getLogMetrics', () => {
    it('should calculate log metrics correctly', async () => {
      const timeRange = {
        start: new Date('2024-01-01T09:00:00Z'),
        end: new Date('2024-01-01T11:00:00Z'),
      };

      const metrics = await service.getLogMetrics(timeRange);

      expect(metrics.totalLogs).toBe(3);
      expect(metrics.errorRate).toBeCloseTo(33.33, 2); // 1 error out of 3 logs
      expect(metrics.securityEvents).toBe(2);
      expect(metrics.topEndpoints).toHaveLength(3);
      expect(metrics.topErrors).toHaveLength(1);
      expect(metrics.topErrors[0].message).toBe('Database connection failed');
    });

    it('should handle empty log set', async () => {
      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T01:00:00Z'),
      };

      const metrics = await service.getLogMetrics(timeRange);

      expect(metrics.totalLogs).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.avgResponseTime).toBe(0);
      expect(metrics.topEndpoints).toHaveLength(0);
      expect(metrics.topErrors).toHaveLength(0);
    });

    it('should calculate average response time correctly', async () => {
      const timeRange = {
        start: new Date('2024-01-01T09:00:00Z'),
        end: new Date('2024-01-01T11:00:00Z'),
      };

      const metrics = await service.getLogMetrics(timeRange);

      // Average of 150, 5000, 100 = 1750
      expect(metrics.avgResponseTime).toBeCloseTo(1750, 0);
    });

    it('should identify slowest endpoints', async () => {
      const timeRange = {
        start: new Date('2024-01-01T09:00:00Z'),
        end: new Date('2024-01-01T11:00:00Z'),
      };

      const metrics = await service.getLogMetrics(timeRange);

      expect(metrics.performanceMetrics.slowestEndpoints[0].endpoint).toBe('/api/projects');
      expect(metrics.performanceMetrics.slowestEndpoints[0].avgDuration).toBe(5000);
    });
  });

  describe('Alert Management', () => {
    it('should add alert rules', () => {
      const rule: AlertRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test alert rule',
        condition: {
          level: 'error',
          threshold: 1,
          timeWindow: 5,
        },
        actions: [
          {
            type: 'email',
            target: 'test@example.com',
          },
        ],
        enabled: true,
      };

      service.addAlertRule(rule);
      const rules = service.getAlertRules();

      expect(rules.some(r => r.id === 'test-rule')).toBe(true);
    });

    it('should remove alert rules', () => {
      const rule: AlertRule = {
        id: 'test-rule-2',
        name: 'Test Rule 2',
        description: 'Test alert rule 2',
        condition: {
          level: 'warn',
          threshold: 2,
        },
        actions: [],
        enabled: true,
      };

      service.addAlertRule(rule);
      service.removeAlertRule('test-rule-2');

      const rules = service.getAlertRules();
      expect(rules.some(r => r.id === 'test-rule-2')).toBe(false);
    });

    it('should have default alert rules', () => {
      const rules = service.getAlertRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.name === 'High Error Rate')).toBe(true);
      expect(rules.some(r => r.name === 'Critical Security Event')).toBe(true);
    });
  });

  describe('Log Archival', () => {
    it('should archive old logs', async () => {
      const cutoffDate = new Date('2024-01-01T10:01:30Z');

      const archivedCount = await service.archiveLogs(cutoffDate);

      expect(archivedCount).toBe(2); // Two logs are older than cutoff

      // Verify remaining logs
      const result = await service.searchLogs({});
      expect(result.total).toBe(1);
      expect(result.logs[0].message).toBe('Rate limit exceeded');
    });

    it('should handle archival errors gracefully', async () => {
      // Mock an error in the archival process
      jest.spyOn(service as any, 'logBuffer', 'get').mockImplementation(() => {
        throw new Error('Archival error');
      });

      const archivedCount = await service.archiveLogs(new Date());

      expect(archivedCount).toBe(0);
    });
  });

  describe('Log Export', () => {
    it('should export logs as JSON', async () => {
      const query: LogQuery = { category: 'security' };

      const exported = await service.exportLogs(query, 'json');
      const parsedLogs = JSON.parse(exported);

      expect(Array.isArray(parsedLogs)).toBe(true);
      expect(parsedLogs).toHaveLength(2);
      expect(parsedLogs.every((log: any) => log.category === 'security')).toBe(true);
    });

    it('should export logs as CSV', async () => {
      const query: LogQuery = { level: 'error' };

      const exported = await service.exportLogs(query, 'csv');
      const lines = exported.split('\n');

      expect(lines[0]).toContain('timestamp,level,message'); // Header
      expect(lines[1]).toContain('error'); // Data row
      expect(lines).toHaveLength(2); // Header + 1 data row
    });

    it('should handle export errors', async () => {
      // Mock an error in the export process
      jest.spyOn(service, 'searchLogs').mockRejectedValue(new Error('Export error'));

      await expect(service.exportLogs({})).rejects.toThrow('Export error');
    });
  });

  describe('Log Buffer Management', () => {
    it('should add log entries to buffer', () => {
      const newEntry: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'New log entry',
        category: 'application',
        service: 'test-service',
        version: '1.0.0',
        environment: 'test',
      };

      service.addLogEntry(newEntry);

      // Verify the entry was added (indirectly through search)
      service.searchLogs({ search: 'New log entry' }).then(result => {
        expect(result.total).toBe(1);
        expect(result.logs[0].message).toBe('New log entry');
      });
    });
  });

  describe('CSV Conversion', () => {
    it('should handle empty log arrays', async () => {
      const query: LogQuery = { search: 'nonexistent' };

      const exported = await service.exportLogs(query, 'csv');

      expect(exported).toBe('');
    });

    it('should escape CSV special characters', async () => {
      const entryWithComma: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Message with, comma',
        category: 'application',
        service: 'test-service',
        version: '1.0.0',
        environment: 'test',
      };

      service.addLogEntry(entryWithComma);

      const exported = await service.exportLogs({ search: 'comma' }, 'csv');

      expect(exported).toContain('"Message with, comma"');
    });
  });
});
