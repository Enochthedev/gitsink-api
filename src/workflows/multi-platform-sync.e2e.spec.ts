import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  TestContext,
  TestDataBuilder,
  closeTestApp,
  createAuthHeaders,
  createTestApp,
} from '../../test/test-utils/integration-helpers';
import {
  createMockGitHubRepo,
  createMockProject,
  createMockUser,
} from '../../test/test-utils/mocks';
import axios from 'axios';

// Mock external dependencies
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('Multi-Platform Repository Sync End-to-End Workflow', () => {
  let context: TestContext;
  let testUser: any;
  let accessToken: string;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    testUser = createMockUser({
      githubToken: 'encrypted-github-token',
      gitlabToken: 'encrypted-gitlab-token',
      bitbucketToken: 'encrypted-bitbucket-token',
    });
    accessToken = 'valid-jwt-token';

    context.prismaService.user.findUnique.mockResolvedValue(testUser);
  });

  describe('GitHub Repository Sync Workflow', () => {
    it('should complete full GitHub repository sync workflow', async () => {
      const repoUrl = 'https://github.com/testuser/awesome-project';
      const mockGitHubRepo = createMockGitHubRepo({
        name: 'awesome-project',
        html_url: repoUrl,
        description: 'An awesome project',
        language: 'TypeScript',
        stargazers_count: 42,
        forks_count: 7,
      });

      const portfolioMd = `---
title: "Awesome Project"
description: "A comprehensive project showcasing modern development practices"
tags: ["typescript", "nodejs", "api"]
category: "web"
featured: true
published: true
version: "2.1.0"
license: "MIT"
homepage: "https://awesome-project.dev"
technologyStack:
  languages: ["TypeScript", "JavaScript"]
  frameworks: ["NestJS", "React"]
  databases: ["PostgreSQL", "Redis"]
  tools: ["Docker", "Jest"]
socialLinks:
  - platform: "github"
    url: "https://github.com/testuser/awesome-project"
  - platform: "twitter"
    url: "https://twitter.com/awesomeproject"
---

# Awesome Project

This is a comprehensive project that demonstrates modern development practices.

## Features

- RESTful API with NestJS
- React frontend
- PostgreSQL database
- Redis caching
- Docker containerization
- Comprehensive testing

## Getting Started

\`\`\`bash
npm install
npm run start:dev
\`\`\``;

      // Step 1: Sync repository metadata from GitHub API
      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: portfolioMd });

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'Awesome Project',
        description: 'A comprehensive project showcasing modern development practices',
        repoUrl,
        tags: ['typescript', 'nodejs', 'api'],
        category: 'web',
        featured: true,
        published: true,
        language: 'TypeScript',
        starCount: 42,
        forkCount: 7,
        githubMetadata: mockGitHubRepo,
        customMetadata: {
          version: '2.1.0',
          license: 'MIT',
          homepage: 'https://awesome-project.dev',
          technologyStack: {
            languages: ['TypeScript', 'JavaScript'],
            frameworks: ['NestJS', 'React'],
            databases: ['PostgreSQL', 'Redis'],
            tools: ['Docker', 'Jest'],
          },
          socialLinks: [
            {
              platform: 'github',
              url: 'https://github.com/testuser/awesome-project',
            },
            { platform: 'twitter', url: 'https://twitter.com/awesomeproject' },
          ],
        },
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      // Step 2: Initiate sync
      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(201);

      expect(syncResponse.body.title).toBe('Awesome Project');
      expect(syncResponse.body.language).toBe('TypeScript');
      expect(syncResponse.body.starCount).toBe(42);
      expect(syncResponse.body.customMetadata.version).toBe('2.1.0');

      // Step 3: Verify project was enriched with AI analysis
      const mockAIAnalysis = {
        description: 'A well-structured TypeScript project with modern architecture',
        technologies: {
          languages: [{ name: 'TypeScript', percentage: 85 }],
          frameworks: ['NestJS', 'React'],
          databases: ['PostgreSQL', 'Redis'],
        },
        category: 'web',
        complexity: 'complex',
        suggestedTags: ['backend', 'frontend', 'fullstack'],
        keyFeatures: ['RESTful API', 'React UI', 'Database integration'],
        confidence: 0.92,
      };

      context.prismaService.aiAnalysis.create.mockResolvedValue({
        id: 'ai-analysis-123',
        projectId: mockProject.id,
        analysis: mockAIAnalysis,
        confidence: 0.92,
        model: 'gpt-4',
        createdAt: new Date(),
      });

      const enrichmentResponse = await context.request
        .post(`/projects/${mockProject.id}/enrich`)
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(enrichmentResponse.body.analysis.complexity).toBe('complex');
      expect(enrichmentResponse.body.analysis.confidence).toBe(0.92);

      // Step 4: Verify sync history was recorded
      const mockSyncHistory = {
        id: 'sync-123',
        userId: testUser.id,
        projectId: mockProject.id,
        operation: 'sync',
        platform: 'github',
        repositoryUrl: repoUrl,
        status: 'completed',
        changes: ['title', 'description', 'tags', 'customMetadata'],
        metadata: { branch: 'main', portfolioMdFound: true },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 2500,
      };

      context.prismaService.syncHistory.create.mockResolvedValue(mockSyncHistory);
      context.prismaService.syncHistory.findMany.mockResolvedValue([mockSyncHistory]);

      const historyResponse = await context.request
        .get('/sync/history')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(historyResponse.body.data).toHaveLength(1);
      expect(historyResponse.body.data[0].status).toBe('completed');
      expect(historyResponse.body.data[0].platform).toBe('github');
    });

    it('should handle GitHub repository without Portfolio.md', async () => {
      const repoUrl = 'https://github.com/testuser/simple-project';
      const mockGitHubRepo = createMockGitHubRepo({
        name: 'simple-project',
        html_url: repoUrl,
        description: 'A simple project without Portfolio.md',
        language: 'JavaScript',
      });

      // Step 1: GitHub API returns repo data, but Portfolio.md is not found
      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockRejectedValueOnce({ response: { status: 404 } });

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'simple-project', // Uses GitHub repo name
        description: 'A simple project without Portfolio.md', // Uses GitHub description
        repoUrl,
        tags: [], // No custom tags
        featured: false, // Default values
        published: false,
        language: 'JavaScript',
        githubMetadata: mockGitHubRepo,
        customMetadata: {},
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(201);

      expect(syncResponse.body.title).toBe('simple-project');
      expect(syncResponse.body.description).toBe('A simple project without Portfolio.md');
      expect(syncResponse.body.tags).toEqual([]);
      expect(syncResponse.body.featured).toBe(false);
    });

    it('should handle GitHub API rate limiting', async () => {
      const repoUrl = 'https://github.com/testuser/rate-limited-project';

      // Step 1: GitHub API returns rate limit error
      mockAxios.get.mockRejectedValue({
        response: {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          },
          data: {
            message: 'API rate limit exceeded',
            documentation_url:
              'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
          },
        },
      });

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(429);

      expect(syncResponse.body.message).toContain('rate limit');
      expect(syncResponse.body).toHaveProperty('retryAfter');
    });
  });

  describe('GitLab Repository Sync Workflow', () => {
    it('should complete GitLab repository sync workflow', async () => {
      const repoUrl = 'https://gitlab.com/testuser/gitlab-project';
      const mockGitLabRepo = {
        id: 12345,
        name: 'gitlab-project',
        path: 'gitlab-project',
        path_with_namespace: 'testuser/gitlab-project',
        description: 'A GitLab project',
        web_url: repoUrl,
        default_branch: 'main',
        star_count: 15,
        forks_count: 3,
        languages: { TypeScript: 70.5, JavaScript: 29.5 },
        created_at: '2023-01-01T00:00:00Z',
        last_activity_at: '2023-12-01T00:00:00Z',
      };

      const portfolioMd = `---
title: "GitLab Project"
description: "A project hosted on GitLab"
tags: ["gitlab", "typescript"]
category: "tool"
published: true
---

# GitLab Project

This project is hosted on GitLab.`;

      // Step 1: GitLab API calls
      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitLabRepo })
        .mockResolvedValueOnce({ data: portfolioMd });

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'GitLab Project',
        description: 'A project hosted on GitLab',
        repoUrl,
        tags: ['gitlab', 'typescript'],
        category: 'tool',
        published: true,
        platform: 'gitlab',
        starCount: 15,
        forkCount: 3,
        language: 'TypeScript',
        githubMetadata: {}, // Empty for GitLab
        customMetadata: {},
        gitlabMetadata: mockGitLabRepo,
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main', platform: 'gitlab' })
        .expect(201);

      expect(syncResponse.body.title).toBe('GitLab Project');
      expect(syncResponse.body.platform).toBe('gitlab');
      expect(syncResponse.body.starCount).toBe(15);
    });
  });

  describe('Bitbucket Repository Sync Workflow', () => {
    it('should complete Bitbucket repository sync workflow', async () => {
      const repoUrl = 'https://bitbucket.org/testuser/bitbucket-project';
      const mockBitbucketRepo = {
        uuid: '{12345678-1234-1234-1234-123456789012}',
        name: 'bitbucket-project',
        full_name: 'testuser/bitbucket-project',
        description: 'A Bitbucket project',
        links: {
          html: { href: repoUrl },
        },
        mainbranch: { name: 'main' },
        language: 'python',
        created_on: '2023-01-01T00:00:00Z',
        updated_on: '2023-12-01T00:00:00Z',
        size: 1024,
      };

      const portfolioMd = `---
title: "Bitbucket Project"
description: "A project hosted on Bitbucket"
tags: ["bitbucket", "python"]
category: "script"
published: true
---

# Bitbucket Project

This project is hosted on Bitbucket.`;

      // Step 1: Bitbucket API calls
      mockAxios.get
        .mockResolvedValueOnce({ data: mockBitbucketRepo })
        .mockResolvedValueOnce({ data: portfolioMd });

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'Bitbucket Project',
        description: 'A project hosted on Bitbucket',
        repoUrl,
        tags: ['bitbucket', 'python'],
        category: 'script',
        published: true,
        platform: 'bitbucket',
        language: 'Python',
        githubMetadata: {}, // Empty for Bitbucket
        customMetadata: {},
        bitbucketMetadata: mockBitbucketRepo,
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main', platform: 'bitbucket' })
        .expect(201);

      expect(syncResponse.body.title).toBe('Bitbucket Project');
      expect(syncResponse.body.platform).toBe('bitbucket');
      expect(syncResponse.body.language).toBe('Python');
    });
  });

  describe('Multi-Platform Bulk Sync Workflow', () => {
    it('should sync repositories from multiple platforms', async () => {
      // Step 1: Setup user with tokens for all platforms
      const multiPlatformUser = createMockUser({
        githubToken: 'encrypted-github-token',
        gitlabToken: 'encrypted-gitlab-token',
        bitbucketToken: 'encrypted-bitbucket-token',
      });

      context.prismaService.user.findUnique.mockResolvedValue(multiPlatformUser);

      // Step 2: Mock repositories from different platforms
      const githubRepos = [
        createMockGitHubRepo({
          name: 'github-repo-1',
          html_url: 'https://github.com/user/github-repo-1',
        }),
        createMockGitHubRepo({
          name: 'github-repo-2',
          html_url: 'https://github.com/user/github-repo-2',
        }),
      ];

      const gitlabRepos = [
        {
          name: 'gitlab-repo-1',
          web_url: 'https://gitlab.com/user/gitlab-repo-1',
          description: 'GitLab repository 1',
        },
      ];

      const bitbucketRepos = [
        {
          name: 'bitbucket-repo-1',
          links: {
            html: { href: 'https://bitbucket.org/user/bitbucket-repo-1' },
          },
          description: 'Bitbucket repository 1',
        },
      ];

      // Step 3: Mock API responses for each platform
      mockAxios.get
        .mockResolvedValueOnce({ data: githubRepos }) // GitHub repos
        .mockResolvedValueOnce({ data: gitlabRepos }) // GitLab repos
        .mockResolvedValueOnce({ data: bitbucketRepos }); // Bitbucket repos

      const bulkSyncResponse = await context.request
        .post('/projects/bulk-sync')
        .set(createAuthHeaders(accessToken))
        .send({ platforms: ['github', 'gitlab', 'bitbucket'] })
        .expect(202);

      expect(bulkSyncResponse.body).toHaveProperty('jobId');
      expect(bulkSyncResponse.body.repositoryCount).toBe(4); // 2 + 1 + 1
      expect(bulkSyncResponse.body.platforms).toEqual(['github', 'gitlab', 'bitbucket']);

      // Step 4: Verify sync jobs were queued for each repository
      const mockSyncJobs = [
        {
          id: 'job-1',
          repoUrl: 'https://github.com/user/github-repo-1',
          platform: 'github',
        },
        {
          id: 'job-2',
          repoUrl: 'https://github.com/user/github-repo-2',
          platform: 'github',
        },
        {
          id: 'job-3',
          repoUrl: 'https://gitlab.com/user/gitlab-repo-1',
          platform: 'gitlab',
        },
        {
          id: 'job-4',
          repoUrl: 'https://bitbucket.org/user/bitbucket-repo-1',
          platform: 'bitbucket',
        },
      ];

      const jobStatusResponse = await context.request
        .get(`/projects/bulk-sync/${bulkSyncResponse.body.jobId}/status`)
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(jobStatusResponse.body.status).toBe('in_progress');
      expect(jobStatusResponse.body.jobs).toHaveLength(4);
    });

    it('should handle partial platform failures in bulk sync', async () => {
      const multiPlatformUser = createMockUser({
        githubToken: 'encrypted-github-token',
        gitlabToken: null, // No GitLab token
        bitbucketToken: 'encrypted-bitbucket-token',
      });

      context.prismaService.user.findUnique.mockResolvedValue(multiPlatformUser);

      const githubRepos = [
        createMockGitHubRepo({
          name: 'github-repo',
          html_url: 'https://github.com/user/github-repo',
        }),
      ];

      const bitbucketRepos = [
        {
          name: 'bitbucket-repo',
          links: {
            html: { href: 'https://bitbucket.org/user/bitbucket-repo' },
          },
        },
      ];

      mockAxios.get
        .mockResolvedValueOnce({ data: githubRepos }) // GitHub success
        .mockRejectedValueOnce({ response: { status: 401 } }) // GitLab auth failure
        .mockResolvedValueOnce({ data: bitbucketRepos }); // Bitbucket success

      const bulkSyncResponse = await context.request
        .post('/projects/bulk-sync')
        .set(createAuthHeaders(accessToken))
        .send({ platforms: ['github', 'gitlab', 'bitbucket'] })
        .expect(202);

      expect(bulkSyncResponse.body.repositoryCount).toBe(2); // Only GitHub and Bitbucket
      expect(bulkSyncResponse.body.warnings).toContain('GitLab authentication failed');
    });
  });

  describe('Webhook-Triggered Sync Workflow', () => {
    it('should handle GitHub webhook and trigger sync', async () => {
      const repoUrl = 'https://github.com/testuser/webhook-project';
      const webhookPayload = {
        action: 'push',
        repository: {
          name: 'webhook-project',
          full_name: 'testuser/webhook-project',
          html_url: repoUrl,
          description: 'Updated via webhook',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Update Portfolio.md',
            modified: ['Portfolio.md'],
          },
        ],
        ref: 'refs/heads/main',
      };

      const webhookHeaders = {
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'webhook-delivery-123',
        'X-Hub-Signature-256': 'sha256=valid-signature',
      };

      // Step 1: Webhook received and validated
      const mockProject = createMockProject({
        ownerId: testUser.id,
        repoUrl,
        title: 'webhook-project',
      });

      context.prismaService.project.findFirst.mockResolvedValue(mockProject);

      const webhookResponse = await context.request
        .post('/webhooks/github')
        .set(webhookHeaders)
        .send(webhookPayload)
        .expect(200);

      expect(webhookResponse.body.received).toBe(true);
      expect(webhookResponse.body.action).toBe('sync_queued');

      // Step 2: Verify sync was triggered
      const updatedPortfolioMd = `---
title: "Webhook Project Updated"
description: "This project was updated via webhook"
tags: ["webhook", "updated"]
---

# Updated Project

This project was updated via GitHub webhook.`;

      mockAxios.get
        .mockResolvedValueOnce({ data: webhookPayload.repository })
        .mockResolvedValueOnce({ data: updatedPortfolioMd });

      const updatedProject = createMockProject({
        ...mockProject,
        title: 'Webhook Project Updated',
        description: 'This project was updated via webhook',
        tags: ['webhook', 'updated'],
        lastSyncAt: new Date(),
      });

      context.prismaService.project.upsert.mockResolvedValue(updatedProject);

      // Simulate webhook processing
      const syncResult = await context.request
        .get(`/projects/${mockProject.id}`)
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(syncResult.body.title).toBe('Webhook Project Updated');
      expect(syncResult.body.tags).toContain('webhook');
    });

    it('should handle webhook signature validation', async () => {
      const webhookPayload = {
        action: 'push',
        repository: {
          name: 'invalid-webhook',
          html_url: 'https://github.com/testuser/invalid-webhook',
        },
      };

      const invalidHeaders = {
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'invalid-delivery',
        'X-Hub-Signature-256': 'sha256=invalid-signature',
      };

      const webhookResponse = await context.request
        .post('/webhooks/github')
        .set(invalidHeaders)
        .send(webhookPayload)
        .expect(401);

      expect(webhookResponse.body.error).toContain('Invalid signature');
    });
  });

  describe('Sync Error Handling and Recovery', () => {
    it('should handle and recover from sync failures', async () => {
      const repoUrl = 'https://github.com/testuser/failing-project';

      // Step 1: First sync attempt fails
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      const failedSyncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(500);

      expect(failedSyncResponse.body.message).toContain('sync failed');

      // Step 2: Record sync failure in history
      const mockFailedSync = {
        id: 'sync-failed-123',
        userId: testUser.id,
        operation: 'sync',
        platform: 'github',
        repositoryUrl: repoUrl,
        status: 'failed',
        error: 'Internal server error',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 1000,
      };

      context.prismaService.syncHistory.create.mockResolvedValue(mockFailedSync);

      // Step 3: Retry sync succeeds
      const mockGitHubRepo = createMockGitHubRepo({
        name: 'failing-project',
        html_url: repoUrl,
      });

      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockRejectedValueOnce({ response: { status: 404 } }); // No Portfolio.md

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'failing-project',
        repoUrl,
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const retryResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main', retry: true })
        .expect(201);

      expect(retryResponse.body.title).toBe('failing-project');
      expect(retryResponse.body.syncStatus).toBe('completed');
    });

    it('should handle repository access permission changes', async () => {
      const repoUrl = 'https://github.com/testuser/private-project';

      // Step 1: Repository becomes private/inaccessible
      mockAxios.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Not Found' } },
      });

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(404);

      expect(syncResponse.body.message).toContain('repository not found');

      // Step 2: Mark project as inaccessible but don't delete
      const inaccessibleProject = createMockProject({
        ownerId: testUser.id,
        repoUrl,
        syncStatus: 'inaccessible',
        lastSyncError: 'Repository not found or access denied',
      });

      context.prismaService.project.update.mockResolvedValue(inaccessibleProject);

      const projectResponse = await context.request
        .get('/projects')
        .set(createAuthHeaders(accessToken))
        .query({ includeInaccessible: true })
        .expect(200);

      const inaccessibleProjects = projectResponse.body.data.filter(
        (p: any) => p.syncStatus === 'inaccessible',
      );
      expect(inaccessibleProjects).toHaveLength(1);
    });
  });

  describe('Sync Performance and Optimization', () => {
    it('should handle large repository sync efficiently', async () => {
      const repoUrl = 'https://github.com/testuser/large-project';
      const largeRepo = createMockGitHubRepo({
        name: 'large-project',
        html_url: repoUrl,
        size: 100000, // 100MB repository
      });

      const largePortfolioMd = `---
title: "Large Project"
description: "A large project with extensive documentation"
tags: ${JSON.stringify(Array.from({ length: 50 }, (_, i) => `tag${i}`))}
---

${'# Large Project\n\n'.repeat(1000)}`; // Large content

      mockAxios.get
        .mockResolvedValueOnce({ data: largeRepo })
        .mockResolvedValueOnce({ data: largePortfolioMd });

      const startTime = Date.now();

      const mockProject = createMockProject({
        ownerId: testUser.id,
        title: 'Large Project',
        repoUrl,
        tags: Array.from({ length: 50 }, (_, i) => `tag${i}`),
      });

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(201);

      const syncDuration = Date.now() - startTime;

      expect(syncResponse.body.title).toBe('Large Project');
      expect(syncDuration).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    it('should implement sync rate limiting', async () => {
      const repoUrls = Array.from(
        { length: 10 },
        (_, i) => `https://github.com/testuser/rate-limit-test-${i}`,
      );

      // Attempt to sync many repositories quickly
      const syncPromises = repoUrls.map((repoUrl, i) =>
        context.request
          .post('/projects/sync')
          .set(createAuthHeaders(accessToken))
          .send({ repoUrl, branch: 'main' }),
      );

      const responses = await Promise.all(syncPromises);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      const successfulResponses = responses.filter(res => res.status === 201);
      expect(successfulResponses.length).toBeLessThan(repoUrls.length);
    });
  });
});
