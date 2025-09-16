import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsResolver } from './projects.resolver';
import { ProjectsService } from './projects.service';
import { PubSub } from 'graphql-subscriptions';
import { AuthService } from '../auth/auth.service';
import { ApiKeyService } from '../auth/api-key.service';
import { ConfigService } from '@nestjs/config';

describe('ProjectsResolver', () => {
  let resolver: ProjectsResolver;
  let projectsService: ProjectsService;
  let pubSub: PubSub;

  const mockProjectsService = {
    getAllProjectsForUser: jest.fn(),
    getFilteredProjectsForUser: jest.fn(),
    getProjectByRepoUrl: jest.fn(),
    queueSyncProject: jest.fn(),
    syncAllReposForUser: jest.fn(),
    getEnhancedProjects: jest.fn(),
    searchProjects: jest.fn(),
    getProjectStatistics: jest.fn(),
    getTrendingProjects: jest.fn(),
    getFeaturedProjects: jest.fn(),
  };

  const mockPubSub = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    asyncIterator: jest.fn(),
  };

  const mockAuthService = {
    validateApiKey: jest.fn(),
    validateUser: jest.fn(),
  };

  const mockApiKeyService = {
    validateApiKey: jest.fn(),
    findByKey: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsResolver,
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
        {
          provide: 'PUB_SUB',
          useValue: mockPubSub,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    resolver = module.get<ProjectsResolver>(ProjectsResolver);
    projectsService = module.get<ProjectsService>(ProjectsService);
    pubSub = module.get<PubSub>('PUB_SUB');
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('enhancedProjects', () => {
    it('should return enhanced projects with pagination', async () => {
      const mockResult = {
        edges: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 0,
      };

      mockProjectsService.getEnhancedProjects.mockResolvedValue(mockResult);

      const result = await resolver.enhancedProjects({ userId: 'test-user-id' }, {}, undefined, {
        offset: 0,
        limit: 20,
      });

      expect(result).toEqual(mockResult);
      expect(mockProjectsService.getEnhancedProjects).toHaveBeenCalledWith(
        'test-user-id',
        {},
        undefined,
        { offset: 0, limit: 20 },
      );
    });

    it('should throw error when user is not authenticated', async () => {
      await expect(
        resolver.enhancedProjects({}, {}, undefined, { offset: 0, limit: 20 }),
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('searchProjects', () => {
    it('should search projects with query and filters', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Test Project',
          description: 'A test project',
          tags: ['test'],
        },
      ];

      mockProjectsService.searchProjects.mockResolvedValue(mockProjects);

      const result = await resolver.searchProjects(
        'test query',
        { userId: 'test-user-id' },
        { tags: ['test'] },
        { offset: 0, limit: 20 },
      );

      expect(result).toEqual(mockProjects);
      expect(mockProjectsService.searchProjects).toHaveBeenCalledWith(
        'test-user-id',
        'test query',
        { tags: ['test'] },
        { offset: 0, limit: 20 },
      );
    });
  });

  describe('projectStatistics', () => {
    it('should return project statistics', async () => {
      const mockStats = {
        totalProjects: 10,
        publicProjects: 8,
        privateProjects: 2,
        featuredProjects: 3,
        totalStars: 150,
        totalForks: 25,
        languageStats: [],
        categoryStats: [],
        platformStats: [],
      };

      mockProjectsService.getProjectStatistics.mockResolvedValue(mockStats);

      const result = await resolver.projectStatistics({ userId: 'test-user-id' }, {});

      expect(result).toEqual(mockStats);
      expect(mockProjectsService.getProjectStatistics).toHaveBeenCalledWith('test-user-id', {});
    });
  });

  describe('syncStatusUpdates', () => {
    it('should return async iterator for sync status updates', () => {
      const mockIterator = Symbol('asyncIterator');
      mockPubSub.asyncIterator.mockReturnValue(mockIterator);

      const result = resolver.syncStatusUpdates({ userId: 'test-user-id' });

      expect(result).toBe(mockIterator);
      expect(mockPubSub.asyncIterator).toHaveBeenCalledWith('syncStatusUpdate');
    });

    it('should throw error when user is not authenticated', () => {
      expect(() => resolver.syncStatusUpdates({})).toThrow('Unauthorized');
    });
  });
});
