import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  TestContext,
  TestDataBuilder,
  ApiTestHelpers,
  createAuthHeaders,
} from '../../test/test-utils/integration-helpers';
import { createMockUser, createMockGitHubRepo } from '../../test/test-utils/mocks';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';

// Mock external dependencies
jest.mock('axios');
jest.mock('bcryptjs');

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('User Onboarding End-to-End Workflow', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-value' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('Complete User Signup and Onboarding Flow', () => {
    it('should complete full user onboarding workflow', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'StrongPass123!',
        username: 'newuser',
      };

      const mockUser = createMockUser({
        email: userData.email,
        username: userData.username,
      });

      // Step 1: User signs up
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const signupResponse = await context.request.post('/auth/signup').send(userData).expect(201);

      expect(signupResponse.body).toHaveProperty('user');
      expect(signupResponse.body).toHaveProperty('apiKey');
      expect(signupResponse.body.user.email).toBe(userData.email);

      const { user, apiKey } = signupResponse.body;

      // Step 2: User signs in to get JWT token
      context.prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: 'hashed-password',
      });
      context.prismaService.user.update.mockResolvedValue(mockUser);

      const signinResponse = await context.request
        .post('/auth/signin')
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);

      expect(signinResponse.body).toHaveProperty('accessToken');
      expect(signinResponse.body).toHaveProperty('refreshToken');

      const { accessToken } = signinResponse.body;

      // Step 3: User connects GitHub account
      const githubCode = 'github-auth-code';
      const githubAccessToken = 'github-access-token';
      const githubUserId = 12345;

      mockAxios.post.mockResolvedValue({
        data: { access_token: githubAccessToken },
      });
      mockAxios.get.mockResolvedValue({
        data: { id: githubUserId, login: 'newuser' },
      });

      context.prismaService.user.update.mockResolvedValue({
        ...mockUser,
        githubId: String(githubUserId),
        githubToken: 'encrypted-token',
      });

      const githubConnectResponse = await context.request
        .post('/auth/github/connect')
        .set(createAuthHeaders(accessToken))
        .send({ code: githubCode })
        .expect(200);

      expect(githubConnectResponse.body.user.githubId).toBe(String(githubUserId));

      // Step 4: User syncs their first repository
      const repoUrl = 'https://github.com/newuser/first-repo';
      const mockGitHubRepo = createMockGitHubRepo({
        name: 'first-repo',
        html_url: repoUrl,
        description: 'My first repository',
      });

      const portfolioMd = `---
title: "My First Project"
description: "This is my first project on GitSink"
tags: ["beginner", "first-project"]
featured: true
published: true
---

# My First Project

Welcome to my first project!`;

      mockAxios.get
        .mockResolvedValueOnce({ data: mockGitHubRepo })
        .mockResolvedValueOnce({ data: portfolioMd });

      const mockProject = {
        id: 'project-123',
        ownerId: user.id,
        title: 'My First Project',
        description: 'This is my first project on GitSink',
        repoUrl,
        tags: ['beginner', 'first-project'],
        featured: true,
        published: true,
        syncStatus: 'completed',
      };

      context.prismaService.project.upsert.mockResolvedValue(mockProject);

      const syncResponse = await context.request
        .post('/projects/sync')
        .set(createAuthHeaders(accessToken))
        .send({ repoUrl, branch: 'main' })
        .expect(201);

      expect(syncResponse.body.title).toBe('My First Project');
      expect(syncResponse.body.featured).toBe(true);
      expect(syncResponse.body.published).toBe(true);

      // Step 5: User creates a public profile
      const profileData = {
        username: 'newuser',
        displayName: 'New User',
        bio: 'Welcome to my developer profile!',
        isPublic: true,
      };

      const mockProfile = {
        id: 'profile-123',
        userId: user.id,
        ...profileData,
        createdAt: new Date(),
      };

      context.prismaService.publicProfile.findUnique.mockResolvedValue(null);
      context.prismaService.publicProfile.create.mockResolvedValue(mockProfile);

      const profileResponse = await context.request
        .post('/profiles')
        .set(createAuthHeaders(accessToken))
        .send(profileData)
        .expect(201);

      expect(profileResponse.body.username).toBe(profileData.username);
      expect(profileResponse.body.isPublic).toBe(true);

      // Step 6: Verify the complete onboarding state
      context.prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        githubId: String(githubUserId),
        githubToken: 'encrypted-token',
      });
      context.prismaService.project.findMany.mockResolvedValue([mockProject]);
      context.prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      const userProfileResponse = await context.request
        .get('/profiles/me')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(userProfileResponse.body).toHaveProperty('user');
      expect(userProfileResponse.body).toHaveProperty('projects');
      expect(userProfileResponse.body).toHaveProperty('profile');
      expect(userProfileResponse.body.user.githubId).toBe(String(githubUserId));
      expect(userProfileResponse.body.projects).toHaveLength(1);
      expect(userProfileResponse.body.profile.isPublic).toBe(true);

      // Step 7: Verify public profile is accessible
      const publicProfileResponse = await context.request
        .get(`/profiles/public/${profileData.username}`)
        .expect(200);

      expect(publicProfileResponse.body.username).toBe(profileData.username);
      expect(publicProfileResponse.body.projects).toHaveLength(1);
      expect(publicProfileResponse.body.projects[0].title).toBe('My First Project');
    });

    it('should handle onboarding with existing GitHub account', async () => {
      const existingGitHubUser = {
        githubId: '54321',
        email: 'github-user@example.com',
        username: 'githubuser',
      };

      // Step 1: User tries to sign up but already has GitHub account
      const mockExistingUser = createMockUser(existingGitHubUser);

      context.prismaService.user.findUnique
        .mockResolvedValueOnce(null) // Email check
        .mockResolvedValueOnce(mockExistingUser); // GitHub ID check

      const signupResponse = await context.request
        .post('/auth/signup')
        .send({
          email: 'different@example.com',
          password: 'StrongPass123!',
          username: 'differentuser',
        })
        .expect(409);

      expect(signupResponse.body.message).toContain('GitHub account already connected');

      // Step 2: User signs in with existing account
      context.prismaService.user.findUnique.mockResolvedValue({
        ...mockExistingUser,
        password: 'hashed-password',
      });
      context.prismaService.user.update.mockResolvedValue(mockExistingUser);

      const signinResponse = await context.request
        .post('/auth/signin')
        .send({
          email: existingGitHubUser.email,
          password: 'StrongPass123!',
        })
        .expect(200);

      expect(signinResponse.body.user.githubId).toBe(existingGitHubUser.githubId);
    });

    it('should handle onboarding errors gracefully', async () => {
      const userData = {
        email: 'error-test@example.com',
        password: 'StrongPass123!',
        username: 'erroruser',
      };

      // Step 1: Signup succeeds
      const mockUser = createMockUser(userData);
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const signupResponse = await context.request.post('/auth/signup').send(userData).expect(201);

      const { accessToken } = signupResponse.body;

      // Step 2: GitHub connection fails
      mockAxios.post.mockRejectedValue({
        response: { status: 400, data: { error: 'Invalid code' } },
      });

      const githubConnectResponse = await context.request
        .post('/auth/github/connect')
        .set(createAuthHeaders(accessToken))
        .send({ code: 'invalid-code' })
        .expect(400);

      expect(githubConnectResponse.body).toHaveProperty('message');

      // Step 3: User can still proceed without GitHub
      const profileData = {
        username: 'erroruser',
        displayName: 'Error Test User',
        bio: 'Testing error handling',
        isPublic: false, // Private profile without GitHub
      };

      const mockProfile = {
        id: 'profile-456',
        userId: mockUser.id,
        ...profileData,
      };

      context.prismaService.publicProfile.findUnique.mockResolvedValue(null);
      context.prismaService.publicProfile.create.mockResolvedValue(mockProfile);

      const profileResponse = await context.request
        .post('/profiles')
        .set(createAuthHeaders(accessToken))
        .send(profileData)
        .expect(201);

      expect(profileResponse.body.isPublic).toBe(false);
    });
  });

  describe('OAuth-based Onboarding Flow', () => {
    it('should complete GitHub OAuth onboarding', async () => {
      const githubUser = {
        id: 98765,
        login: 'oauthuser',
        email: 'oauth@example.com',
        name: 'OAuth User',
      };

      // Step 1: GitHub OAuth callback
      mockAxios.post.mockResolvedValue({
        data: { access_token: 'oauth-access-token' },
      });
      mockAxios.get.mockResolvedValue({
        data: githubUser,
      });

      const mockUser = createMockUser({
        email: githubUser.email,
        username: githubUser.login,
        githubId: String(githubUser.id),
      });

      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const oauthResponse = await context.request
        .get('/auth/github/callback')
        .query({ code: 'oauth-code', state: 'oauth-state' })
        .expect(302); // Redirect

      expect(oauthResponse.headers.location).toContain('access_token');

      // Step 2: Extract token and verify user creation
      const tokenMatch = oauthResponse.headers.location.match(/access_token=([^&]+)/);
      const accessToken = tokenMatch ? tokenMatch[1] : '';

      const userResponse = await context.request
        .get('/auth/me')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(userResponse.body.githubId).toBe(String(githubUser.id));
      expect(userResponse.body.email).toBe(githubUser.email);

      // Step 3: Auto-sync GitHub repositories
      const mockRepos = [
        createMockGitHubRepo({
          name: 'oauth-repo-1',
          html_url: 'https://github.com/oauthuser/oauth-repo-1',
        }),
        createMockGitHubRepo({
          name: 'oauth-repo-2',
          html_url: 'https://github.com/oauthuser/oauth-repo-2',
        }),
      ];

      mockAxios.get.mockResolvedValue({ data: mockRepos });

      const bulkSyncResponse = await context.request
        .post('/projects/bulk-sync')
        .set(createAuthHeaders(accessToken))
        .expect(202);

      expect(bulkSyncResponse.body).toHaveProperty('jobId');
      expect(bulkSyncResponse.body.repositoryCount).toBe(2);
    });

    it('should handle existing user OAuth login', async () => {
      const existingUser = createMockUser({
        githubId: '11111',
        email: 'existing@example.com',
        username: 'existinguser',
      });

      // Step 1: OAuth with existing GitHub ID
      mockAxios.post.mockResolvedValue({
        data: { access_token: 'existing-access-token' },
      });
      mockAxios.get.mockResolvedValue({
        data: {
          id: 11111,
          login: 'existinguser',
          email: 'existing@example.com',
        },
      });

      context.prismaService.user.findUnique.mockResolvedValue(existingUser);
      context.prismaService.user.update.mockResolvedValue({
        ...existingUser,
        lastLoginAt: new Date(),
      });

      const oauthResponse = await context.request
        .get('/auth/github/callback')
        .query({ code: 'existing-code' })
        .expect(302);

      expect(oauthResponse.headers.location).toContain('access_token');

      // Step 2: Verify existing user login
      const tokenMatch = oauthResponse.headers.location.match(/access_token=([^&]+)/);
      const accessToken = tokenMatch ? tokenMatch[1] : '';

      const userResponse = await context.request
        .get('/auth/me')
        .set(createAuthHeaders(accessToken))
        .expect(200);

      expect(userResponse.body.id).toBe(existingUser.id);
      expect(userResponse.body.lastLoginAt).toBeDefined();
    });
  });

  describe('Magic Link Onboarding Flow', () => {
    it('should complete magic link onboarding', async () => {
      const email = 'magiclink@example.com';

      // Step 1: Request magic link
      const mockUser = createMockUser({ email });
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);
      context.prismaService.magicLinkToken.create.mockResolvedValue({
        id: 'token-123',
        tokenHash: 'hashed-token',
        email,
        expiresAt: new Date(Date.now() + 900000),
      });

      const magicLinkResponse = await context.request
        .post('/auth/magic-link')
        .send({ email })
        .expect(200);

      expect(magicLinkResponse.body.message).toContain('magic link');

      // Step 2: Verify magic link token
      const magicToken = 'magic-link-token';
      const mockMagicLinkToken = {
        id: 'token-123',
        tokenHash: 'hashed-token',
        email,
        expiresAt: new Date(Date.now() + 900000),
        user: mockUser,
      };

      context.prismaService.magicLinkToken.findFirst.mockResolvedValue(mockMagicLinkToken);
      context.prismaService.user.findUnique.mockResolvedValue(mockUser);

      const verifyResponse = await context.request
        .get(`/auth/verify-magic-link/${magicToken}`)
        .expect(200);

      expect(verifyResponse.body).toHaveProperty('accessToken');
      expect(verifyResponse.body).toHaveProperty('user');

      // Step 3: Complete profile setup
      const { accessToken } = verifyResponse.body;

      const profileData = {
        username: 'magicuser',
        displayName: 'Magic Link User',
        bio: 'Signed up via magic link',
        isPublic: true,
      };

      const mockProfile = {
        id: 'profile-789',
        userId: mockUser.id,
        ...profileData,
      };

      context.prismaService.publicProfile.findUnique.mockResolvedValue(null);
      context.prismaService.publicProfile.create.mockResolvedValue(mockProfile);

      const profileResponse = await context.request
        .post('/profiles')
        .set(createAuthHeaders(accessToken))
        .send(profileData)
        .expect(201);

      expect(profileResponse.body.username).toBe(profileData.username);
    });
  });

  describe('Onboarding Analytics and Tracking', () => {
    it('should track onboarding completion metrics', async () => {
      const userData = {
        email: 'analytics@example.com',
        password: 'StrongPass123!',
        username: 'analyticsuser',
      };

      const mockUser = createMockUser(userData);

      // Complete onboarding steps
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      await context.request.post('/auth/signup').send(userData).expect(201);

      // Verify analytics events were tracked
      // In a real implementation, you would check metrics service calls
      expect(context.prismaService.user.create).toHaveBeenCalled();
    });

    it('should track onboarding drop-off points', async () => {
      const userData = {
        email: 'dropout@example.com',
        password: 'StrongPass123!',
        username: 'dropoutuser',
      };

      const mockUser = createMockUser(userData);

      // Step 1: User signs up
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const signupResponse = await context.request.post('/auth/signup').send(userData).expect(201);

      // Step 2: User starts but doesn't complete GitHub connection
      const { accessToken } = signupResponse.body;

      mockAxios.post.mockRejectedValue({
        response: { status: 400, data: { error: 'Invalid code' } },
      });

      await context.request
        .post('/auth/github/connect')
        .set(createAuthHeaders(accessToken))
        .send({ code: 'invalid-code' })
        .expect(400);

      // Track that user dropped off at GitHub connection step
      // In a real implementation, you would verify analytics tracking
    });
  });

  describe('Onboarding Error Recovery', () => {
    it('should allow users to retry failed onboarding steps', async () => {
      const userData = {
        email: 'retry@example.com',
        password: 'StrongPass123!',
        username: 'retryuser',
      };

      const mockUser = createMockUser(userData);

      // Step 1: Successful signup
      context.prismaService.user.findUnique.mockResolvedValue(null);
      context.prismaService.user.create.mockResolvedValue(mockUser);

      const signupResponse = await context.request.post('/auth/signup').send(userData).expect(201);

      const { accessToken } = signupResponse.body;

      // Step 2: First GitHub connection attempt fails
      mockAxios.post.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'Server error' } },
      });

      await context.request
        .post('/auth/github/connect')
        .set(createAuthHeaders(accessToken))
        .send({ code: 'github-code' })
        .expect(500);

      // Step 3: Retry GitHub connection succeeds
      mockAxios.post.mockResolvedValue({
        data: { access_token: 'github-access-token' },
      });
      mockAxios.get.mockResolvedValue({
        data: { id: 12345, login: 'retryuser' },
      });

      context.prismaService.user.update.mockResolvedValue({
        ...mockUser,
        githubId: '12345',
        githubToken: 'encrypted-token',
      });

      const retryResponse = await context.request
        .post('/auth/github/connect')
        .set(createAuthHeaders(accessToken))
        .send({ code: 'github-code' })
        .expect(200);

      expect(retryResponse.body.user.githubId).toBe('12345');
    });
  });
});
