import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParserService } from '../parser/parser.service';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { SyncQueueService } from './sync-queue.service';
import axios from 'axios';
import {
  createMockPrismaService,
  createMockParserService,
  createMockConfigService,
  createMockLogger,
  createMockSyncQueueService,
  createMockCacheManager,
  createMockProject,
  createMockUser,
  createMockGitHubRepo,
  createMockAxiosResponse,
  createMockAxiosError,
} from '../../test/test-utils/mocks';

// Mock external dependencies
jest.mock('axios');
jest.mock('../utils/github.utils', () => ({
  parseGitHubRepoUrl: jest.fn((url: string) => ({
    owner: 'testuser',
    repo: 'test-repo',
  })),
}));

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prismaService: ReturnType<typeof createMockPrismaService>;
  let parserService: ReturnType<typeof createMockParserService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let logger: ReturnType<typeof createMockLogger>;
  let syncQueueService: ReturnType<typeof createMockSyncQueueService>;
  let cacheManager: ReturnType<typeof createMockCacheManager>;

  const mockAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaService = createMockPrismaService();
    parserService = createMockParserService();
    configService = createMockConfigService();
    logger = createMockLogger();
    syncQueueService = createMockSyncQueueService();
    cacheManager = createMockCacheManager();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ParserService, useValue: parserService },
        { provide: ConfigService, useValue: configService },
        { provide: PinoLogger, useValue: logger },
        { provide: SyncQueueService, useValue: syncQueueService },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('basic functionality', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getFilteredProjectsForUser', () => {
    it('should filter by tag only', async () => {
      const mockProjects = [createMockProject({ tags: ['api'] })];
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getFilteredProjectsForUser({ tag: 'api' }, 'user1');

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'user1', tags: { has: 'api' } },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter by category and featured', async () => {
      const mockProjects = [createMockProject({ category: 'web', featured: true })];
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getFilteredProjectsForUser(
        { category: 'web', featured: true },
        'user1',
      );

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'user1', category: 'web', featured: true },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should handle empty filter', async () => {
      const mockProjects = [createMockProject()];
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getFilteredProjectsForUser({}, 'user1');

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'user1' },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter by multiple criteria', async () => {
      const mockProjects = [createMockProject({ category: 'web', featured: true, tags: ['api'] })];
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      await service.getFilteredProjectsForUser(
        { category: 'web', featured: true, tag: 'api' },
        'user1',
      );

      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: {
          ownerId: 'user1',
          category: 'web',
          featured: true,
          tags: { has: 'api' },
        },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('getAllProjectsForUser', () => {
    it('should return cached projects if available', async () => {
      const mockProjects = [createMockProject()];
      cacheManager.get.mockResolvedValue(mockProjects);

      const result = await service.getAllProjectsForUser('user1');

      expect(result).toEqual(mockProjects);
      expect(cacheManager.get).toHaveBeenCalledWith('user:user1:projects');
      expect(prismaService.project.findMany).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not cached', async () => {
      const mockProjects = [createMockProject()];
      cacheManager.get.mockResolvedValue(null);
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getAllProjectsForUser('user1');

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'user1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(cacheManager.set).toHaveBeenCalledWith('user:user1:projects', mockProjects);
    });
  });

  describe('getProjectByRepoUrl', () => {
    it('should return cached project if available', async () => {
      const mockProject = createMockProject();
      const repoUrl = 'https://github.com/user/repo';
      cacheManager.get.mockResolvedValue(mockProject);

      const result = await service.getProjectByRepoUrl(repoUrl, 'user1');

      expect(result).toEqual(mockProject);
      expect(cacheManager.get).toHaveBeenCalledWith('user:user1:repo:https://github.com/user/repo');
      expect(prismaService.project.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not cached', async () => {
      const mockProject = createMockProject();
      const repoUrl = 'https://github.com/user/repo';
      cacheManager.get.mockResolvedValue(null);
      prismaService.project.findUnique.mockResolvedValue(mockProject);

      const result = await service.getProjectByRepoUrl(repoUrl, 'user1');

      expect(result).toEqual(mockProject);
      expect(prismaService.project.findUnique).toHaveBeenCalledWith({
        where: {
          ownerId_repoUrl: {
            ownerId: 'user1',
            repoUrl,
          },
        },
      });
      expect(cacheManager.set).toHaveBeenCalledWith(
        'user:user1:repo:https://github.com/user/repo',
        mockProject,
      );
    });

    it('should return null if project not found', async () => {
      const repoUrl = 'https://github.com/user/nonexistent';
      cacheManager.get.mockResolvedValue(null);
      prismaService.project.findUnique.mockResolvedValue(null);

      const result = await service.getProjectByRepoUrl(repoUrl, 'user1');

      expect(result).toBeNull();
      expect(cacheManager.set).not.toHaveBeenCalled();
    });
  });

  describe('getProjectById', () => {
    it('should return project by ID for user', async () => {
      const mockProject = createMockProject();
      prismaService.project.findFirst.mockResolvedValue(mockProject);

      const result = await service.getProjectById('project-123', 'user1');

      expect(result).toEqual(mockProject);
      expect(prismaService.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-123', ownerId: 'user1' },
      });
    });

    it('should return null if project not found or not owned by user', async () => {
      prismaService.project.findFirst.mockResolvedValue(null);

      const result = await service.getProjectById('project-123', 'user1');

      expect(result).toBeNull();
    });
  });

  describe('syncProjectFromGitHub', () => {
    const userId = 'user-123';
    const repoUrl = 'https://github.com/testuser/test-repo';
    const branch = 'main';

    it('should sync project successfully with Portfolio.md', async () => {
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject();
      const portfolioMd = `---
title: "Test Project"
description: "A test project"
tags: ["test", "demo"]
featured: true
---
# Test Project
This is a test project.`;

      mockAxios.get
        .mockResolvedValueOnce(createMockAxiosResponse(mockGitHubRepo))
        .mockResolvedValueOnce(createMockAxiosResponse(portfolioMd));

      parserService.parseMarkdown.mockReturnValue({
        valid: true,
        data: {
          title: 'Test Project',
          description: 'A test project',
          tags: ['test', 'demo'],
          featured: true,
          published: true,
          body: '# Test Project\nThis is a test project.',
        },
      });

      prismaService.project.upsert.mockResolvedValue(mockProject);

      const result = await service.syncProjectFromGitHub(userId, repoUrl, branch);

      expect(result).toEqual(mockProject);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
      expect(parserService.parseMarkdown).toHaveBeenCalledWith(portfolioMd);
      expect(prismaService.project.upsert).toHaveBeenCalled();
      expect(cacheManager.del).toHaveBeenCalledTimes(2);
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it('should sync project without Portfolio.md', async () => {
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject();

      mockAxios.get
        .mockResolvedValueOnce(createMockAxiosResponse(mockGitHubRepo))
        .mockRejectedValueOnce(createMockAxiosError(404, 'Not Found'));

      prismaService.project.upsert.mockResolvedValue(mockProject);

      const result = await service.syncProjectFromGitHub(userId, repoUrl, branch);

      expect(result).toEqual(mockProject);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Portfolio.md not found'));
      expect(prismaService.project.upsert).toHaveBeenCalledWith({
        where: {
          ownerId_repoUrl: {
            ownerId: userId,
            repoUrl,
          },
        },
        create: expect.objectContaining({
          title: mockGitHubRepo.name,
          description: mockGitHubRepo.description || '',
          valid: true,
          validationErrors: [],
        }),
        update: expect.objectContaining({
          title: mockGitHubRepo.name,
          description: mockGitHubRepo.description || '',
          valid: true,
          validationErrors: [],
        }),
      });
    });

    it('should handle invalid Portfolio.md', async () => {
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject();
      const invalidPortfolioMd = `---
title: "Test Project"
---
Missing description`;

      mockAxios.get
        .mockResolvedValueOnce(createMockAxiosResponse(mockGitHubRepo))
        .mockResolvedValueOnce(createMockAxiosResponse(invalidPortfolioMd));

      parserService.parseMarkdown.mockReturnValue({
        valid: false,
        errors: [{ message: 'Missing required field: description' }],
      });

      prismaService.project.upsert.mockResolvedValue(mockProject);

      const result = await service.syncProjectFromGitHub(userId, repoUrl, branch);

      expect(result).toEqual(mockProject);
      expect(prismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            valid: false,
            validationErrors: ['Missing required field: description'],
          }),
          update: expect.objectContaining({
            valid: false,
            validationErrors: ['Missing required field: description'],
          }),
        }),
      );
    });

    it('should handle GitHub API errors', async () => {
      mockAxios.get.mockRejectedValue(createMockAxiosError(403, 'Rate limit exceeded'));

      await expect(service.syncProjectFromGitHub(userId, repoUrl, branch)).rejects.toThrow();
    });

    it('should handle blacklisted projects', async () => {
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject({ blacklisted: true });

      mockAxios.get.mockResolvedValueOnce(createMockAxiosResponse(mockGitHubRepo));
      prismaService.project.upsert.mockResolvedValue(mockProject);

      const result = await service.syncProjectFromGitHub(userId, repoUrl, branch, true);

      expect(result).toEqual(mockProject);
      expect(prismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            blacklisted: true,
          }),
          update: expect.objectContaining({
            blacklisted: true,
          }),
        }),
      );
    });
  });

  describe('queueSyncProject', () => {
    it('should queue sync job', async () => {
      const userId = 'user-123';
      const repoUrl = 'https://github.com/user/repo';
      const branch = 'main';

      await service.queueSyncProject(userId, repoUrl, branch);

      expect(syncQueueService.addJob).toHaveBeenCalledWith(userId, repoUrl, branch);
    });
  });

  describe('syncAllReposForUser', () => {
    it('should sync all repositories for user', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({
        id: userId,
        githubToken: 'encrypted-github-token',
      });
      const mockRepos = [
        createMockGitHubRepo({
          name: 'repo1',
          html_url: 'https://github.com/user/repo1',
        }),
        createMockGitHubRepo({
          name: 'repo2',
          html_url: 'https://github.com/user/repo2',
        }),
      ];

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockAxios.get
        .mockResolvedValueOnce(createMockAxiosResponse(mockRepos))
        .mockRejectedValueOnce(createMockAxiosError(404, 'Not Found')) // Profile.md for repo1
        .mockRejectedValueOnce(createMockAxiosError(404, 'Not Found')); // Profile.md for repo2

      jest.spyOn(service, 'queueSyncProject').mockResolvedValue(undefined);

      await service.syncAllReposForUser(userId);

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.github.com/user/repos?per_page=100&affiliation=owner',
        { headers: { Authorization: 'token encrypted-github-token' } },
      );
      expect(service.queueSyncProject).toHaveBeenCalledTimes(2);
      expect(cacheManager.del).toHaveBeenCalledWith(`projects:${userId}`);
    });

    it('should handle blacklisted repositories', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({
        id: userId,
        githubToken: 'encrypted-github-token',
      });
      const mockRepos = [
        createMockGitHubRepo({
          name: 'blacklisted-repo',
          html_url: 'https://github.com/user/blacklisted-repo',
        }),
      ];
      const profileMd = `---
blacklisted: true
---
This repo is blacklisted`;

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockAxios.get
        .mockResolvedValueOnce(createMockAxiosResponse(mockRepos))
        .mockResolvedValueOnce(createMockAxiosResponse(profileMd));

      prismaService.project.upsert.mockResolvedValue(createMockProject({ blacklisted: true }));

      await service.syncAllReposForUser(userId);

      expect(prismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            blacklisted: true,
          }),
          update: expect.objectContaining({
            blacklisted: true,
          }),
        }),
      );
    });

    it('should throw error if user has no GitHub token', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({ id: userId, githubToken: null });

      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.syncAllReposForUser(userId)).rejects.toThrow(
        'GitHub token not found for user',
      );
    });
  });

  describe('getEnhancedProjects', () => {
    it('should return enhanced projects with pagination', async () => {
      const userId = 'user-123';
      const mockProjects = [createMockProject(), createMockProject()];
      const totalCount = 10;

      prismaService.project.count.mockResolvedValue(totalCount);
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getEnhancedProjects(userId, {}, undefined, {
        offset: 0,
        limit: 2,
      });

      expect(result).toEqual({
        edges: [
          { node: mockProjects[0], cursor: expect.any(String) },
          { node: mockProjects[1], cursor: expect.any(String) },
        ],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: expect.any(String),
          endCursor: expect.any(String),
        },
        totalCount,
      });
    });

    it('should apply complex filters', async () => {
      const userId = 'user-123';
      const filter = {
        search: 'test',
        categories: ['web'],
        languages: ['TypeScript'],
        featured: true,
        starCount: { min: 5, max: 100 },
      };

      prismaService.project.count.mockResolvedValue(0);
      prismaService.project.findMany.mockResolvedValue([]);

      await service.getEnhancedProjects(userId, filter);

      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          ownerId: userId,
          OR: expect.any(Array),
          category: { in: ['web'] },
          language: { in: ['TypeScript'] },
          featured: true,
          starCount: { gte: 5, lte: 100 },
        }),
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
        include: { aiAnalysis: true },
      });
    });
  });

  describe('searchProjects', () => {
    it('should perform full-text search', async () => {
      const userId = 'user-123';
      const query = 'test project';
      const mockProjects = [createMockProject()];

      prismaService.$queryRawUnsafe.mockResolvedValue(mockProjects);

      const result = await service.searchProjects(userId, query);

      expect(result).toEqual(mockProjects);
      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        query,
        userId,
        20,
        0,
      );
    });

    it('should fallback to simple search if full-text search fails', async () => {
      const userId = 'user-123';
      const query = 'test project';
      const mockProjects = [createMockProject()];

      prismaService.$queryRawUnsafe.mockRejectedValue(new Error('Full-text search failed'));
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.searchProjects(userId, query);

      expect(result).toEqual(mockProjects);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Full-text search failed'));
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { tags: { hasSome: ['test', 'project'] } },
          ],
        }),
        orderBy: [{ featured: 'desc' }, { starCount: 'desc' }, { updatedAt: 'desc' }],
        skip: 0,
        take: 20,
        include: { aiAnalysis: true },
      });
    });

    it('should return filtered projects for empty query', async () => {
      const userId = 'user-123';
      const query = '';
      const mockProjects = [createMockProject()];

      jest.spyOn(service, 'getEnhancedProjects').mockResolvedValue({
        edges: [{ node: mockProjects[0], cursor: 'cursor' }],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 1,
      });

      const result = await service.searchProjects(userId, query);

      expect(result).toEqual(mockProjects);
      expect(service.getEnhancedProjects).toHaveBeenCalledWith(userId, {}, undefined, {
        offset: 0,
        limit: 20,
      });
    });
  });

  describe('getProjectStatistics', () => {
    it('should return project statistics', async () => {
      const userId = 'user-123';
      const mockAggregates = {
        _sum: { starCount: 100, forkCount: 20 },
      };
      const mockLanguageStats = [
        {
          language: 'TypeScript',
          _count: { language: 5 },
          _sum: { starCount: 50, forkCount: 10 },
        },
        {
          language: 'JavaScript',
          _count: { language: 3 },
          _sum: { starCount: 30, forkCount: 5 },
        },
      ];
      const mockCategoryStats = [
        { category: 'web', _count: { category: 4 } },
        { category: 'api', _count: { category: 2 } },
      ];
      const mockPlatformStats = [{ platform: 'github', count: BigInt(8) }];

      prismaService.project.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // public
        .mockResolvedValueOnce(2) // private
        .mockResolvedValueOnce(3); // featured

      prismaService.project.aggregate.mockResolvedValue(mockAggregates);
      prismaService.project.groupBy
        .mockResolvedValueOnce(mockLanguageStats)
        .mockResolvedValueOnce(mockCategoryStats);
      prismaService.$queryRaw.mockResolvedValue(mockPlatformStats);

      const result = await service.getProjectStatistics(userId);

      expect(result).toEqual({
        totalProjects: 10,
        publicProjects: 8,
        privateProjects: 2,
        featuredProjects: 3,
        totalStars: 100,
        totalForks: 20,
        languageStats: [
          { language: 'TypeScript', count: 5, percentage: 50 },
          { language: 'JavaScript', count: 3, percentage: 30 },
        ],
        categoryStats: [
          { category: 'web', count: 4, percentage: 40 },
          { category: 'api', count: 2, percentage: 20 },
        ],
        platformStats: [{ platform: 'github', count: 8, percentage: 80 }],
      });
    });
  });

  describe('getTrendingProjects', () => {
    it('should return trending projects', async () => {
      const mockProjects = [createMockProject()];

      prismaService.$queryRawUnsafe.mockResolvedValue(mockProjects);

      const result = await service.getTrendingProjects('7d', 10);

      expect(result).toEqual(mockProjects);
      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('trending_score'),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        10,
      );
    });

    it('should fallback to simple sorting if trending query fails', async () => {
      const mockProjects = [createMockProject()];

      prismaService.$queryRawUnsafe.mockRejectedValue(new Error('Query failed'));
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getTrendingProjects('7d', 10);

      expect(result).toEqual(mockProjects);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Trending projects query failed'),
      );
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          published: true,
          archived: false,
        }),
        orderBy: [
          { featured: 'desc' },
          { starCount: 'desc' },
          { forkCount: 'desc' },
          { lastCommitAt: 'desc' },
        ],
        take: 10,
        include: { aiAnalysis: true },
      });
    });
  });

  describe('getFeaturedProjects', () => {
    it('should return featured projects', async () => {
      const mockProjects = [createMockProject({ featured: true })];
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getFeaturedProjects(5);

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalledWith({
        where: {
          published: true,
          featured: true,
        },
        orderBy: { starCount: 'desc' },
        take: 5,
      });
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      prismaService.project.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getAllProjectsForUser('user-123')).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle cache errors gracefully', async () => {
      const mockProjects = [createMockProject()];
      cacheManager.get.mockRejectedValue(new Error('Cache error'));
      prismaService.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.getAllProjectsForUser('user-123');

      expect(result).toEqual(mockProjects);
      expect(prismaService.project.findMany).toHaveBeenCalled();
    });
  });
});
