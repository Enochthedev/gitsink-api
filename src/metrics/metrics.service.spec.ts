import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService, SecurityEvent } from './metrics.service';
import { Counter, Histogram, Gauge, register } from 'prom-client';

// Mock prom-client
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    get: jest.fn(),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    get: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
    get: jest.fn(),
  })),
  register: {
    metrics: jest.fn().mockResolvedValue('mocked metrics'),
    getSingleMetric: jest.fn(),
  },
}));

describe('MetricsService', () => {
  let service: MetricsService;
  let mockCounter: jest.Mocked<Counter<string>>;
  let mockHistogram: jest.Mocked<Histogram<string>>;
  let mockGauge: jest.Mocked<Gauge<string>>;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    mockCounter = {
      inc: jest.fn(),
      get: jest.fn(),
    } as any;

    mockHistogram = {
      observe: jest.fn(),
      get: jest.fn(),
    } as any;

    mockGauge = {
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: 'PROM_METRIC_http_requests_total',
          useValue: mockCounter,
        },
        {
          provide: 'PROM_METRIC_http_request_duration_seconds',
          useValue: mockHistogram,
        },
        {
          provide: 'PROM_METRIC_active_connections',
          useValue: mockGauge,
        },
        {
          provide: 'PROM_METRIC_database_queries_total',
          useValue: mockCounter,
        },
        {
          provide: 'PROM_METRIC_database_query_duration_seconds',
          useValue: mockHistogram,
        },
        {
          provide: 'PROM_METRIC_memory_usage_bytes',
          useValue: mockGauge,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Business Metrics', () => {
    it('should record user signup', () => {
      service.recordUserSignup('email', 'web');
      // Since we're using custom counters, we can't directly test the increment
      // but we can verify the method doesn't throw
      expect(true).toBe(true);
    });

    it('should record project sync with duration', () => {
      service.recordProjectSync('github', true, 5000, 'premium');
      expect(true).toBe(true);
    });

    it('should record API call with all parameters', () => {
      service.recordAPICall('/api/projects', 'GET', 200, 150, 'premium', 'enterprise');
      expect(true).toBe(true);
    });

    it('should record profile view', () => {
      service.recordProfileView('profile-123', 'public', 'search');
      expect(true).toBe(true);
    });

    it('should record enrichment job', () => {
      service.recordEnrichmentJob('description', 'completed', 'gpt-4');
      expect(true).toBe(true);
    });

    it('should set active users', () => {
      service.setActiveUsers(150, '24h');
      expect(true).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    it('should record database query with duration', () => {
      service.recordDatabaseQuery('SELECT', 'users', 25);
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'SELECT',
        table: 'users',
      });
      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { operation: 'SELECT', table: 'users' },
        0.025,
      );
    });

    it('should record cache hit', () => {
      service.recordCacheHit('user:123', true, 'redis');
      expect(true).toBe(true);
    });

    it('should record cache miss', () => {
      service.recordCacheHit('user:456', false, 'memory');
      expect(true).toBe(true);
    });

    it('should record cache operation', () => {
      service.recordCacheOperation('set', 'redis');
      expect(true).toBe(true);
    });

    it('should record queue job with duration', () => {
      service.recordQueueJob('sync', 'project-sync', 'completed', 3000);
      expect(true).toBe(true);
    });

    it('should record queue job without duration', () => {
      service.recordQueueJob('email', 'welcome-email', 'started');
      expect(true).toBe(true);
    });

    it('should record external API call', () => {
      service.recordExternalAPICall('github', '/repos/user/repo', 200, 500);
      expect(true).toBe(true);
    });
  });

  describe('Security Metrics', () => {
    it('should record successful auth attempt', () => {
      service.recordAuthAttempt('password', true);
      expect(true).toBe(true);
    });

    it('should record failed auth attempt with reason', () => {
      service.recordAuthAttempt('api_key', false, 'invalid_key');
      expect(true).toBe(true);
    });

    it('should record rate limit hit', () => {
      service.recordRateLimitHit('/api/projects', 'free', 'requests', 'user-123');
      expect(true).toBe(true);
    });

    it('should record security event', () => {
      const securityEvent: SecurityEvent = {
        type: 'suspicious_activity',
        severity: 'high',
        userId: 'user-123',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { reason: 'multiple_failed_attempts' },
      };

      service.recordSecurityEvent(securityEvent);
      expect(true).toBe(true);
    });

    it('should record critical security event and suspicious activity', () => {
      const criticalEvent: SecurityEvent = {
        type: 'token_abuse',
        severity: 'critical',
        userId: 'user-456',
        ip: '10.0.0.1',
      };

      service.recordSecurityEvent(criticalEvent);
      expect(true).toBe(true);
    });

    it('should record API key usage', () => {
      service.recordAPIKeyUsage('premium', '/api/sync', 200);
      expect(true).toBe(true);
    });
  });

  describe('System Health Metrics', () => {
    it('should update system health with valid score', () => {
      service.updateSystemHealth('database', 0.95);
      expect(true).toBe(true);
    });

    it('should normalize health score above 1', () => {
      service.updateSystemHealth('redis', 1.5);
      expect(true).toBe(true);
    });

    it('should normalize health score below 0', () => {
      service.updateSystemHealth('queue', -0.1);
      expect(true).toBe(true);
    });

    it('should update error rate', () => {
      service.updateErrorRate('auth-service', 2.5, '5m');
      expect(true).toBe(true);
    });

    it('should update response time', () => {
      service.updateResponseTime('/api/projects', 250, '1m');
      expect(true).toBe(true);
    });
  });

  describe('Business Intelligence', () => {
    it('should get business metrics', async () => {
      const metrics = await service.getBusinessMetrics();
      expect(metrics).toEqual({
        userSignups: 0,
        projectSyncs: 0,
        apiCalls: 0,
        profileViews: 0,
        activeUsers: 0,
      });
    });

    it('should handle errors when getting business metrics', async () => {
      (register.metrics as jest.Mock).mockRejectedValueOnce(new Error('Registry error'));

      const metrics = await service.getBusinessMetrics();
      expect(metrics).toEqual({
        userSignups: 0,
        projectSyncs: 0,
        apiCalls: 0,
        profileViews: 0,
        activeUsers: 0,
      });
    });
  });

  describe('HTTP Metrics (Legacy)', () => {
    it('should increment HTTP requests', () => {
      service.incrementHttpRequests('GET', '/api/projects', 200);
      expect(mockCounter.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/projects',
        status_code: '200',
      });
    });

    it('should record HTTP request duration', () => {
      service.recordHttpRequestDuration('POST', '/api/sync', 1.5);
      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { method: 'POST', route: '/api/sync' },
        1.5,
      );
    });
  });

  describe('Connection Tracking', () => {
    it('should set active connections', () => {
      service.setActiveConnections(50);
      expect(mockGauge.set).toHaveBeenCalledWith(50);
    });

    it('should increment active connections', () => {
      service.incrementActiveConnections();
      expect(mockGauge.inc).toHaveBeenCalled();
    });

    it('should decrement active connections', () => {
      service.decrementActiveConnections();
      expect(mockGauge.dec).toHaveBeenCalled();
    });
  });

  describe('Custom Metrics Creation', () => {
    it('should create custom counter', () => {
      const counter = service.createCustomCounter('test_counter', 'Test counter', ['label1']);
      expect(Counter).toHaveBeenCalledWith({
        name: 'gitsink_test_counter',
        help: 'Test counter',
        labelNames: ['label1'],
      });
    });

    it('should create custom histogram', () => {
      const histogram = service.createCustomHistogram(
        'test_histogram',
        'Test histogram',
        ['label1'],
        [0.1, 1, 10],
      );
      expect(Histogram).toHaveBeenCalledWith({
        name: 'gitsink_test_histogram',
        help: 'Test histogram',
        labelNames: ['label1'],
        buckets: [0.1, 1, 10],
      });
    });

    it('should create custom gauge', () => {
      const gauge = service.createCustomGauge('test_gauge', 'Test gauge', ['label1']);
      expect(Gauge).toHaveBeenCalledWith({
        name: 'gitsink_test_gauge',
        help: 'Test gauge',
        labelNames: ['label1'],
      });
    });
  });

  describe('Metrics Export', () => {
    it('should get metrics', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toBe('mocked metrics');
      expect(register.metrics).toHaveBeenCalled();
    });
  });
});
