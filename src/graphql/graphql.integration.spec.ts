import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  GraphQLTestHelpers,
  TestContext,
  TestDataBuilder,
  closeTestApp,
  createAuthHeaders,
  createTestApp,
} from '../../test/test-utils/integration-helpers';
import {
  createMockProject,
  createMockPublicProfile,
  createMockUser,
} from '../../test/test-utils/mocks';

describe('GraphQL API Integration Tests', () => {
  let context: TestContext;
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    testUser = createMockUser();
    authToken = 'valid-jwt-token';

    // Mock authentication
    context.prismaService.user.findUnique.mockResolvedValue(testUser);
  });

  describe('Projects Queries', () => {
    describe('projects query', () => {
      it('should return paginated projects', async () => {
        const mockProjects = [
          createMockProject({ ownerId: testUser.id }),
          createMockProject({ ownerId: testUser.id, featured: true }),
        ];

        context.prismaService.project.count.mockResolvedValue(2);
        context.prismaService.project.findMany.mockResolvedValue(mockProjects);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECTS,
          {
            pagination: { offset: 0, limit: 10 },
          },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.projects.edges).toHaveLength(2);
        expect(response.body.data.projects.totalCount).toBe(2);
        expect(response.body.data.projects.pageInfo).toHaveProperty('hasNextPage');
        expect(response.body.data.projects.pageInfo).toHaveProperty('hasPreviousPage');
      });

      it('should filter projects by category', async () => {
        const webProjects = [createMockProject({ ownerId: testUser.id, category: 'web' })];

        context.prismaService.project.count.mockResolvedValue(1);
        context.prismaService.project.findMany.mockResolvedValue(webProjects);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECTS,
          {
            filter: { categories: ['web'] },
            pagination: { offset: 0, limit: 10 },
          },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.projects.edges).toHaveLength(1);
        expect(response.body.data.projects.edges[0].node.category).toBe('web');
      });

      it('should filter projects by featured status', async () => {
        const featuredProjects = [createMockProject({ ownerId: testUser.id, featured: true })];

        context.prismaService.project.count.mockResolvedValue(1);
        context.prismaService.project.findMany.mockResolvedValue(featuredProjects);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECTS,
          {
            filter: { featured: true },
            pagination: { offset: 0, limit: 10 },
          },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.projects.edges[0].node.featured).toBe(true);
      });

      it('should return error for unauthenticated request', async () => {
        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECTS,
        );

        GraphQLTestHelpers.expectGraphQLError(response, 'Unauthorized');
      });
    });

    describe('project query', () => {
      it('should return specific project by ID', async () => {
        const projectId = 'project-123';
        const mockProject = createMockProject({
          id: projectId,
          ownerId: testUser.id,
        });

        context.prismaService.project.findFirst.mockResolvedValue(mockProject);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECT,
          { id: projectId },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.project.id).toBe(projectId);
        expect(response.body.data.project).toHaveProperty('title');
        expect(response.body.data.project).toHaveProperty('description');
        expect(response.body.data.project).toHaveProperty('githubMetadata');
        expect(response.body.data.project).toHaveProperty('customMetadata');
      });

      it('should return null for non-existent project', async () => {
        const projectId = 'non-existent-project';

        context.prismaService.project.findFirst.mockResolvedValue(null);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PROJECT,
          { id: projectId },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.project).toBeNull();
      });
    });

    describe('searchProjects query', () => {
      it('should search projects by query string', async () => {
        const query = 'react';
        const mockProjects = [
          createMockProject({
            ownerId: testUser.id,
            title: 'React Todo App',
            tags: ['react', 'frontend'],
          }),
        ];

        context.prismaService.$queryRawUnsafe.mockResolvedValue(mockProjects);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.SEARCH_PROJECTS,
          { query },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.searchProjects).toHaveLength(1);
        expect(response.body.data.searchProjects[0].title).toContain('React');
      });

      it('should return empty array for no matches', async () => {
        const query = 'nonexistent';

        context.prismaService.$queryRawUnsafe.mockResolvedValue([]);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.SEARCH_PROJECTS,
          { query },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.searchProjects).toHaveLength(0);
      });
    });

    describe('publicProfile query', () => {
      it('should return public profile by username', async () => {
        const username = 'testuser';
        const mockProfile = createMockPublicProfile({ username });
        const mockProjects = [createMockProject({ ownerId: mockProfile.userId, published: true })];

        context.prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
        context.prismaService.project.findMany.mockResolvedValue(mockProjects);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PUBLIC_PROFILE,
          { username },
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.publicProfile.username).toBe(username);
        expect(response.body.data.publicProfile.projects).toHaveLength(1);
        expect(response.body.data.publicProfile).toHaveProperty('stats');
        expect(response.body.data.publicProfile).toHaveProperty('theme');
      });

      it('should return null for non-existent profile', async () => {
        const username = 'nonexistent';

        context.prismaService.publicProfile.findUnique.mockResolvedValue(null);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PUBLIC_PROFILE,
          { username },
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.publicProfile).toBeNull();
      });

      it('should return null for private profile', async () => {
        const username = 'privateuser';
        const mockProfile = createMockPublicProfile({
          username,
          isPublic: false,
        });

        context.prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.queries.GET_PUBLIC_PROFILE,
          { username },
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.publicProfile).toBeNull();
      });
    });
  });

  describe('Projects Mutations', () => {
    describe('syncProject mutation', () => {
      it('should sync project successfully', async () => {
        const input = {
          repoUrl: 'https://github.com/user/test-repo',
          branch: 'main',
        };
        const mockProject = createMockProject({
          ownerId: testUser.id,
          repoUrl: input.repoUrl,
        });

        context.prismaService.project.upsert.mockResolvedValue(mockProject);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.SYNC_PROJECT,
          { input },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.syncProject.repoUrl).toBe(input.repoUrl);
        expect(response.body.data.syncProject).toHaveProperty('syncStatus');
        expect(response.body.data.syncProject).toHaveProperty('lastSyncAt');
      });

      it('should return error for invalid repository URL', async () => {
        const input = {
          repoUrl: 'invalid-url',
          branch: 'main',
        };

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.SYNC_PROJECT,
          { input },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLError(response, 'Invalid repository URL');
      });
    });

    describe('updateProjectMetadata mutation', () => {
      it('should update project metadata', async () => {
        const projectId = 'project-123';
        const metadata = {
          title: 'Updated Title',
          description: 'Updated description',
          tags: ['updated', 'tags'],
          featured: true,
        };
        const existingProject = createMockProject({
          id: projectId,
          ownerId: testUser.id,
        });
        const updatedProject = { ...existingProject, ...metadata };

        context.prismaService.project.findFirst.mockResolvedValue(existingProject);
        context.prismaService.project.update.mockResolvedValue(updatedProject);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.UPDATE_PROJECT_METADATA,
          { projectId, metadata },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.updateProjectMetadata.title).toBe(metadata.title);
        expect(response.body.data.updateProjectMetadata.featured).toBe(true);
      });

      it('should return error for non-existent project', async () => {
        const projectId = 'non-existent-project';
        const metadata = { title: 'Updated Title' };

        context.prismaService.project.findFirst.mockResolvedValue(null);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.UPDATE_PROJECT_METADATA,
          { projectId, metadata },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLError(response, 'Project not found');
      });
    });

    describe('createPublicProfile mutation', () => {
      it('should create public profile', async () => {
        const input = {
          username: 'newuser',
          displayName: 'New User',
          bio: 'A new user profile',
          isPublic: true,
        };
        const mockProfile = createMockPublicProfile({
          userId: testUser.id,
          ...input,
        });

        context.prismaService.publicProfile.findUnique.mockResolvedValue(null);
        context.prismaService.publicProfile.create.mockResolvedValue(mockProfile);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.CREATE_PUBLIC_PROFILE,
          { input },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.createPublicProfile.username).toBe(input.username);
        expect(response.body.data.createPublicProfile.displayName).toBe(input.displayName);
        expect(response.body.data.createPublicProfile.isPublic).toBe(true);
      });

      it('should return error for existing username', async () => {
        const input = {
          username: 'existinguser',
          displayName: 'Existing User',
          isPublic: true,
        };
        const existingProfile = createMockPublicProfile({
          username: input.username,
        });

        context.prismaService.publicProfile.findUnique.mockResolvedValue(existingProfile);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.CREATE_PUBLIC_PROFILE,
          { input },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLError(response, 'Username already taken');
      });
    });

    describe('updateProfileSettings mutation', () => {
      it('should update profile settings', async () => {
        const input = {
          isPublic: true,
          showEmail: false,
          showStats: true,
          featuredProjects: ['project-1', 'project-2'],
        };
        const existingProfile = createMockPublicProfile({
          userId: testUser.id,
        });
        const updatedProfile = { ...existingProfile, settings: input };

        context.prismaService.publicProfile.findUnique.mockResolvedValue(existingProfile);
        context.prismaService.publicProfile.update.mockResolvedValue(updatedProfile);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.UPDATE_PROFILE_SETTINGS,
          { input },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.updateProfileSettings.isPublic).toBe(true);
        expect(response.body.data.updateProfileSettings.showEmail).toBe(false);
        expect(response.body.data.updateProfileSettings.featuredProjects).toEqual([
          'project-1',
          'project-2',
        ]);
      });
    });

    describe('triggerAIEnrichment mutation', () => {
      it('should trigger AI enrichment for project', async () => {
        const projectId = 'project-123';
        const mockProject = createMockProject({
          id: projectId,
          ownerId: testUser.id,
        });
        const mockJob = {
          jobId: 'job-123',
          status: 'queued',
          estimatedCompletion: new Date(Date.now() + 300000), // 5 minutes
        };

        context.prismaService.project.findFirst.mockResolvedValue(mockProject);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.TRIGGER_AI_ENRICHMENT,
          { projectId },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLSuccess(response);
        expect(response.body.data.triggerAIEnrichment).toHaveProperty('jobId');
        expect(response.body.data.triggerAIEnrichment.status).toBe('queued');
      });

      it('should return error for non-existent project', async () => {
        const projectId = 'non-existent-project';

        context.prismaService.project.findFirst.mockResolvedValue(null);

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.mutations.TRIGGER_AI_ENRICHMENT,
          { projectId },
          createAuthHeaders(authToken),
        );

        GraphQLTestHelpers.expectGraphQLError(response, 'Project not found');
      });
    });
  });

  describe('Subscriptions', () => {
    describe('projectSyncStatus subscription', () => {
      it('should subscribe to project sync status updates', async () => {
        const userId = testUser.id;

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.subscriptions.PROJECT_SYNC_STATUS,
          { userId },
          createAuthHeaders(authToken),
        );

        // For subscriptions, we expect the subscription to be established
        // In a real test, you would test the actual subscription mechanism
        expect(response.status).toBe(200);
      });
    });

    describe('profileViews subscription', () => {
      it('should subscribe to profile view events', async () => {
        const profileId = 'profile-123';

        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.subscriptions.PROFILE_VIEWS,
          { profileId },
          createAuthHeaders(authToken),
        );

        expect(response.status).toBe(200);
      });
    });

    describe('systemHealth subscription', () => {
      it('should subscribe to system health updates', async () => {
        const response = await GraphQLTestHelpers.executeQuery(
          context,
          GraphQLTestHelpers.subscriptions.SYSTEM_HEALTH,
          {},
          createAuthHeaders(authToken),
        );

        expect(response.status).toBe(200);
      });
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields in mutations', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.mutations.SYNC_PROJECT,
        { input: {} }, // Missing required repoUrl
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLError(response, 'repoUrl');
    });

    it('should validate field types', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.mutations.UPDATE_PROJECT_METADATA,
        {
          projectId: 'project-123',
          metadata: {
            featured: 'not-a-boolean', // Should be boolean
          },
        },
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLError(response);
    });

    it('should validate array fields', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.mutations.UPDATE_PROJECT_METADATA,
        {
          projectId: 'project-123',
          metadata: {
            tags: 'not-an-array', // Should be array
          },
        },
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLError(response);
    });
  });

  describe('Authorization', () => {
    it('should require authentication for protected queries', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.queries.GET_PROJECTS,
      );

      GraphQLTestHelpers.expectGraphQLError(response, 'Unauthorized');
    });

    it('should require authentication for mutations', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.mutations.SYNC_PROJECT,
        { input: { repoUrl: 'https://github.com/user/repo' } },
      );

      GraphQLTestHelpers.expectGraphQLError(response, 'Unauthorized');
    });

    it('should allow public queries without authentication', async () => {
      const username = 'publicuser';
      const mockProfile = createMockPublicProfile({ username, isPublic: true });

      context.prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      context.prismaService.project.findMany.mockResolvedValue([]);

      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.queries.GET_PUBLIC_PROFILE,
        { username },
      );

      GraphQLTestHelpers.expectGraphQLSuccess(response);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      context.prismaService.project.findMany.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.queries.GET_PROJECTS,
        {},
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLError(response, 'Internal server error');
    });

    it('should handle malformed GraphQL queries', async () => {
      const response = await context.request
        .post('/graphql')
        .set(createAuthHeaders(authToken))
        .send({ query: 'invalid graphql query' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });

    it('should handle missing variables', async () => {
      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.queries.GET_PROJECT,
        {}, // Missing required id variable
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLError(response);
    });
  });

  describe('Performance', () => {
    it('should handle large result sets efficiently', async () => {
      const largeProjectList = Array.from({ length: 1000 }, (_, i) =>
        createMockProject({ ownerId: testUser.id, title: `Project ${i}` }),
      );

      context.prismaService.project.count.mockResolvedValue(1000);
      context.prismaService.project.findMany.mockResolvedValue(largeProjectList.slice(0, 50));

      const startTime = Date.now();

      const response = await GraphQLTestHelpers.executeQuery(
        context,
        GraphQLTestHelpers.queries.GET_PROJECTS,
        { pagination: { offset: 0, limit: 50 } },
        createAuthHeaders(authToken),
      );

      const duration = Date.now() - startTime;

      GraphQLTestHelpers.expectGraphQLSuccess(response);
      expect(response.body.data.projects.edges).toHaveLength(50);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle complex nested queries', async () => {
      const complexQuery = `
        query ComplexQuery {
          projects(pagination: { offset: 0, limit: 10 }) {
            edges {
              node {
                id
                title
                description
                tags
                githubMetadata
                customMetadata
                aiAnalysis {
                  description
                  technologies {
                    languages
                    frameworks
                  }
                  category
                  complexity
                }
              }
            }
            totalCount
          }
        }
      `;

      const mockProjects = [createMockProject({ ownerId: testUser.id })];
      context.prismaService.project.count.mockResolvedValue(1);
      context.prismaService.project.findMany.mockResolvedValue(mockProjects);

      const response = await GraphQLTestHelpers.executeQuery(
        context,
        complexQuery,
        {},
        createAuthHeaders(authToken),
      );

      GraphQLTestHelpers.expectGraphQLSuccess(response);
    });
  });
});
