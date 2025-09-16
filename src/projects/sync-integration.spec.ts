import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { SyncQueueService } from './sync-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParserService } from '../parser/parser.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Project Sync Integration Tests', () => {
  let projectsService: ProjectsService;
  let syncQueueService: SyncQueueService;
  let prismaService: jest.Mocked<PrismaService>;
  let cacheManager: jest.Mocked<any>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    githubToken: 'encrypted-token',
  };

  const mockGitHubRepo = {
    id: 12345,
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    description: 'Test repository',
    html_url: 'https://github.com/testuser/test-repo',
    private: false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 10,
    forks_count: 2,
    open_issues_count: 1,
    has_wiki: true,
    has_pages: false,
    archived: false,
    disabled: false,
    pushed_at: '2023-01-01T00:00:00Z',
    topics: ['test', 'example'],
    license: { name: 'MIT' },
    size: 1024,
  };

  const mockPortfolioMd = `---
title: Test Project
description: A test project for integration testing
tags: [test, integration]
featured: true
published: true
category: testing
---

# Test Project

This is a test project for integration testing.
`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        SyncQueueService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
              count: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: ParserService,
          useValue: {
            parseMarkdown: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config = {
                GITHUB_API_BASE: 'https://api.github.com/repos',
                GITHUB_MD_URL: 'https://raw.githubusercontent.com',
                REDIS_URL: 'redis://localhost:6379',
                TOKEN_ENCRYPTION_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    projectsService = module.get<ProjectsService>(ProjectsService);
    syncQueueService = module.get<SyncQueueService>(SyncQueueService);
    prismaService = module.get(PrismaService);
    cacheManager = module.get(CACHE_MANAGER);

    // Setup default mocks
    jest.clearAllMocks();
  });

  describe('Successful Sync Scenarios', () => {
    it('should successfully sync a repository with Portfolio.md', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo }) // GitHub API call
        .mockResolvedValueOnce({ data: mockPortfolioMd }); // Portfolio.md call

      const mockParseResult = {
        valid: true,
        data: {
          title: 'Test Project',
          description: 'A test project for integration testing',
          tags: ['test', 'integration'],
          featured: true,
          published: true,
          category: 'testing',
          body: '# Test Project\n\nThis is a test project for integration testing.',
        },
        errors: [],
      };

      const mockProject = {
        id: 'project-1',
        ownerId: 'user-1',
        title: 'Test Project',
        repoUrl: 'https://github.com/testuser/test-repo',
        valid: true,
        syncedAt: new Date(),
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);
      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(mockProject),
          },
        });
      });

      // Execute sync
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Assertions
      expect(result).toEqual(mockProject);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/test-repo',
        expect.objectContaining({
          timeout: 30000,
          headers: expect.objectContaining({
            'User-Agent': 'GitSink-API/1.0',
          }),
        }),
      );
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should successfully sync a repository without Portfolio.md', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo }) // GitHub API call
        .mockRejectedValueOnce({
          // Portfolio.md 404
          response: { status: 404 },
          isAxiosError: true,
        });

      const mockProject = {
        id: 'project-2',
        ownerId: 'user-1',
        title: 'test-repo', // Uses repo name as title
        repoUrl: 'https://github.com/testuser/test-repo',
        valid: true,
        syncedAt: new Date(),
      };

      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(mockProject),
          },
        });
      });

      // Execute sync
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Assertions
      expect(result).toEqual(mockProject);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle GitHub API 404 error', async () => {
      // Setup mocks
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 404 },
        isAxiosError: true,
      });

      // Execute and expect error
      await expect(
        projectsService.syncProjectFromGitHub(
          'user-1',
          'https://github.com/testuser/nonexistent-repo',
          'main',
        ),
      ).rejects.toThrow('Repository not found');
    });

    it('should handle GitHub API 403 error', async () => {
      // Setup mocks
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 403 },
        isAxiosError: true,
      });

      // Execute and expect error
      await expect(
        projectsService.syncProjectFromGitHub(
          'user-1',
          'https://github.com/testuser/private-repo',
          'main',
        ),
      ).rejects.toThrow('Access denied to repository');
    });

    it('should handle GitHub API timeout', async () => {
      // Setup mocks
      mockedAxios.get.mockRejectedValueOnce({
        code: 'ECONNABORTED',
        isAxiosError: true,
      });

      // Execute and expect error
      await expect(
        projectsService.syncProjectFromGitHub(
          'user-1',
          'https://github.com/testuser/test-repo',
          'main',
        ),
      ).rejects.toThrow('GitHub API request timeout');
    });

    it('should handle Portfolio.md parsing errors', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo }) // GitHub API call
        .mockResolvedValueOnce({ data: 'invalid markdown content' }); // Invalid Portfolio.md

      const mockParseResult = {
        valid: false,
        data: null,
        errors: ['Invalid frontmatter format'],
      };

      const mockProject = {
        id: 'project-3',
        ownerId: 'user-1',
        title: 'test-repo',
        repoUrl: 'https://github.com/testuser/test-repo',
        valid: false,
        validationErrors: ['Invalid frontmatter format'],
        syncedAt: new Date(),
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);
      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(mockProject),
          },
        });
      });

      // Execute sync
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Assertions
      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('Invalid frontmatter format');
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent concurrent syncs of the same repository', async () => {
      // Setup mocks
      const existingProject = {
        id: 'project-1',
        syncedAt: new Date(Date.now() - 10000), // 10 seconds ago
      };

      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(existingProject),
          },
        });
      });

      // Execute sync
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Should return existing project without making API calls
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(result).toEqual(existingProject);
    });

    it('should allow sync if enough time has passed since last sync', async () => {
      // Setup mocks
      const existingProject = {
        id: 'project-1',
        syncedAt: new Date(Date.now() - 60000), // 1 minute ago
      };

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: mockPortfolioMd });

      const mockParseResult = {
        valid: true,
        data: {
          title: 'Test Project',
          description: 'Updated description',
        },
        errors: [],
      };

      const updatedProject = {
        ...existingProject,
        description: 'Updated description',
        syncedAt: new Date(),
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);
      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(existingProject),
            upsert: jest.fn().mockResolvedValue(updatedProject),
          },
        });
      });

      // Execute sync
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Should perform sync since enough time has passed
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result.description).toBe('Updated description');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate relevant caches after successful sync', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: mockPortfolioMd });

      const mockParseResult = {
        valid: true,
        data: { title: 'Test Project' },
        errors: [],
      };

      const mockProject = {
        id: 'project-1',
        ownerId: 'user-1',
        title: 'Test Project',
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);
      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(mockProject),
          },
        });
      });

      // Execute sync
      await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Verify cache operations
      expect(cacheManager.del).toHaveBeenCalledWith(
        'user:user-1:repo:https://github.com/testuser/test-repo',
      );
      expect(cacheManager.del).toHaveBeenCalledWith('user:user-1:projects');
      expect(cacheManager.del).toHaveBeenCalledWith('projects:user-1');
      expect(cacheManager.set).toHaveBeenCalledWith(
        'user:user-1:repo:https://github.com/testuser/test-repo',
        mockProject,
      );
    });

    it('should not fail sync if cache operations fail', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: mockPortfolioMd });

      const mockParseResult = {
        valid: true,
        data: { title: 'Test Project' },
        errors: [],
      };

      const mockProject = {
        id: 'project-1',
        ownerId: 'user-1',
        title: 'Test Project',
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);
      prismaService.$transaction.mockImplementation(async callback => {
        return callback({
          project: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue(mockProject),
          },
        });
      });

      // Make cache operations fail
      cacheManager.del.mockRejectedValue(new Error('Cache error'));
      cacheManager.set.mockRejectedValue(new Error('Cache error'));

      // Execute sync - should not throw error
      const result = await projectsService.syncProjectFromGitHub(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      expect(result).toEqual(mockProject);
    });
  });

  describe('Queue Integration', () => {
    it('should successfully queue sync jobs', async () => {
      // Mock queue operations
      const mockJob = { id: 'job-1', data: {} };
      jest.spyOn(syncQueueService, 'addJob').mockResolvedValue(mockJob as any);

      // Execute queue operation
      await projectsService.queueSyncProject(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );

      // Verify job was queued
      expect(syncQueueService.addJob).toHaveBeenCalledWith(
        'user-1',
        'https://github.com/testuser/test-repo',
        'main',
      );
    });

    it('should handle queue failures gracefully', async () => {
      // Mock queue failure
      jest.spyOn(syncQueueService, 'addJob').mockRejectedValue(new Error('Queue error'));

      // Execute and expect error
      await expect(
        projectsService.queueSyncProject('user-1', 'https://github.com/testuser/test-repo', 'main'),
      ).rejects.toThrow('Queue error');
    });
  });

  describe('Database Transaction Handling', () => {
    it('should rollback transaction on database errors', async () => {
      // Setup mocks
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: mockPortfolioMd });

      const mockParseResult = {
        valid: true,
        data: { title: 'Test Project' },
        errors: [],
      };

      (projectsService as any).parser.parseMarkdown.mockReturnValue(mockParseResult);

      // Mock transaction failure
      prismaService.$transaction.mockRejectedValue(new Error('Database error'));

      // Execute and expect error
      await expect(
        projectsService.syncProjectFromGitHub(
          'user-1',
          'https://github.com/testuser/test-repo',
          'main',
        ),
      ).rejects.toThrow('Failed to sync project from GitHub');
    });
  });
});
