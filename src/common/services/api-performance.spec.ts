import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ResponseOptimizationService } from './response-optimization.service';
import { ApiMonitoringService } from './api-monitoring.service';
import { MetricsService } from '../../metrics/metrics.service';
import { Request, Response } from 'express';

describe('API Performance Services', () => {
  let responseOptimizationService: ResponseOptimizationService;
  let apiMonitoringService: ApiMonitoringService;
  let metricsService: MetricsService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        COMPRESSION_THRESHOLD: 1024,
        COMPRESSION_LEVEL: 6,
        ENABLE_COMPRESSION: true,
        ENABLE_RESPONSE_CACHING: true,
        API_METRICS_BUFFER_SIZE: 100,
        API_METRICS_FLUSH_INTERVAL: 5000,
      };
      return config[key as keyof typeof config] || defaultValue;
    }),
  };

  const mockMetricsService = {
    recordAPICall: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponseOptimizationService,
        ApiMonitoringService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    responseOptimizationService = module.get<ResponseOptimizationService>(
      ResponseOptimizationService,
    );
    apiMonitoringService = module.get<ApiMonitoringService>(ApiMonitoringService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ResponseOptimizationService', () => {
    describe('Compression', () => {
      it('should compress large JSON responses', async () => {
        const largeData = {
          items: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: `This is a description for item ${i}`.repeat(10),
          })),
        };

        const result = await responseOptimizationService.compressResponse(
          largeData,
          'gzip, deflate, br',
        );

        expect(result.encoding).toBeDefined();
        expect(result.metrics.compressionRatio).toBeGreaterThan(1);
        expect(result.metrics.compressedSize).toBeLessThan(result.metrics.originalSize);
      });

      it('should not compress small responses', async () => {
        const smallData = { message: 'Hello' };

        const result = await responseOptimizationService.compressResponse(
          smallData,
          'gzip, deflate, br',
        );

        expect(result.encoding).toBeUndefined();
        expect(result.metrics.algorithm).toBe('none');
        expect(result.metrics.compressionRatio).toBe(1);
      });

      it('should select best compression algorithm', async () => {
        const data = { test: 'data'.repeat(1000) };

        // Test Brotli preference
        const brotliResult = await responseOptimizationService.compressResponse(
          data,
          'br, gzip, deflate',
        );
        expect(brotliResult.encoding).toBe('br');

        // Test Gzip fallback
        const gzipResult = await responseOptimizationService.compressResponse(
          data,
          'gzip, deflate',
        );
        expect(gzipResult.encoding).toBe('gzip');

        // Test Deflate fallback
        const deflateResult = await responseOptimizationService.compressResponse(data, 'deflate');
        expect(deflateResult.encoding).toBe('deflate');
      });

      it('should handle compression errors gracefully', async () => {
        const data = { test: 'data' };

        // Mock compression failure
        jest.spyOn(require('zlib'), 'gzip').mockImplementation(() => {
          throw new Error('Compression failed');
        });

        const result = await responseOptimizationService.compressResponse(data, 'gzip');

        expect(result.encoding).toBeUndefined();
        expect(result.metrics.algorithm).toBe('none');
      });
    });

    describe('Cache Headers', () => {
      let mockResponse: Partial<Response>;

      beforeEach(() => {
        mockResponse = {
          set: jest.fn(),
        };
      });

      it('should set appropriate cache headers for JSON', () => {
        responseOptimizationService.setCacheHeaders(
          mockResponse as Response,
          { maxAge: 300, mustRevalidate: true },
          'application/json',
        );

        expect(mockResponse.set).toHaveBeenCalledWith(
          'Cache-Control',
          'max-age=300, must-revalidate',
        );
      });

      it('should set no-cache headers when caching is disabled', () => {
        // Mock caching disabled
        jest.spyOn(mockConfigService, 'get').mockReturnValue(false);

        const service = new ResponseOptimizationService(mockConfigService as any);
        service.setCacheHeaders(mockResponse as Response);

        expect(mockResponse.set).toHaveBeenCalledWith(
          'Cache-Control',
          'no-cache, no-store, must-revalidate',
        );
      });

      it('should set immutable cache headers for static assets', () => {
        responseOptimizationService.setCacheHeaders(
          mockResponse as Response,
          { maxAge: 86400, public: true, immutable: true },
          'image/png',
        );

        expect(mockResponse.set).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=86400, immutable',
        );
      });
    });

    describe('Pagination Optimization', () => {
      it('should optimize paginated responses', () => {
        const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const result = responseOptimizationService.optimizePaginatedResponse(
          data,
          100,
          2,
          10,
          'https://api.example.com/items',
        );

        expect(result.pagination).toMatchObject({
          page: 2,
          limit: 10,
          totalCount: 100,
          totalPages: 10,
          hasNextPage: true,
          hasPreviousPage: true,
        });

        expect(result.pagination.nextPage).toBe('https://api.example.com/items?page=3&limit=10');
        expect(result.pagination.previousPage).toBe(
          'https://api.example.com/items?page=1&limit=10',
        );
      });

      it('should optimize cursor-based pagination', () => {
        const data = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const result = responseOptimizationService.optimizeCursorPaginatedResponse(
          data,
          10,
          'https://api.example.com/items',
          true,
        );

        expect(result.pagination).toMatchObject({
          limit: 10,
          hasNextPage: true,
          nextCursor: 'c',
        });

        expect(result.pagination.nextPage).toBe('https://api.example.com/items?cursor=c&limit=10');
      });
    });

    describe('Lazy Loading', () => {
      it('should apply lazy loading by omitting specified fields', () => {
        const data = {
          id: 1,
          name: 'Test',
          description: 'Description',
          metadata: { large: 'data' },
          relations: ['rel1', 'rel2'],
        };

        const mockRequest = {
          query: {},
        } as Request;

        const result = responseOptimizationService.applyLazyLoading(
          data,
          ['metadata', 'relations'],
          mockRequest,
        );

        expect(result).toEqual({
          id: 1,
          name: 'Test',
          description: 'Description',
        });
      });

      it('should include specific fields when requested', () => {
        const data = {
          id: 1,
          name: 'Test',
          description: 'Description',
          metadata: { large: 'data' },
        };

        const mockRequest = {
          query: { fields: 'id,name' },
        } as any;

        const result = responseOptimizationService.applyLazyLoading(
          data,
          ['metadata'],
          mockRequest,
        );

        expect(result).toEqual({
          id: 1,
          name: 'Test',
        });
      });

      it('should include lazy fields when explicitly requested', () => {
        const data = {
          id: 1,
          name: 'Test',
          metadata: { large: 'data' },
          relations: ['rel1'],
        };

        const mockRequest = {
          query: { include: 'metadata' },
        } as any;

        const result = responseOptimizationService.applyLazyLoading(
          data,
          ['metadata', 'relations'],
          mockRequest,
        );

        expect(result).toEqual({
          id: 1,
          name: 'Test',
          metadata: { large: 'data' },
        });
      });
    });
  });

  describe('ApiMonitoringService', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      mockRequest = {
        method: 'GET',
        path: '/api/projects',
        route: { path: '/api/projects' } as any,
        get: jest.fn((header: string) => {
          const headers: Record<string, string> = {
            'User-Agent': 'Test Agent',
            'Accept-Encoding': 'gzip, deflate',
          };
          return headers[header];
        }) as any,
        connection: { remoteAddress: '127.0.0.1' } as any,
      };

      mockResponse = {
        statusCode: 200,
      };
    });

    it('should record API request metrics', () => {
      apiMonitoringService.recordApiRequest(
        mockRequest as Request,
        mockResponse as Response,
        150,
        1024,
        2048,
      );

      expect(mockMetricsService.recordAPICall).toHaveBeenCalledWith(
        '/api/projects',
        'get',
        200,
        150,
      );
    });

    it('should track endpoint statistics', () => {
      // Record multiple requests
      for (let i = 0; i < 10; i++) {
        apiMonitoringService.recordApiRequest(
          mockRequest as Request,
          mockResponse as Response,
          100 + i * 10,
          1024,
          2048,
        );
      }

      const stats = apiMonitoringService.getEndpointStats();
      expect(stats).toHaveLength(1);

      const endpointStats = stats[0];
      expect(endpointStats.endpoint).toBe('/api/projects');
      expect(endpointStats.method).toBe('get');
      expect(endpointStats.totalRequests).toBe(10);
      expect(endpointStats.averageResponseTime).toBeCloseTo(145, 0);
    });

    it('should identify slow endpoints', () => {
      // Record fast requests
      for (let i = 0; i < 5; i++) {
        apiMonitoringService.recordApiRequest(
          { ...mockRequest, path: '/api/fast' } as Request,
          mockResponse as Response,
          50,
        );
      }

      // Record slow requests
      for (let i = 0; i < 5; i++) {
        apiMonitoringService.recordApiRequest(
          { ...mockRequest, path: '/api/slow' } as Request,
          mockResponse as Response,
          2000,
        );
      }

      const slowEndpoints = apiMonitoringService.getSlowEndpoints(1000, 10);
      expect(slowEndpoints).toHaveLength(1);
      expect(slowEndpoints[0].endpoint).toBe('/api/slow');
      expect(slowEndpoints[0].averageResponseTime).toBe(2000);
    });

    it('should track error rates', () => {
      // Record successful requests
      for (let i = 0; i < 8; i++) {
        apiMonitoringService.recordApiRequest(
          mockRequest as Request,
          { statusCode: 200 } as Response,
          100,
        );
      }

      // Record error requests
      for (let i = 0; i < 2; i++) {
        apiMonitoringService.recordApiRequest(
          mockRequest as Request,
          { statusCode: 500 } as Response,
          100,
        );
      }

      const highErrorEndpoints = apiMonitoringService.getHighErrorRateEndpoints(0.1, 10);
      expect(highErrorEndpoints).toHaveLength(1);
      expect(highErrorEndpoints[0].errorRate).toBe(0.2); // 20% error rate
    });

    it('should generate performance summary', () => {
      // Record various requests
      for (let i = 0; i < 100; i++) {
        const statusCode = i < 95 ? 200 : 500; // 5% error rate
        const responseTime = 100 + Math.random() * 200; // 100-300ms

        apiMonitoringService.recordApiRequest(
          mockRequest as Request,
          { statusCode } as Response,
          responseTime,
        );
      }

      const summary = apiMonitoringService.getPerformanceSummary();

      expect(summary.totalRequests).toBe(100);
      expect(summary.errorRate).toBeCloseTo(0.05, 2);
      expect(summary.averageResponseTime).toBeGreaterThan(100);
      expect(summary.averageResponseTime).toBeLessThan(300);
    });

    it('should normalize endpoint paths', () => {
      const testCases = [
        { input: '/api/users/123', expected: '/api/users/:id' },
        {
          input: '/api/projects/550e8400-e29b-41d4-a716-446655440000',
          expected: '/api/projects/:uuid',
        },
        {
          input: '/api/items/507f1f77bcf86cd799439011',
          expected: '/api/items/:objectId',
        },
        { input: '/api/search?q=test&limit=10', expected: '/api/search' },
      ];

      for (const testCase of testCases) {
        const normalized = (apiMonitoringService as any).normalizeEndpoint(testCase.input);
        expect(normalized).toBe(testCase.expected);
      }
    });

    it('should set and check performance thresholds', () => {
      apiMonitoringService.setPerformanceThreshold('/api/projects', 'GET', 500);

      // Record a slow request that exceeds threshold
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      apiMonitoringService.recordApiRequest(
        mockRequest as Request,
        mockResponse as Response,
        1000, // Exceeds 500ms threshold
      );

      // Should trigger performance alert (logged as warning)
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should compress large responses within acceptable time', async () => {
      const largeData = {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A'.repeat(100),
          metadata: { key: 'value'.repeat(50) },
        })),
      };

      const startTime = Date.now();
      const result = await responseOptimizationService.compressResponse(largeData, 'gzip');
      const compressionTime = Date.now() - startTime;

      expect(compressionTime).toBeLessThan(1000); // Should compress in under 1 second
      expect(result.metrics.compressionRatio).toBeGreaterThan(5); // Should achieve good compression
    });

    it('should handle high-frequency API monitoring', () => {
      const testRequest = {
        method: 'GET',
        path: '/api/test',
        route: { path: '/api/test' } as any,
        get: jest.fn(() => 'Test Agent') as any,
        connection: { remoteAddress: '127.0.0.1' } as any,
      } as Request;

      const testResponse = {
        statusCode: 200,
      } as Response;

      const startTime = Date.now();

      // Simulate 1000 API requests
      for (let i = 0; i < 1000; i++) {
        apiMonitoringService.recordApiRequest(testRequest, testResponse, Math.random() * 200);
      }

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(100); // Should process 1000 requests in under 100ms
    });

    it('should efficiently calculate statistics for large datasets', () => {
      const testRequest = {
        method: 'GET',
        path: '/api/test',
        route: { path: '/api/test' } as any,
        get: jest.fn(() => 'Test Agent') as any,
        connection: { remoteAddress: '127.0.0.1' } as any,
      } as Request;

      const testResponse = {
        statusCode: 200,
      } as Response;

      // Record 10000 requests
      for (let i = 0; i < 10000; i++) {
        apiMonitoringService.recordApiRequest(
          { ...testRequest, path: `/api/endpoint${i % 10}` } as Request,
          testResponse,
          Math.random() * 1000,
        );
      }

      const startTime = Date.now();
      const summary = apiMonitoringService.getPerformanceSummary();
      const calculationTime = Date.now() - startTime;

      expect(calculationTime).toBeLessThan(50); // Should calculate stats in under 50ms
      expect(summary.totalRequests).toBe(10000);
    });
  });
});
