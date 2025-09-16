/**
 * Integration test helpers and utilities
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import request from 'supertest';
import {
  createMockPrismaService,
  createMockConfigService,
  createMockCacheManager,
  createMockLogger,
  createMockUser,
  createMockProject,
} from './mocks';

export interface TestContext {
  app: INestApplication;
  prismaService: ReturnType<typeof createMockPrismaService>;
  configService: ReturnType<typeof createMockConfigService>;
  cacheManager: ReturnType<typeof createMockCacheManager>;
  request: request.SuperTest<request.Test>;
}

export async function createTestApp(): Promise<TestContext> {
  const prismaService = createMockPrismaService();
  const configService = createMockConfigService();
  const cacheManager = createMockCacheManager();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('PrismaService')
    .useValue(prismaService)
    .overrideProvider('ConfigService')
    .useValue(configService)
    .overrideProvider('CACHE_MANAGER')
    .useValue(cacheManager)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  return {
    app,
    prismaService,
    configService,
    cacheManager,
    request: request(app.getHttpServer()),
  };
}

export async function closeTestApp(context: TestContext): Promise<void> {
  await context.app.close();
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function createApiKeyHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

export class TestDataBuilder {
  static user(overrides: Partial<any> = {}) {
    return createMockUser(overrides);
  }

  static project(overrides: Partial<any> = {}) {
    return createMockProject(overrides);
  }

  static validSignupData() {
    return {
      email: 'test@example.com',
      password: 'StrongPass123!',
      username: 'testuser',
    };
  }

  static validSigninData() {
    return {
      email: 'test@example.com',
      password: 'StrongPass123!',
    };
  }

  static validProjectData() {
    return {
      repoUrl: 'https://github.com/user/test-repo',
      branch: 'main',
    };
  }

  static validProfileData() {
    return {
      username: 'testuser',
      displayName: 'Test User',
      bio: 'A test user profile',
      isPublic: true,
    };
  }

  static graphqlQuery(query: string, variables?: any) {
    return {
      query,
      variables,
    };
  }
}

export class ApiTestHelpers {
  static async authenticateUser(context: TestContext, userData?: any): Promise<string> {
    const user = userData || TestDataBuilder.user();
    const signupData = TestDataBuilder.validSignupData();

    context.prismaService.user.findUnique.mockResolvedValue(null);
    context.prismaService.user.create.mockResolvedValue(user);

    const response = await context.request.post('/auth/signup').send(signupData).expect(201);

    return response.body.accessToken;
  }

  static async createTestProject(
    context: TestContext,
    userId: string,
    projectData?: any,
  ): Promise<any> {
    const project = projectData || TestDataBuilder.project({ ownerId: userId });

    context.prismaService.project.create.mockResolvedValue(project);

    return project;
  }

  static expectValidationError(response: request.Response, field?: string) {
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
    if (field) {
      expect(response.body.message).toContain(field);
    }
  }

  static expectUnauthorizedError(response: request.Response) {
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('message');
  }

  static expectForbiddenError(response: request.Response) {
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('message');
  }

  static expectNotFoundError(response: request.Response) {
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message');
  }

  static expectRateLimitError(response: request.Response) {
    expect(response.status).toBe(429);
    expect(response.body).toHaveProperty('message');
  }

  static expectSuccessResponse(response: request.Response, expectedStatus: number = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toBeDefined();
  }

  static expectPaginatedResponse(response: request.Response) {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
  }
}

export class GraphQLTestHelpers {
  static async executeQuery(
    context: TestContext,
    query: string,
    variables?: any,
    headers?: Record<string, string>,
  ): Promise<request.Response> {
    const requestBuilder = context.request.post('/graphql').send({ query, variables });

    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        requestBuilder.set(key, value);
      });
    }

    return requestBuilder;
  }

  static expectGraphQLSuccess(response: request.Response) {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).not.toHaveProperty('errors');
  }

  static expectGraphQLError(response: request.Response, errorMessage?: string) {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('errors');
    expect(Array.isArray(response.body.errors)).toBe(true);

    if (errorMessage) {
      const hasExpectedError = response.body.errors.some((error: any) =>
        error.message.includes(errorMessage),
      );
      expect(hasExpectedError).toBe(true);
    }
  }

  static queries = {
    GET_PROJECTS: `
      query GetProjects($filter: ProjectFilterInput, $pagination: PaginationInput) {
        projects(filter: $filter, pagination: $pagination) {
          edges {
            node {
              id
              title
              description
              tags
              featured
              published
              repoUrl
              createdAt
              updatedAt
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          totalCount
        }
      }
    `,

    GET_PROJECT: `
      query GetProject($id: ID!) {
        project(id: $id) {
          id
          title
          description
          tags
          featured
          published
          repoUrl
          markdown
          githubMetadata
          customMetadata
          createdAt
          updatedAt
        }
      }
    `,

    SEARCH_PROJECTS: `
      query SearchProjects($query: String!, $filter: SearchFilterInput) {
        searchProjects(query: $query, filter: $filter) {
          id
          title
          description
          tags
          featured
          published
          repoUrl
          relevanceScore
        }
      }
    `,

    GET_PUBLIC_PROFILE: `
      query GetPublicProfile($username: String!) {
        publicProfile(username: $username) {
          id
          username
          displayName
          bio
          avatar
          location
          website
          socialLinks {
            platform
            url
            username
          }
          projects {
            id
            title
            description
            tags
            featured
            starCount
            forkCount
          }
          stats {
            totalProjects
            totalStars
            totalForks
            languageStats {
              language
              count
              percentage
            }
          }
          theme {
            primaryColor
            backgroundColor
            textColor
          }
          isPublic
          viewCount
        }
      }
    `,
  };

  static mutations = {
    SYNC_PROJECT: `
      mutation SyncProject($input: SyncProjectInput!) {
        syncProject(input: $input) {
          id
          title
          description
          tags
          featured
          published
          repoUrl
          syncStatus
          lastSyncAt
        }
      }
    `,

    UPDATE_PROJECT_METADATA: `
      mutation UpdateProjectMetadata($projectId: ID!, $metadata: ProjectMetadataInput!) {
        updateProjectMetadata(projectId: $projectId, metadata: $metadata) {
          id
          title
          description
          tags
          featured
          published
          customMetadata
          updatedAt
        }
      }
    `,

    CREATE_PUBLIC_PROFILE: `
      mutation CreatePublicProfile($input: CreateProfileInput!) {
        createPublicProfile(input: $input) {
          id
          username
          displayName
          bio
          isPublic
          createdAt
        }
      }
    `,

    UPDATE_PROFILE_SETTINGS: `
      mutation UpdateProfileSettings($input: ProfileSettingsInput!) {
        updateProfileSettings(input: $input) {
          isPublic
          showEmail
          showStats
          showPrivateRepos
          featuredProjects
          customSections {
            title
            content
            order
          }
        }
      }
    `,

    TRIGGER_AI_ENRICHMENT: `
      mutation TriggerAIEnrichment($projectId: ID!) {
        triggerAIEnrichment(projectId: $projectId) {
          jobId
          status
          estimatedCompletion
        }
      }
    `,
  };

  static subscriptions = {
    PROJECT_SYNC_STATUS: `
      subscription ProjectSyncStatus($userId: ID!) {
        projectSyncStatus(userId: $userId) {
          projectId
          status
          progress
          message
          timestamp
        }
      }
    `,

    PROFILE_VIEWS: `
      subscription ProfileViews($profileId: ID!) {
        profileViews(profileId: $profileId) {
          viewerId
          timestamp
          location
          referrer
        }
      }
    `,

    SYSTEM_HEALTH: `
      subscription SystemHealth {
        systemHealth {
          status
          services {
            name
            status
            responseTime
            lastCheck
          }
          metrics {
            activeUsers
            queueSize
            memoryUsage
            cpuUsage
          }
          timestamp
        }
      }
    `,
  };
}

export class WebhookTestHelpers {
  static createGitHubWebhookPayload(eventType: string, repository: any, action?: string) {
    const basePayload = {
      action,
      repository,
      sender: {
        id: 12345,
        login: 'testuser',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        type: 'User',
      },
    };

    switch (eventType) {
      case 'push':
        return {
          ...basePayload,
          ref: 'refs/heads/main',
          commits: [
            {
              id: 'abc123',
              message: 'Update Portfolio.md',
              author: {
                name: 'Test User',
                email: 'test@example.com',
              },
              modified: ['Portfolio.md'],
            },
          ],
        };

      case 'repository':
        return {
          ...basePayload,
          action: action || 'created',
        };

      case 'star':
        return {
          ...basePayload,
          action: action || 'created',
          starred_at: new Date().toISOString(),
        };

      default:
        return basePayload;
    }
  }

  static createGitHubWebhookHeaders(payload: any, secret: string) {
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return {
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': 'test-delivery-id',
      'X-Hub-Signature-256': `sha256=${signature}`,
      'Content-Type': 'application/json',
    };
  }

  static expectWebhookSuccess(response: request.Response) {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('received', true);
  }

  static expectWebhookError(response: request.Response, expectedStatus: number) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('error');
  }
}
