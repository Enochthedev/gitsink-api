import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { WebhooksModule } from './webhooks.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('Webhooks Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: ConfigService;

  const mockGitHubPayload = {
    ref: 'refs/heads/main',
    repository: {
      id: 123456,
      name: 'test-repo',
      full_name: 'user/test-repo',
      html_url: 'https://github.com/user/test-repo',
      owner: {
        id: 789,
        login: 'user',
      },
    },
    commits: [
      {
        id: 'abc123',
        message: 'Update Portfolio.md',
        added: ['Portfolio.md'],
        modified: [],
        removed: [],
      },
    ],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [WebhooksModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    config = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up webhook events before each test
    await prisma.webhookEvent.deleteMany();
  });

  describe('POST /webhooks/:platform', () => {
    it('should accept valid GitHub webhook', async () => {
      const payload = JSON.stringify(mockGitHubPayload);
      const secret = 'test-secret';
      const signature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      // Mock the config to return our test secret
      jest.spyOn(config, 'get').mockImplementation((key: string) => {
        if (key === 'GITHUB_WEBHOOK_SECRET') return secret;
        return undefined;
      });

      const response = await request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .send(mockGitHubPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.platform).toBe('github');
      expect(response.body.eventType).toBe('push');

      // Verify webhook event was stored
      const storedEvents = await prisma.webhookEvent.findMany();
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].platform).toBe('github');
      expect(storedEvents[0].eventType).toBe('push');
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify(mockGitHubPayload);
      const invalidSignature = 'sha256=invalid';

      const response = await request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-hub-signature-256', invalidSignature)
        .set('x-github-event', 'push')
        .send(mockGitHubPayload)
        .expect(401);

      expect(response.body.message).toContain('Invalid webhook signature');

      // Verify no webhook event was stored
      const storedEvents = await prisma.webhookEvent.findMany();
      expect(storedEvents).toHaveLength(0);
    });

    it('should reject webhook without signature', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-github-event', 'push')
        .send(mockGitHubPayload)
        .expect(400);

      expect(response.body.message).toContain('Missing webhook signature');
    });

    it('should reject webhook without event type', async () => {
      const payload = JSON.stringify(mockGitHubPayload);
      const secret = 'test-secret';
      const signature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      const response = await request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .send(mockGitHubPayload)
        .expect(400);

      expect(response.body.message).toContain('Missing event type header');
    });

    it('should reject unsupported platform', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/unsupported')
        .send({})
        .expect(400);

      expect(response.body.message).toContain('Unsupported platform');
    });
  });

  describe('GET /webhooks/events', () => {
    beforeEach(async () => {
      // Create test webhook events
      await prisma.webhookEvent.createMany({
        data: [
          {
            platform: 'github',
            eventType: 'push',
            repositoryUrl: 'https://github.com/user/repo1',
            repositoryId: '123',
            repositoryName: 'repo1',
            repositoryFullName: 'user/repo1',
            ownerId: '456',
            ownerName: 'user',
            payload: mockGitHubPayload,
            signature: 'test-signature',
            timestamp: new Date(),
            processed: true,
            retryCount: 0,
          },
          {
            platform: 'gitlab',
            eventType: 'push',
            repositoryUrl: 'https://gitlab.com/user/repo2',
            repositoryId: '789',
            repositoryName: 'repo2',
            repositoryFullName: 'user/repo2',
            ownerId: '101',
            ownerName: 'user',
            payload: {},
            signature: 'test-signature',
            timestamp: new Date(),
            processed: false,
            retryCount: 1,
            error: 'Processing failed',
          },
        ],
      });
    });

    it('should return all webhook events', async () => {
      const response = await request(app.getHttpServer()).get('/webhooks/events').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should filter events by platform', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/events?platform=github')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].platform).toBe('github');
    });

    it('should filter events by processed status', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/events?processed=false')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].processed).toBe(false);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/events?limit=1&offset=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.offset).toBe(1);
    });
  });

  describe('GET /webhooks/events/:eventId', () => {
    let eventId: string;

    beforeEach(async () => {
      const event = await prisma.webhookEvent.create({
        data: {
          platform: 'github',
          eventType: 'push',
          repositoryUrl: 'https://github.com/user/repo',
          repositoryId: '123',
          repositoryName: 'repo',
          repositoryFullName: 'user/repo',
          ownerId: '456',
          ownerName: 'user',
          payload: mockGitHubPayload,
          signature: 'test-signature',
          timestamp: new Date(),
          processed: true,
          retryCount: 0,
        },
      });
      eventId = event.id;
    });

    it('should return specific webhook event', async () => {
      const response = await request(app.getHttpServer())
        .get(`/webhooks/events/${eventId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(eventId);
      expect(response.body.data.platform).toBe('github');
    });

    it('should return not found for non-existent event', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/events/non-existent-id')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /webhooks/metrics', () => {
    beforeEach(async () => {
      // Create test webhook events with different statuses
      await prisma.webhookEvent.createMany({
        data: [
          {
            platform: 'github',
            eventType: 'push',
            repositoryUrl: 'https://github.com/user/repo1',
            repositoryId: '123',
            repositoryName: 'repo1',
            repositoryFullName: 'user/repo1',
            ownerId: '456',
            ownerName: 'user',
            payload: {},
            signature: 'test-signature',
            timestamp: new Date(),
            processed: true,
            retryCount: 0,
          },
          {
            platform: 'github',
            eventType: 'pull_request',
            repositoryUrl: 'https://github.com/user/repo2',
            repositoryId: '789',
            repositoryName: 'repo2',
            repositoryFullName: 'user/repo2',
            ownerId: '456',
            ownerName: 'user',
            payload: {},
            signature: 'test-signature',
            timestamp: new Date(),
            processed: false,
            retryCount: 2,
            error: 'Processing failed',
          },
          {
            platform: 'gitlab',
            eventType: 'push',
            repositoryUrl: 'https://gitlab.com/user/repo3',
            repositoryId: '101',
            repositoryName: 'repo3',
            repositoryFullName: 'user/repo3',
            ownerId: '456',
            ownerName: 'user',
            payload: {},
            signature: 'test-signature',
            timestamp: new Date(),
            processed: true,
            retryCount: 0,
          },
        ],
      });
    });

    it('should return webhook metrics', async () => {
      const response = await request(app.getHttpServer()).get('/webhooks/metrics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalEvents).toBe(3);
      expect(response.body.data.processedEvents).toBe(2);
      expect(response.body.data.failedEvents).toBe(1);
      expect(response.body.data.eventsByPlatform.github).toBe(2);
      expect(response.body.data.eventsByPlatform.gitlab).toBe(1);
      expect(response.body.data.eventsByType.push).toBe(2);
      expect(response.body.data.eventsByType.pull_request).toBe(1);
    });

    it('should filter metrics by platform', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/metrics?platform=github')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalEvents).toBe(2);
      expect(response.body.data.eventsByPlatform.github).toBe(2);
      expect(response.body.data.eventsByPlatform.gitlab).toBeUndefined();
    });
  });
});
