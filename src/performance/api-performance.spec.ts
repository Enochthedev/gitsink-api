import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  TestContext,
  createAuthHeaders,
  createApiKeyHeaders,
} from '../../test/test-utils/integration-helpers';
import { createMockUser, createMockProject } from '../../test/test-utils/mocks';

describe('API Performance Tests', () => {
  let context: TestContext;
  let testUser: any;
  let accessToken: string;
  let apiKey: string;

  beforeAll(async () => {
    context = await createTestApp();

    testUser = createMockUser();
    accessToken = 'valid-jwt-token';
    apiKey = 'valid-api-key-12345678901234567890';

    context.prismaService.user.findUnique.mockResolvedValue(testUser);
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Performance', () => {
    it('should handle high-frequency JWT authentication', async () => {
      const requestCount = 100;
      const startTime = Date.now();

      const requests = Array.from({ length: requestCount }, () =>
        context.request.get('/auth/me').set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete in reasonable time (under 5 seconds for 100 requests)
      expect(duration).toBeLessThan(5000);

      // Calculate average response time
      const avgResponseTime = duration / requestCount;
      expect(avgResponseTime).toBeLessThan(50); // Under 50ms per request
    });

    it('should handle high-frequency API key authentication', async () => {
      const requestCount = 100;
      const startTime = Date.now();

      const requests = Array.from({ length: requestCount }, () =>
        context.request.get('/projects').set(createApiKeyHeaders(apiKey)),
      );

      context.prismaService.project.findMany.mockResolvedValue([]);

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(duration).toBeLessThan(5000);

      const avgResponseTime = duration / requestCount;
      expect(avgResponseTime).toBeLessThan(50);
    });

    it('should handle concurrent authentication requests', async () => {
      const concurrentUsers = 50;
      const requestsPerUser = 5;

      const startTime = Date.now();

      // Create concurrent requests from multiple users
      const allRequests = [];
      for (let i = 0; i < concurrentUsers; i++) {
        const userToken = `token-${i}`;
        for (let j = 0; j < requestsPerUser; j++) {
          allRequests.push(context.request.get('/auth/me').set(createAuthHeaders(userToken)));
        }
      }

      const responses = await Promise.all(allRequests);
      const duration = Date.now() - startTime;

      // Should handle all requests without errors
      const successfulRequests = responses.filter(res => res.status === 200 || res.status === 401);
      expect(successfulRequests.length).toBe(concurrentUsers * requestsPerUser);

      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds for 250 requests
    });
  });

  describe('Projects API Performance', () => {
    it('should handle large project lists efficiently', async () => {
      const projectCount = 1000;
      const mockProjects = Array.from({ length: projectCount }, (_, i) =>
        createMockProject({
          ownerId: testUser.id,
          title: `Performance Test Project ${i}`,
          description: `Description for project ${i}`,
          tags: [`tag${i % 10}`, 'performance'],
        }),
      );

      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const startTime = Date.now();

      const response = await context.request
        .get('/projects')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body.data).toHaveLength(projectCount);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle paginated requests efficiently', async () => {
      const totalProjects = 10000;
      const pageSize = 50;
      const pageCount = Math.ceil(totalProjects / pageSize);

      context.prismaService.project.count.mockResolvedValue(totalProjects);

      const startTime = Date.now();
      const pageRequests = [];

      // Request multiple pages concurrently
      for (let page = 1; page <= Math.min(pageCount, 20); page++) {
        const mockPageProjects = Array.from({ length: pageSize }, (_, i) =>
          createMockProject({
            ownerId: testUser.id,
            title: `Page ${page} Project ${i}`,
          }),
        );

        context.prismaService.project.findMany.mockResolvedValueOnce(mockPageProjects);

        pageRequests.push(
          context.request
            .get('/projects')
            .query({ page, limit: pageSize })
            .set(createAuthHeaders(accessToken)),
        );
      }

      const responses = await Promise.all(pageRequests);
      const duration = Date.now() - startTime;

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(pageSize);
        expect(response.body.pagination.page).toBe(index + 1);
      });

      // Should handle 20 concurrent paginated requests in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle complex filtering efficiently', async () => {
      const mockProjects = Array.from({ length: 500 }, (_, i) =>
        createMockProject({
          ownerId: testUser.id,
          title: `Filter Test Project ${i}`,
          category: i % 3 === 0 ? 'web' : i % 3 === 1 ? 'api' : 'tool',
          tags: [`tag${i % 5}`, 'filter-test'],
          featured: i % 10 === 0,
          language:
            i % 4 === 0
              ? 'TypeScript'
              : i % 4 === 1
                ? 'JavaScript'
                : i % 4 === 2
                  ? 'Python'
                  : 'Java',
        }),
      );

      const complexFilters = [
        { category: 'web', featured: true },
        { tags: ['tag1', 'tag2'], language: 'TypeScript' },
        { category: 'api', featured: false, language: 'JavaScript' },
        { tags: ['filter-test'], category: 'tool' },
      ];

      const startTime = Date.now();
      const filterRequests = complexFilters.map(filter => {
        const filteredProjects = mockProjects.filter(project => {
          if (filter.category && project.category !== filter.category) return false;
          if (filter.featured !== undefined && project.featured !== filter.featured) return false;
          if (filter.language && project.language !== filter.language) return false;
          if (filter.tags && !filter.tags.some(tag => project.tags.includes(tag))) return false;
          return true;
        });

        context.prismaService.project.findMany.mockResolvedValueOnce(filteredProjects);

        return context.request.get('/projects').query(filter).set(createAuthHeaders(accessToken));
      });

      const responses = await Promise.all(filterRequests);
      const duration = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data.length).toBeGreaterThanOrEqual(0);
      });

      // Complex filtering should complete in under 3 seconds
      expect(duration).toBeLessThan(3000);
    });

    it('should handle search queries efficiently', async () => {
      const searchQueries = [
        'react',
        'typescript api',
        'node.js backend',
        'python script',
        'web application',
        'database integration',
        'authentication system',
        'real-time chat',
        'machine learning',
        'data visualization',
      ];

      const mockSearchResults = Array.from({ length: 20 }, (_, i) =>
        createMockProject({
          ownerId: testUser.id,
          title: `Search Result ${i}`,
          description: 'Relevant search result',
        }),
      );

      context.prismaService.$queryRawUnsafe.mockResolvedValue(mockSearchResults);

      const startTime = Date.now();

      const searchRequests = searchQueries.map(query =>
        context.request
          .get('/projects/search')
          .query({ q: query })
          .set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(searchRequests);
      const duration = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      // 10 search queries should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Database Performance', () => {
    it('should handle high-frequency database queries', async () => {
      const queryCount = 200;
      const mockProject = createMockProject({ ownerId: testUser.id });

      context.prismaService.project.findFirst.mockResolvedValue(mockProject);

      const startTime = Date.now();

      const requests = Array.from({ length: queryCount }, (_, i) =>
        context.request.get(`/projects/project-${i}`).set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successfulRequests = responses.filter(res => res.status === 200);
      expect(successfulRequests.length).toBe(queryCount);

      // Should handle 200 database queries in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle complex aggregation queries efficiently', async () => {
      const mockStats = {
        totalProjects: 1000,
        publicProjects: 800,
        privateProjects: 200,
        featuredProjects: 100,
        totalStars: 5000,
        totalForks: 1000,
        languageStats: Array.from({ length: 10 }, (_, i) => ({
          language: `Language${i}`,
          count: Math.floor(Math.random() * 100),
          percentage: Math.random() * 100,
        })),
        categoryStats: Array.from({ length: 5 }, (_, i) => ({
          category: `Category${i}`,
          count: Math.floor(Math.random() * 200),
          percentage: Math.random() * 100,
        })),
      };

      // Mock multiple database calls for aggregation
      context.prismaService.project.count
        .mockResolvedValueOnce(1000) // total
        .mockResolvedValueOnce(800) // public
        .mockResolvedValueOnce(200) // private
        .mockResolvedValueOnce(100); // featured

      context.prismaService.project.aggregate.mockResolvedValue({
        _sum: { starCount: 5000, forkCount: 1000 },
      });

      context.prismaService.project.groupBy
        .mockResolvedValueOnce(
          mockStats.languageStats.map(stat => ({
            language: stat.language,
            _count: { language: stat.count },
          })),
        )
        .mockResolvedValueOnce(
          mockStats.categoryStats.map(stat => ({
            category: stat.category,
            _count: { category: stat.count },
          })),
        );

      const startTime = Date.now();

      const response = await context.request
        .get('/projects/stats')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body.totalProjects).toBe(1000);
      expect(response.body.languageStats).toHaveLength(10);
      expect(response.body.categoryStats).toHaveLength(5);

      // Complex aggregation should complete in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate cache performance benefits', async () => {
      const mockProjects = Array.from({ length: 100 }, (_, i) =>
        createMockProject({
          ownerId: testUser.id,
          title: `Cache Test Project ${i}`,
        }),
      );

      // First request (cache miss)
      context.cacheManager.get.mockResolvedValueOnce(null);
      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const startTime1 = Date.now();
      const response1 = await context.request
        .get('/projects')
        .set(createAuthHeaders(accessToken))
        .expect(200);
      const duration1 = Date.now() - startTime1;

      expect(response1.body.data).toHaveLength(100);
      expect(context.cacheManager.set).toHaveBeenCalled();

      // Second request (cache hit)
      context.cacheManager.get.mockResolvedValueOnce(mockProjects);

      const startTime2 = Date.now();
      const response2 = await context.request
        .get('/projects')
        .set(createAuthHeaders(accessToken))
        .expect(200);
      const duration2 = Date.now() - startTime2;

      expect(response2.body.data).toHaveLength(100);

      // Cached request should be significantly faster
      expect(duration2).toBeLessThan(duration1 * 0.5);
      expect(duration2).toBeLessThan(100); // Under 100ms for cached response
    });

    it('should handle cache invalidation efficiently', async () => {
      const mockProjects = Array.from({ length: 50 }, (_, i) =>
        createMockProject({ ownerId: testUser.id }),
      );

      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      // Warm up cache with multiple requests
      const warmupRequests = Array.from({ length: 10 }, () =>
        context.request.get('/projects').set(createAuthHeaders(accessToken)),
      );

      await Promise.all(warmupRequests);

      // Invalidate cache by creating a new project
      const newProject = createMockProject({ ownerId: testUser.id });
      context.prismaService.project.create.mockResolvedValue(newProject);

      const startTime = Date.now();

      await context.request
        .post('/projects')
        .set(createAuthHeaders(accessToken))
        .send({
          title: 'New Project',
          description: 'Cache invalidation test',
          repoUrl: 'https://github.com/user/new-project',
        })
        .expect(201);

      const duration = Date.now() - startTime;

      // Cache invalidation should be fast
      expect(duration).toBeLessThan(500);
      expect(context.cacheManager.del).toHaveBeenCalled();
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large payloads without memory leaks', async () => {
      const largeProject = createMockProject({
        ownerId: testUser.id,
        title: 'Large Project',
        description: 'x'.repeat(10000), // 10KB description
        markdown: '#'.repeat(50000), // 50KB markdown
        customMetadata: {
          largeField: 'y'.repeat(20000), // 20KB custom data
          arrayField: Array.from({ length: 1000 }, (_, i) => `item-${i}`),
        },
      });

      context.prismaService.project.findFirst.mockResolvedValue(largeProject);

      const initialMemory = process.memoryUsage();
      const requestCount = 50;

      const requests = Array.from({ length: requestCount }, () =>
        context.request.get('/projects/large-project').set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(requests);
      const finalMemory = process.memoryUsage();

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.description.length).toBe(10000);
      });

      // Memory usage should not increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePerRequest = memoryIncrease / requestCount;

      // Should not leak more than 1MB per request
      expect(memoryIncreasePerRequest).toBeLessThan(1024 * 1024);
    });

    it('should handle concurrent requests without resource exhaustion', async () => {
      const concurrentRequests = 100;
      const mockProject = createMockProject({ ownerId: testUser.id });

      context.prismaService.project.findMany.mockResolvedValue([mockProject]);

      const startTime = Date.now();

      // Create many concurrent requests
      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        context.request
          .get('/projects')
          .query({ page: (i % 10) + 1, limit: 10 })
          .set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successfulResponses = responses.filter(res => res.status === 200);
      expect(successfulResponses.length).toBe(concurrentRequests);

      // Should handle 100 concurrent requests in under 10 seconds
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limits efficiently', async () => {
      const requestCount = 200;
      const startTime = Date.now();

      const requests = Array.from({ length: requestCount }, () =>
        context.request.get('/projects').set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successfulResponses = responses.filter(res => res.status === 200);
      const rateLimitedResponses = responses.filter(res => res.status === 429);

      // Should have some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(successfulResponses.length).toBeLessThan(requestCount);

      // Rate limiting should not significantly slow down processing
      expect(duration).toBeLessThan(5000);
    });

    it('should handle rate limit recovery efficiently', async () => {
      // First, hit rate limit
      const initialRequests = Array.from({ length: 100 }, () =>
        context.request.get('/projects').set(createAuthHeaders(accessToken)),
      );

      await Promise.all(initialRequests);

      // Wait for rate limit window to reset (simulate)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try again after reset
      const startTime = Date.now();
      const recoveryRequests = Array.from({ length: 10 }, () =>
        context.request.get('/projects').set(createAuthHeaders(accessToken)),
      );

      const responses = await Promise.all(recoveryRequests);
      const duration = Date.now() - startTime;

      // Should allow requests after rate limit reset
      const successfulResponses = responses.filter(res => res.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors efficiently without degrading performance', async () => {
      const requestCount = 50;

      // Mix of successful and failing requests
      const requests = Array.from({ length: requestCount }, (_, i) => {
        if (i % 3 === 0) {
          // Simulate database error
          context.prismaService.project.findMany.mockRejectedValueOnce(
            new Error('Database connection failed'),
          );
        } else {
          context.prismaService.project.findMany.mockResolvedValueOnce([
            createMockProject({ ownerId: testUser.id }),
          ]);
        }

        return context.request.get('/projects').set(createAuthHeaders(accessToken));
      });

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successfulResponses = responses.filter(res => res.status === 200);
      const errorResponses = responses.filter(res => res.status >= 500);

      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(errorResponses.length).toBeGreaterThan(0);

      // Error handling should not significantly impact performance
      expect(duration).toBeLessThan(3000);
    });
  });
});
