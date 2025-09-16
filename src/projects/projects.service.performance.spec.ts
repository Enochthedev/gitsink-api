import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParserService } from '../parser/parser.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PinoLogger } from 'nestjs-pino';
import { SyncQueueService } from './sync-queue.service';

describe('ProjectsService Performance Tests', () => {
  let service: ProjectsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    project: {
      count: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };

  const mockParserService = {
    parseMarkdown: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockLogger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };

  const mockSyncQueueService = {
    addJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ParserService,
          useValue: mockParserService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
        {
          provide: PinoLogger,
          useValue: mockLogger,
        },
        {
          provide: SyncQueueService,
          useValue: mockSyncQueueService,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEnhancedProjects Performance', () => {
    it('should handle large datasets efficiently with pagination', async () => {
      const mockProjects = Array.from({ length: 1000 }, (_, i) => ({
        id: `project-${i}`,
        title: `Project ${i}`,
        description: `Description for project ${i}`,
        ownerId: 'test-user',
        tags: [`tag-${i % 10}`],
        category: `category-${i % 5}`,
        language: `language-${i % 3}`,
        starCount: Math.floor(Math.random() * 1000),
        forkCount: Math.floor(Math.random() * 100),
        createdAt: new Date(),
        updatedAt: new Date(),
        published: true,
        featured: i % 10 === 0,
      }));

      mockPrismaService.project.count.mockResolvedValue(1000);
      mockPrismaService.project.findMany.mockResolvedValue(mockProjects.slice(0, 20));

      const startTime = Date.now();

      const result = await service.getEnhancedProjects(
        'test-user',
        { categories: ['category-1', 'category-2'] },
        { field: 'STARS', order: 'DESC' },
        { offset: 0, limit: 20 },
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.edges).toHaveLength(20);
      expect(result.totalCount).toBe(1000);
      expect(mockPrismaService.project.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.project.findMany).toHaveBeenCalledTimes(1);
    });

    it('should optimize queries with complex filters', async () => {
      const complexFilter = {
        search: 'test query',
        categories: ['web', 'mobile', 'desktop'],
        languages: ['JavaScript', 'TypeScript', 'Python'],
        platforms: ['github', 'gitlab'],
        tags: ['react', 'node', 'api'],
        featured: true,
        published: true,
        isPrivate: false,
        starCount: { min: 10, max: 1000 },
        forkCount: { min: 5, max: 100 },
        createdAt: {
          from: new Date('2023-01-01'),
          to: new Date('2024-01-01'),
        },
      };

      mockPrismaService.project.count.mockResolvedValue(50);
      mockPrismaService.project.findMany.mockResolvedValue([]);

      const startTime = Date.now();

      await service.getEnhancedProjects(
        'test-user',
        complexFilter,
        { field: 'POPULARITY', order: 'DESC' },
        { offset: 0, limit: 20 },
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(500); // Complex queries should still be fast

      // Verify that the query was constructed with proper filters
      const findManyCall = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(findManyCall.where).toHaveProperty('ownerId', 'test-user');
      expect(findManyCall.where).toHaveProperty('OR'); // Search filter
      expect(findManyCall.where).toHaveProperty('category');
      expect(findManyCall.where).toHaveProperty('language');
      expect(findManyCall.where).toHaveProperty('platform');
      expect(findManyCall.where).toHaveProperty('tags');
      expect(findManyCall.where).toHaveProperty('featured', true);
      expect(findManyCall.where).toHaveProperty('published', true);
      expect(findManyCall.where).toHaveProperty('isPrivate', false);
      expect(findManyCall.where).toHaveProperty('starCount');
      expect(findManyCall.where).toHaveProperty('forkCount');
      expect(findManyCall.where).toHaveProperty('createdAt');
    });
  });

  describe('searchProjects Performance', () => {
    it('should handle full-text search efficiently', async () => {
      const mockSearchResults = Array.from({ length: 50 }, (_, i) => ({
        id: `project-${i}`,
        title: `Matching Project ${i}`,
        description: `This project matches the search query ${i}`,
        ownerId: 'test-user',
        rank: 0.5 - i * 0.01, // Decreasing relevance
      }));

      mockPrismaService.$queryRawUnsafe.mockResolvedValue(mockSearchResults);

      const startTime = Date.now();

      const result = await service.searchProjects(
        'test-user',
        'react typescript api',
        { categories: ['web'] },
        { offset: 0, limit: 20 },
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(800); // Full-text search should be reasonably fast
      expect(result).toHaveLength(50);
      expect(mockPrismaService.$queryRawUnsafe).toHaveBeenCalledTimes(1);

      // Verify the full-text search query was called with correct parameters
      const queryCall = mockPrismaService.$queryRawUnsafe.mock.calls[0];
      expect(queryCall[1]).toBe('react typescript api'); // Search query
      expect(queryCall[2]).toBe('test-user'); // User ID
    });

    it('should fallback gracefully when full-text search fails', async () => {
      mockPrismaService.$queryRawUnsafe.mockRejectedValue(new Error('Full-text search failed'));
      mockPrismaService.project.findMany.mockResolvedValue([
        {
          id: 'fallback-project',
          title: 'Fallback Project',
          description: 'This is a fallback result',
          ownerId: 'test-user',
        },
      ]);

      const startTime = Date.now();

      const result = await service.searchProjects(
        'test-user',
        'test query',
        {},
        { offset: 0, limit: 20 },
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(500); // Fallback should be fast
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Fallback Project');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Full-text search failed, falling back to simple search'),
      );
    });
  });

  describe('getProjectStatistics Performance', () => {
    it('should efficiently aggregate large datasets', async () => {
      mockPrismaService.project.count
        .mockResolvedValueOnce(1000) // totalProjects
        .mockResolvedValueOnce(800) // publicProjects
        .mockResolvedValueOnce(200) // privateProjects
        .mockResolvedValueOnce(100); // featuredProjects

      mockPrismaService.project.aggregate.mockResolvedValue({
        _sum: {
          starCount: 50000,
          forkCount: 10000,
        },
      });

      mockPrismaService.project.groupBy
        .mockResolvedValueOnce([
          // languageStats
          { language: 'JavaScript', _count: { language: 400 } },
          { language: 'TypeScript', _count: { language: 300 } },
          { language: 'Python', _count: { language: 200 } },
        ])
        .mockResolvedValueOnce([
          // categoryStats
          { category: 'web', _count: { category: 500 } },
          { category: 'mobile', _count: { category: 300 } },
          { category: 'desktop', _count: { category: 200 } },
        ]);

      mockPrismaService.$queryRaw.mockResolvedValue([
        { platform: 'github', count: BigInt(800) },
        { platform: 'gitlab', count: BigInt(150) },
        { platform: 'bitbucket', count: BigInt(50) },
      ]);

      const startTime = Date.now();

      const result = await service.getProjectStatistics('test-user', {});

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(1000); // Aggregation should complete within 1 second
      expect(result.totalProjects).toBe(1000);
      expect(result.totalStars).toBe(50000);
      expect(result.totalForks).toBe(10000);
      expect(result.languageStats).toHaveLength(3);
      expect(result.categoryStats).toHaveLength(3);
      expect(result.platformStats).toHaveLength(3);

      // Verify all aggregation queries were called
      expect(mockPrismaService.project.count).toHaveBeenCalledTimes(4);
      expect(mockPrismaService.project.aggregate).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.project.groupBy).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrendingProjects Performance', () => {
    it('should efficiently calculate trending scores', async () => {
      const mockTrendingResults = Array.from({ length: 10 }, (_, i) => ({
        id: `trending-${i}`,
        title: `Trending Project ${i}`,
        description: `Popular project ${i}`,
        starCount: 1000 - i * 100,
        forkCount: 200 - i * 20,
        trending_score: 500 - i * 50,
        lastCommitAt: new Date(),
        createdAt: new Date(),
        featured: i < 3,
      }));

      mockPrismaService.$queryRawUnsafe.mockResolvedValue(mockTrendingResults);

      const startTime = Date.now();

      const result = await service.getTrendingProjects('7d', 10);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(600); // Trending calculation should be fast
      expect(result).toHaveLength(10);
      expect(mockPrismaService.$queryRawUnsafe).toHaveBeenCalledTimes(1);

      // Verify the trending query includes proper scoring logic
      const queryCall = mockPrismaService.$queryRawUnsafe.mock.calls[0];
      expect(queryCall[0]).toContain('trending_score');
      expect(queryCall[0]).toContain('starCount');
      expect(queryCall[0]).toContain('forkCount');
      expect(queryCall[0]).toContain('lastCommitAt');
    });

    it('should fallback gracefully when trending query fails', async () => {
      mockPrismaService.$queryRawUnsafe.mockRejectedValue(new Error('Trending query failed'));
      mockPrismaService.project.findMany.mockResolvedValue([
        {
          id: 'fallback-trending',
          title: 'Fallback Trending Project',
          starCount: 500,
          featured: true,
        },
      ]);

      const startTime = Date.now();

      const result = await service.getTrendingProjects('30d', 5);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(300); // Fallback should be very fast
      expect(result).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Trending projects query failed, falling back to simple sort'),
      );
    });
  });

  describe('Query Optimization', () => {
    it('should use proper indexes for common query patterns', async () => {
      // Test that queries are structured to use database indexes
      await service.getEnhancedProjects(
        'test-user',
        { featured: true, published: true },
        { field: 'STARS', order: 'DESC' },
        { offset: 0, limit: 20 },
      );

      const findManyCall = mockPrismaService.project.findMany.mock.calls[0][0];

      // Verify query structure supports indexed fields
      expect(findManyCall.where).toHaveProperty('ownerId'); // Indexed
      expect(findManyCall.where).toHaveProperty('featured'); // Indexed with published
      expect(findManyCall.where).toHaveProperty('published'); // Indexed with featured
      expect(findManyCall.orderBy).toHaveProperty('starCount'); // Indexed
    });

    it('should limit result sets appropriately', async () => {
      await service.getEnhancedProjects('test-user', {}, undefined, {
        offset: 100,
        limit: 50,
      });

      const findManyCall = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(100);
      expect(findManyCall.take).toBe(50);
    });
  });
});
