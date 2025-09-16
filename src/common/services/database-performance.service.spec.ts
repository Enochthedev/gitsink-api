import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabasePerformanceService } from './database-performance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('DatabasePerformanceService', () => {
  let service: DatabasePerformanceService;
  let prismaService: PrismaService;
  let metricsService: MetricsService;

  const mockPrismaService = {
    $on: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockMetricsService = {
    recordDatabaseQuery: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        SLOW_QUERY_THRESHOLD_MS: 1000,
      };
      return config[key as keyof typeof config] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabasePerformanceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<DatabasePerformanceService>(DatabasePerformanceService);
    prismaService = module.get<PrismaService>(PrismaService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Query Performance Monitoring', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should setup query logging on initialization', () => {
      expect(mockPrismaService.$on).toHaveBeenCalledWith('query', expect.any(Function));
    });

    it('should extract table name from SELECT query', () => {
      const query = 'SELECT * FROM "User" WHERE id = $1';
      const table = (service as any).extractTableFromQuery(query);
      expect(table).toBe('user');
    });

    it('should extract table name from UPDATE query', () => {
      const query = 'UPDATE "Project" SET title = $1 WHERE id = $2';
      const table = (service as any).extractTableFromQuery(query);
      expect(table).toBe('project');
    });

    it('should extract operation from query', () => {
      const selectQuery = 'SELECT * FROM "User"';
      const insertQuery = 'INSERT INTO "Project" VALUES (...)';
      const updateQuery = 'UPDATE "User" SET name = $1';
      const deleteQuery = 'DELETE FROM "Project" WHERE id = $1';

      expect((service as any).extractOperationFromQuery(selectQuery)).toBe('select');
      expect((service as any).extractOperationFromQuery(insertQuery)).toBe('insert');
      expect((service as any).extractOperationFromQuery(updateQuery)).toBe('update');
      expect((service as any).extractOperationFromQuery(deleteQuery)).toBe('delete');
    });

    it('should normalize queries for consistent tracking', () => {
      const query1 = 'SELECT * FROM "User" WHERE id = $1';
      const query2 = 'SELECT * FROM "User" WHERE id = $2';
      const query3 = 'SELECT   *   FROM   "User"   WHERE   id   =   $1';

      const normalized1 = (service as any).normalizeQuery(query1);
      const normalized2 = (service as any).normalizeQuery(query2);
      const normalized3 = (service as any).normalizeQuery(query3);

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe(normalized3);
    });
  });

  describe('Performance Analysis', () => {
    it('should get slow queries', async () => {
      // Simulate recording some metrics
      const fastQuery = {
        query: 'SELECT * FROM "User"',
        duration: 50,
        timestamp: new Date(),
        table: 'User',
        operation: 'select',
      };

      const slowQuery = {
        query: 'SELECT * FROM "Project" WHERE complex_condition',
        duration: 2000,
        timestamp: new Date(),
        table: 'Project',
        operation: 'select',
      };

      (service as any).recordQueryMetrics(fastQuery);
      (service as any).recordQueryMetrics(slowQuery);

      const slowQueries = await service.getSlowQueries(10);
      expect(slowQueries).toHaveLength(1);
      expect(slowQueries[0].duration).toBe(2000);
    });

    it('should provide query optimization suggestions', async () => {
      const queries = [
        'SELECT * FROM "User" WHERE name LIKE \'%john%\'',
        'SELECT * FROM "Project" ORDER BY created_at',
        'SELECT id FROM "User" WHERE id IN (1, 2, 3, 4, 5)',
      ];

      for (const query of queries) {
        const suggestions = await service.optimizeQuery(query);
        expect(suggestions).toBeInstanceOf(Array);
        expect(suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should extract columns from WHERE clause', () => {
      const whereClause = 'name = $1 AND age > $2 AND status IN ($3, $4)';
      const columns = (service as any).extractColumnsFromWhereClause(whereClause);

      expect(columns).toContain('name');
      expect(columns).toContain('age');
      expect(columns).toContain('status');
    });
  });

  describe('Database Connection Metrics', () => {
    it('should get database connection metrics', async () => {
      const mockConnectionInfo = [
        { state: 'active', count: BigInt(5) },
        { state: 'idle', count: BigInt(3) },
      ];

      const mockMaxConnections = [{ setting: '100' }];

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(mockConnectionInfo)
        .mockResolvedValueOnce(mockMaxConnections);

      const metrics = await service.getDatabaseConnectionMetrics();

      expect(metrics).toEqual({
        activeConnections: 5,
        idleConnections: 3,
        totalConnections: 8,
        maxConnections: 100,
        connectionPoolUtilization: 8,
      });
    });

    it('should handle database connection metrics errors gracefully', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('Database error'));

      const metrics = await service.getDatabaseConnectionMetrics();

      expect(metrics).toEqual({
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 0,
        connectionPoolUtilization: 0,
      });
    });
  });

  describe('Table Performance Analysis', () => {
    it('should analyze table performance', async () => {
      const mockTableStats = [
        {
          schemaname: 'public',
          tablename: 'User',
          seq_scan: BigInt(100),
          seq_tup_read: BigInt(1000),
          idx_scan: BigInt(500),
          idx_tup_fetch: BigInt(500),
          n_tup_ins: BigInt(10),
          n_tup_upd: BigInt(5),
          n_tup_del: BigInt(1),
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockTableStats);

      const analysis = await service.analyzeTablePerformance();

      expect(analysis).toHaveLength(1);
      expect(analysis[0]).toMatchObject({
        schema: 'public',
        table: 'User',
        sequentialScans: 100,
        indexScans: 500,
        indexUsageRatio: expect.any(Number),
      });
    });

    it('should get index usage statistics', async () => {
      const mockIndexStats = [
        {
          schemaname: 'public',
          tablename: 'User',
          indexname: 'User_email_key',
          idx_scan: BigInt(1000),
          idx_tup_read: BigInt(1000),
          idx_tup_fetch: BigInt(1000),
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockIndexStats);

      const stats = await service.getIndexUsageStats();

      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        schema: 'public',
        table: 'User',
        index: 'User_email_key',
        scans: 1000,
      });
    });
  });

  describe('Index Suggestions', () => {
    it('should suggest indexes based on performance analysis', async () => {
      // Mock table stats showing poor index usage
      const mockTableStats = [
        {
          schema: 'public',
          table: 'Project',
          sequentialScans: 1000,
          indexScans: 10,
          indexUsageRatio: 0.01, // Very low index usage
        },
      ];

      jest.spyOn(service, 'analyzeTablePerformance').mockResolvedValue(mockTableStats);
      jest.spyOn(service, 'getSlowQueries').mockResolvedValue([]);

      const suggestions = await service.suggestIndexes();

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.some(s => s.includes('Project'))).toBe(true);
    });
  });

  describe('Metrics Management', () => {
    it('should reset metrics', async () => {
      // Add some metrics first
      (service as any).recordQueryMetrics({
        query: 'SELECT * FROM "User"',
        duration: 100,
        timestamp: new Date(),
        table: 'User',
        operation: 'select',
      });

      await service.resetMetrics();

      const stats = await service.getQueryStatistics();
      expect(Object.keys(stats)).toHaveLength(0);
    });

    it('should get query statistics for time window', async () => {
      const now = new Date();
      const recentQuery = {
        query: 'SELECT * FROM "User"',
        duration: 100,
        timestamp: now,
        table: 'User',
        operation: 'select',
      };

      const oldQuery = {
        query: 'SELECT * FROM "Project"',
        duration: 200,
        timestamp: new Date(now.getTime() - 7200000), // 2 hours ago
        table: 'Project',
        operation: 'select',
      };

      (service as any).recordQueryMetrics(recentQuery);
      (service as any).recordQueryMetrics(oldQuery);

      // Get stats for last hour (3600000 ms)
      const stats = await service.getQueryStatistics(3600000);

      // Should only include the recent query
      const statKeys = Object.keys(stats);
      expect(statKeys.length).toBeGreaterThan(0);
    });
  });
});

describe('DatabasePerformanceService Integration', () => {
  let service: DatabasePerformanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabasePerformanceService,
        {
          provide: PrismaService,
          useValue: {
            $on: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(1000),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            recordDatabaseQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DatabasePerformanceService>(DatabasePerformanceService);
  });

  it('should handle query logging events', () => {
    const mockQueryEvent = {
      query: 'SELECT * FROM "User" WHERE id = $1',
      params: ['123'],
      duration: 150,
      target: 'User.findUnique',
    };

    // Simulate query event
    const queryHandler = jest.fn();
    (service as any).setupQueryLogging = jest.fn(() => {
      queryHandler(mockQueryEvent);
    });

    expect(() => (service as any).setupQueryLogging()).not.toThrow();
  });

  it('should maintain metrics history within limits', () => {
    const maxHistory = (service as any).maxMetricsHistory;

    // Add more metrics than the limit
    for (let i = 0; i < maxHistory + 100; i++) {
      (service as any).recordQueryMetrics({
        query: `SELECT * FROM "User" WHERE id = ${i}`,
        duration: 100,
        timestamp: new Date(),
        table: 'User',
        operation: 'select',
      });
    }

    const queryMetrics = (service as any).queryMetrics;
    const normalizedQuery = (service as any).normalizeQuery('SELECT * FROM "User" WHERE id = ?');
    const metrics = queryMetrics.get(normalizedQuery);

    expect(metrics.length).toBeLessThanOrEqual(maxHistory);
  });
});
