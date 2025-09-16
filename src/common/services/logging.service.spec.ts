import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  LoggingService,
  SecurityLogContext,
  BusinessLogContext,
  PerformanceLogContext,
} from './logging.service';
import * as winston from 'winston';

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    log: jest.fn(),
    end: jest.fn(callback => callback()),
  })),
  format: {
    timestamp: jest.fn(() => ({})),
    errors: jest.fn(() => ({})),
    json: jest.fn(() => ({})),
    colorize: jest.fn(() => ({})),
    simple: jest.fn(() => ({})),
    combine: jest.fn((...args) => ({})),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

jest.mock('winston-daily-rotate-file', () => jest.fn());

describe('LoggingService', () => {
  let service: LoggingService;
  let configService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<winston.Logger>;

  beforeEach(async () => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      log: jest.fn(),
      end: jest.fn(callback => callback()),
    } as any;

    (winston.createLogger as jest.Mock).mockReturnValue(mockLogger);

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          NODE_ENV: 'test',
          SERVICE_NAME: 'gitsink-api-test',
          APP_VERSION: '1.0.0-test',
          LOG_LEVEL: 'debug',
          LOG_DIR: './test-logs',
        };
        return config[key as keyof typeof config] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LoggingService>(LoggingService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Standard Logging Methods', () => {
    it('should log info messages', () => {
      const message = 'Test info message';
      const context = { userId: 'user-123', requestId: 'req-456' };

      service.info(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message,
        category: 'application',
        userId: 'user-123',
        requestId: 'req-456',
      });
    });

    it('should log error messages with stack trace', () => {
      const message = 'Test error message';
      const stack = 'Error stack trace';
      const context = { userId: 'user-123', error: new Error('Test error') };

      service.error(message, stack, context);

      expect(mockLogger.error).toHaveBeenCalledWith({
        message,
        stack,
        category: 'application',
        userId: 'user-123',
        error: {
          name: 'Error',
          message: 'Test error',
          stack: expect.any(String),
        },
      });
    });

    it('should log warning messages', () => {
      const message = 'Test warning message';
      const context = { endpoint: '/api/test' };

      service.warn(message, context);

      expect(mockLogger.warn).toHaveBeenCalledWith({
        message,
        category: 'application',
        endpoint: '/api/test',
      });
    });

    it('should log debug messages', () => {
      const message = 'Test debug message';
      const context = { metadata: { debug: true } };

      service.debug(message, context);

      expect(mockLogger.debug).toHaveBeenCalledWith({
        message,
        category: 'application',
        metadata: { debug: true },
      });
    });
  });

  describe('Security Logging', () => {
    it('should log security events with appropriate level', () => {
      const message = 'Authentication failed';
      const context: SecurityLogContext = {
        eventType: 'auth_attempt',
        severity: 'medium',
        userId: 'user-123',
        ip: '192.168.1.1',
        result: 'failure',
      };

      service.logSecurity(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message,
        category: 'security',
        eventType: 'auth_attempt',
        severity: 'medium',
        source: undefined,
        target: undefined,
        action: undefined,
        result: 'failure',
        userId: 'user-123',
        ip: '192.168.1.1',
      });
    });

    it('should log critical security events as errors', () => {
      const message = 'Critical security breach';
      const context: SecurityLogContext = {
        eventType: 'suspicious_activity',
        severity: 'critical',
        userId: 'user-456',
        ip: '10.0.0.1',
      };

      service.logSecurity(message, context);

      expect(mockLogger.error).toHaveBeenCalledWith({
        message,
        category: 'security',
        eventType: 'suspicious_activity',
        severity: 'critical',
        source: '10.0.0.1',
        target: undefined,
        action: undefined,
        result: undefined,
        userId: 'user-456',
        ip: '10.0.0.1',
      });
    });
  });

  describe('Business Logging', () => {
    it('should log business events', () => {
      const message = 'User signup completed';
      const context: BusinessLogContext = {
        eventType: 'user_signup',
        userId: 'user-789',
        userTier: 'premium',
        businessMetrics: { signupCount: 1 },
      };

      service.logBusiness(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message,
        category: 'business',
        eventType: 'user_signup',
        businessMetrics: { signupCount: 1 },
        userTier: 'premium',
        platform: undefined,
        userId: 'user-789',
      });
    });
  });

  describe('Performance Logging', () => {
    it('should log performance events as info for fast operations', () => {
      const message = 'Database query completed';
      const context: PerformanceLogContext = {
        operation: 'database_query',
        duration: 100,
        resourceUsage: { memory: 50, database: 1 },
        queryCount: 1,
      };

      service.logPerformance(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message,
        category: 'performance',
        operation: 'database_query',
        duration: 100,
        resourceUsage: { memory: 50, database: 1 },
        cacheHit: undefined,
        queryCount: 1,
      });
    });

    it('should log performance events as warning for slow operations', () => {
      const message = 'Slow database query';
      const context: PerformanceLogContext = {
        operation: 'database_query',
        duration: 6000, // 6 seconds
        queryCount: 5,
      };

      service.logPerformance(message, context);

      expect(mockLogger.warn).toHaveBeenCalledWith({
        message,
        category: 'performance',
        operation: 'database_query',
        duration: 6000,
        resourceUsage: undefined,
        cacheHit: undefined,
        queryCount: 5,
      });
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events', () => {
      const message = 'User data accessed';
      const context = {
        userId: 'user-123',
        action: 'read',
        resource: 'user_profile',
        result: 'success' as const,
      };

      service.logAudit(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message,
        category: 'audit',
        action: 'read',
        resource: 'user_profile',
        result: 'success',
        userId: 'user-123',
      });
    });
  });

  describe('HTTP Request Logging', () => {
    it('should log HTTP requests', () => {
      const req = {
        id: 'req-123',
        method: 'GET',
        originalUrl: '/api/projects',
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        user: { id: 'user-123' },
      };

      const res = {
        statusCode: 200,
      };

      service.logHTTPRequest(req, res, 150);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'GET /api/projects 200 - 150ms',
        category: 'http',
        requestId: 'req-123',
        method: 'GET',
        endpoint: '/api/projects',
        statusCode: 200,
        duration: 150,
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        userId: 'user-123',
      });
    });

    it('should log HTTP errors as warnings', () => {
      const req = {
        id: 'req-456',
        method: 'POST',
        originalUrl: '/api/sync',
        ip: '10.0.0.1',
        get: jest.fn().mockReturnValue('curl/7.68.0'),
      };

      const res = {
        statusCode: 500,
      };

      service.logHTTPRequest(req, res, 2000);

      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'POST /api/sync 500 - 2000ms',
        category: 'http',
        requestId: 'req-456',
        method: 'POST',
        endpoint: '/api/sync',
        statusCode: 500,
        duration: 2000,
        ip: '10.0.0.1',
        userAgent: 'curl/7.68.0',
        userId: undefined,
      });
    });
  });

  describe('Database Query Logging', () => {
    it('should log database queries with sanitized SQL', () => {
      const query = "SELECT * FROM users WHERE password = 'secret123' AND token = 'abc123'";
      const duration = 25;
      const context = { userId: 'user-123' };

      service.logDatabaseQuery(query, duration, context);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Database query executed',
        category: 'performance',
        operation: 'database_query',
        duration: 25,
        resourceUsage: undefined,
        cacheHit: undefined,
        queryCount: undefined,
        userId: 'user-123',
        metadata: {
          query: "SELECT * FROM users WHERE password='***' AND token='***'",
        },
      });
    });
  });

  describe('Cache Operation Logging', () => {
    it('should log cache hits', () => {
      service.logCacheOperation('get', 'user:123', true, 5);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Cache get operation',
        category: 'performance',
        operation: 'cache_get',
        duration: 5,
        resourceUsage: undefined,
        cacheHit: true,
        queryCount: undefined,
        metadata: {
          key: 'user:123',
        },
      });
    });

    it('should sanitize sensitive cache keys', () => {
      service.logCacheOperation('set', 'token:abcdef123456789012345678901234567890', false, 2);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Cache set operation',
        category: 'performance',
        operation: 'cache_set',
        duration: 2,
        resourceUsage: undefined,
        cacheHit: false,
        queryCount: undefined,
        metadata: {
          key: 'token:***',
        },
      });
    });
  });

  describe('Queue Job Logging', () => {
    it('should log successful queue jobs', () => {
      service.logQueueJob('email-send', 'completed', 1500);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Queue job email-send completed',
        category: 'queue',
        jobType: 'email-send',
        status: 'completed',
        duration: 1500,
      });
    });

    it('should log failed queue jobs as errors', () => {
      service.logQueueJob('project-sync', 'failed', 5000, {
        userId: 'user-123',
      });

      expect(mockLogger.error).toHaveBeenCalledWith({
        message: 'Queue job project-sync failed',
        category: 'queue',
        jobType: 'project-sync',
        status: 'failed',
        duration: 5000,
        userId: 'user-123',
      });
    });
  });

  describe('External API Call Logging', () => {
    it('should log successful external API calls', () => {
      service.logExternalAPICall('github', '/repos/user/repo', 200, 800);

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'External API call to github/repos/user/repo',
        category: 'external_api',
        service: 'github',
        endpoint: '/repos/user/repo',
        statusCode: 200,
        duration: 800,
      });
    });

    it('should log failed external API calls as warnings', () => {
      service.logExternalAPICall('openai', '/v1/completions', 429, 1200);

      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'External API call to openai/v1/completions',
        category: 'external_api',
        service: 'openai',
        endpoint: '/v1/completions',
        statusCode: 429,
        duration: 1200,
      });
    });
  });

  describe('Message Formatting', () => {
    it('should format string messages', () => {
      service.info('Simple string message');
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Simple string message',
        category: 'application',
      });
    });

    it('should format Error objects', () => {
      const error = new Error('Test error');
      service.info(error);
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Test error',
        category: 'application',
      });
    });

    it('should format complex objects as JSON', () => {
      const complexObject = { type: 'test', data: [1, 2, 3] };
      service.info(complexObject);
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: JSON.stringify(complexObject),
        category: 'application',
      });
    });
  });

  describe('Service Lifecycle', () => {
    it('should close logger gracefully', async () => {
      await service.close();
      expect(mockLogger.end).toHaveBeenCalled();
    });
  });
});
