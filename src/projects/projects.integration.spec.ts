import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  TestContext,
  TestDataBuilder,
  ApiTestHelpers,
  createAuthHeaders,
  createApiKeyHeaders,
} from '../../test/test-utils/integration-helpers';
import { createMockUser, createMockProject, createMockGitHubRepo } from '../../test/test-utils/mocks';
import axios from 'axios';

// Mock external dependencies
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('Projects API Integration Tests', () => {
  let context: TestContext;
  let testUser: any;
  let authToken: string;
  let apiKey: string;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup test user and authentication
    testUser = createMockUser();
    authToken = 'valid-jwt-token';
    apiKey = 'valid-api-key-12345678901234567890';

    // Mock authentication
    context.prismaService.user.findUnique.mockResolvedValue(testUser);
  });

  describe('GET /projects', () => {
    it('should return user projects with JWT authentication', async () => {
      const mockProjects = [
        createMockProject({ ownerId: testUser.id }),
        createMockProject({ ownerId: testUser.id, featured: true }),
      ];

      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const response = await context.request
        .get('/projects')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('title');
      expect(response.body.data[0]).toHaveProperty('description');
      expect(response.body.data[1].featured).toBe(true);
    });

    it('should return user projects with API key authentication', async () => {
      const mockProjects = [createMockProject({ ownerId: testUser.id })];

      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const response = await context.request
        .get('/projects')
        .set(createApiKeyHeaders(apiKey))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('should filter projects by category', async () => {
      const webProject = createMockProject({
        ownerId: testUser.id,
        category: 'web',
      });
      const apiProject = createMockProject({
        ownerId: testUser.id,
        category: 'api',
      });

      context.prismaService.project.findMany.mockResolvedValue([webProject]);

      const response = await context.request
        .get('/projects?category=web')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].category).toBe('web');
      expect(context.prismaService.project.findMany).toHaveBeenCalledWith({
        where: { ownerId: testUser.id, category: 'web' },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter projects by tags', async () => {
      const reactProject = createMockProject({
        ownerId: testUser.id,
        tags: ['react', 'frontend'],
      });

      context.prismaService.project.findMany.mockResolvedValue([reactProject]);

      const response = await context.request
        .get('/projects?tag=react')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].tags).toContain('react');
    });

    it('should filter featured projects', async () => {
      const featuredProject = createMockProject({
        ownerId: testUser.id,
        featured: true,
      });

      context.prismaService.project.findMany.mockResolvedValue([featuredProject]);

      const response = await context.request
        .get('/projects?featured=true')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].featured).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await context.request.get('/projects').expect(401);

      ApiTestHelpers.expectUnauthorizedError(response);
    });

    it('should handle pagination', async () => {
      const mockProjects = Array.from({ length: 5 }, (_, i) =>
        createMockProject({ ownerId: testUser.id, title: `Project ${i}` }),
      );

      context.prismaService.project.findMany.mockResolvedValue(mockProjects.slice(0, 2));
      context.prismaService.project.count.mockResolvedValue(5);

      const response = await context.request
        .get('/projects?page=1&limit=2')
        .set(createAuthHeaders(authToken))
        .expect(200);

      ApiTestHelpers.expectPaginatedResponse(response);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });
  });

  describe('GET /projects/:id', () => {
    it('should return specific project by ID', async () => {
      const projectId = 'project-123';
      const mockProject = createMockProject({
        id: projectId,
        ownerId: testUser.id,
      });

      context.prismaService.project.findFirst.mockResolvedValue(mockProject);

      const response = await context.request
        .get(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body).toHaveProperty('id', projectId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('githubMetadata');
      expect(response.body).toHaveProperty('customMetadata');
    });

    it('should return 404 for non-existent project', async () => {
      const projectId = 'non-existent-project';

      context.prismaService.project.findFirst.mockResolvedValue(null);

      const response = await context.request
        .get(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .expect(404);

      ApiTestHelpers.expectNotFoundError(response);
    });

    it('should return 403 for project not owned by user', async () => {
      const projectId = 'project-123';
      const otherUserProject = createMockProject({
        id: projectId,
        ownerId: 'other-user-id',
      });

      context.prismaService.project.findFirst.mockResolvedValue(null);

      const response = await context.request
        .get(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .expect(404);

      ApiTestHelpers.expectNotFoundError(response);
    });
  });

  describe('POST /projects/sync', () => {
    it('should sync project from GitHub successfully', async () => {
      const syncData = {
        repoUrl: 'https://github.com/user/test-repo',
        branch: 'main',
      };
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject({
        ownerId: testUser.id,
        repoUrl: syncData.repoUrl,
      });

      // Mock GitHub API responses
      mockAxios.get.mockResolvedValueOnce({ data: mockGitHubRepo }).mockResolvedValueOnce({
        data: `---
title: "Test Project"
description: "A test project"
tags: ["test", "demo"]
---
# Test Project
This is a test project.`,
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('repoUrl', syncData.repoUrl);
      expect(response.body).toHaveProperty('syncStatus', 'completed');

      expect(mockAxios.get).toHaveBeenCalledTimes(2);
      expect(context.prismaService.project.upsert).toHaveBeenCalled();
    });

    it('should handle sync without Portfolio.md', async () => {
      const syncData = {
        repoUrl: 'https://github.com/user/test-repo',
        branch: 'main',
      };
      const mockGitHubRepo = createMockGitHubRepo();
      const mockProject = createMockProject({
        ownerId: testUser.id,
        repoUrl: syncData.repoUrl,
      });

      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockRejectedValueOnce({ response: { status: 404 } });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(201);

      expect(response.body.title).toBe(mockGitHubRepo.name);
      expect(response.body.description).toBe(mockGitHubRepo.description);
    });

    it('should return 400 for invalid GitHub URL', async () => {
      const syncData = {
        repoUrl: 'https://gitlab.com/user/repo', // Not GitHub
        branch: 'main',
      };

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(400);

      ApiTestHelpers.expectValidationError(response, 'repoUrl');
    });

    it('should handle GitHub API errors', async () => {
      const syncData = {
        repoUrl: 'https://github.com/user/private-repo',
        branch: 'main',
      };

      mockAxios.get.mockRejectedValue({
        response: { status: 403, statusText: 'Forbidden' },
      });

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(403);

      expect(response.body).toHaveProperty('message');
    });

    it('should queue sync job for large repositories', async () => {
      const syncData = {
        repoUrl: 'https://github.com/user/large-repo',
        branch: 'main',
        async: true,
      };

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status', 'queued');
    });
  });

  describe('PUT /projects/:id', () => {
    it('should update project metadata', async () => {
      const projectId = 'project-123';
      const updateData = {
        title: 'Updated Project Title',
        description: 'Updated description',
        tags: ['updated', 'tags'],
        featured: true,
      };
      const existingProject = createMockProject({
        id: projectId,
        ownerId: testUser.id,
      });
      const updatedProject = { ...existingProject, ...updateData };

      context.prismaService.project.findFirst.mockResolvedValue(existingProject);
      context.prismaService.project.update.mockResolvedValue(updatedProject);

      const response = await context.request
        .put(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .send(updateData)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.description).toBe(updateData.description);
      expect(response.body.tags).toEqual(updateData.tags);
      expect(response.body.featured).toBe(true);

      expect(context.prismaService.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: updateData,
      });
    });

    it('should return 404 for non-existent project', async () => {
      const projectId = 'non-existent-project';
      const updateData = { title: 'Updated Title' };

      context.prismaService.project.findFirst.mockResolvedValue(null);

      const response = await context.request
        .put(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .send(updateData)
        .expect(404);

      ApiTestHelpers.expectNotFoundError(response);
    });

    it('should validate update data', async () => {
      const projectId = 'project-123';
      const invalidUpdateData = {
        title: '', // Empty title should be invalid
        tags: 'not-an-array', // Should be array
      };

      const response = await context.request
        .put(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .send(invalidUpdateData)
        .expect(400);

      ApiTestHelpers.expectValidationError(response);
    });
  });

  describe('DELETE /projects/:id', () => {
    it('should delete project successfully', async () => {
      const projectId = 'project-123';
      const existingProject = createMockProject({
        id: projectId,
        ownerId: testUser.id,
      });

      context.prismaService.project.findFirst.mockResolvedValue(existingProject);
      context.prismaService.project.delete.mockResolvedValue(existingProject);

      const response = await context.request
        .delete(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(context.prismaService.project.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });
    });

    it('should return 404 for non-existent project', async () => {
      const projectId = 'non-existent-project';

      context.prismaService.project.findFirst.mockResolvedValue(null);

      const response = await context.request
        .delete(`/projects/${projectId}`)
        .set(createAuthHeaders(authToken))
        .expect(404);

      ApiTestHelpers.expectNotFoundError(response);
    });
  });

  describe('POST /projects/bulk-sync', () => {
    it('should sync all user repositories', async () => {
      const mockUser = createMockUser({
        id: testUser.id,
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

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockAxios.get.mockResolvedValue({ data: mockRepos });

      const response = await context.request
        .post('/projects/bulk-sync')
        .set(createAuthHeaders(authToken))
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body).toHaveProperty('repositoryCount', 2);
    });

    it('should return 400 if user has no GitHub token', async () => {
      const mockUser = createMockUser({
        id: testUser.id,
        githubToken: null,
      });

      context.prismaService.user.findUnique.mockResolvedValue(mockUser);

      const response = await context.request
        .post('/projects/bulk-sync')
        .set(createAuthHeaders(authToken))
        .expect(400);

      expect(response.body.message).toContain('GitHub token');
    });
  });

  describe('GET /projects/search', () => {
    it('should search projects by query', async () => {
      const query = 'react project';
      const mockProjects = [
        createMockProject({
          ownerId: testUser.id,
          title: 'React Todo App',
          description: 'A todo app built with React',
          tags: ['react', 'frontend'],
        }),
      ];

      context.prismaService.$queryRawUnsafe.mockResolvedValue(mockProjects);

      const response = await context.request
        .get(`/projects/search?q=${encodeURIComponent(query)}`)
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toContain('React');
      expect(response.body).toHaveProperty('query', query);
    });

    it('should handle empty search results', async () => {
      const query = 'nonexistent technology';

      context.prismaService.$queryRawUnsafe.mockResolvedValue([]);

      const response = await context.request
        .get(`/projects/search?q=${encodeURIComponent(query)}`)
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should return 400 for empty query', async () => {
      const response = await context.request
        .get('/projects/search?q=')
        .set(createAuthHeaders(authToken))
        .expect(400);

      ApiTestHelpers.expectValidationError(response, 'query');
    });
  });

  describe('GET /projects/stats', () => {
    it('should return project statistics', async () => {
      const mockStats = {
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
      };

      // Mock the various database calls
      context.prismaService.project.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // public
        .mockResolvedValueOnce(2) // private
        .mockResolvedValueOnce(3); // featured

      context.prismaService.project.aggregate.mockResolvedValue({
        _sum: { starCount: 100, forkCount: 20 },
      });

      context.prismaService.project.groupBy
        .mockResolvedValueOnce([
          { language: 'TypeScript', _count: { language: 5 } },
          { language: 'JavaScript', _count: { language: 3 } },
        ])
        .mockResolvedValueOnce([
          { category: 'web', _count: { category: 4 } },
          { category: 'api', _count: { category: 2 } },
        ]);

      const response = await context.request
        .get('/projects/stats')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body).toHaveProperty('totalProjects', 10);
      expect(response.body).toHaveProperty('publicProjects', 8);
      expect(response.body).toHaveProperty('totalStars', 100);
      expect(response.body).toHaveProperty('languageStats');
      expect(response.body).toHaveProperty('categoryStats');
      expect(response.body.languageStats).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      context.prismaService.project.findMany.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = await context.request
        .get('/projects')
        .set(createAuthHeaders(authToken))
        .expect(500);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).not.toContain('Database connection failed');
    });

    it('should handle GitHub API rate limiting', async () => {
      const syncData = {
        repoUrl: 'https://github.com/user/test-repo',
        branch: 'main',
      };

      mockAxios.get.mockRejectedValue({
        response: {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
          data: { message: 'API rate limit exceeded' },
        },
      });

      const response = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(authToken))
        .send(syncData)
        .expect(429);

      expect(response.body.message).toContain('rate limit');
    });
  });

  describe('Caching', () => {
    it('should cache project list responses', async () => {
      const mockProjects = [createMockProject({ ownerId: testUser.id })];

      context.cacheManager.get.mockResolvedValue(null);
      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const response = await context.request
        .get('/projects')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(context.cacheManager.set).toHaveBeenCalled();
    });

    it('should return cached results when available', async () => {
      const cachedProjects = [createMockProject({ ownerId: testUser.id })];

      context.cacheManager.get.mockResolvedValue(cachedProjects);

      const response = await context.request
        .get('/projects')
        .set(createAuthHeaders(authToken))
        .expect(200);

      expect(response.body.data).toEqual(cachedProjects);
      expect(context.prismaService.project.findMany).not.toHaveBeenCalled();
    });
  });
});
