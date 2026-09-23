import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from './health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { MetricsModule } from '../metrics/metrics.module';

describe('Health Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        CacheModule.register({
          isGlobal: true,
        }),
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: parseInt(process.env.REDIS_DB || '1'), // Use different DB for tests
          },
        }),
        BullModule.registerQueue({ name: 'sync' }, { name: 'email' }),
        PrismaModule,
        MetricsModule,
        HealthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/health (GET)', () => {
    it('should return basic health status', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    it('should include health check summary', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body.checks).toHaveProperty('status');
      expect(response.body.checks).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('healthy');
      expect(response.body.checks).toHaveProperty('degraded');
      expect(response.body.checks).toHaveProperty('down');
    });
  });

  describe('/health/detailed (GET)', () => {
    it('should return detailed health information', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });

    it('should include all service health checks', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed').expect(200);

      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services).toHaveProperty('queues');
    });

    it('should include system metrics', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed').expect(200);

      expect(response.body.metrics).toHaveProperty('memoryUsage');
      expect(response.body.metrics).toHaveProperty('queueSize');
      expect(typeof response.body.metrics.memoryUsage).toBe('number');
      expect(typeof response.body.metrics.queueSize).toBe('number');
    });
  });

  describe('/health/database (GET)', () => {
    it('should return database health status', async () => {
      const response = await request(app.getHttpServer()).get('/health/database').expect(200);

      expect(response.body).toHaveProperty('service', 'database');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('lastCheck');
    });

    it('should include database details', async () => {
      const response = await request(app.getHttpServer()).get('/health/database').expect(200);

      if (response.body.status === 'up') {
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('userCount');
        expect(response.body.details).toHaveProperty('connectionPool');
      }
    });
  });

  describe('/health/redis (GET)', () => {
    it('should return redis health status', async () => {
      const response = await request(app.getHttpServer()).get('/health/redis').expect(200);

      expect(response.body).toHaveProperty('service', 'redis');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('lastCheck');
    });
  });

  describe('/health/queues (GET)', () => {
    it('should return queue health status', async () => {
      const response = await request(app.getHttpServer()).get('/health/queues').expect(200);

      expect(response.body).toHaveProperty('service', 'queues');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('lastCheck');
    });

    it('should include queue details when healthy', async () => {
      const response = await request(app.getHttpServer()).get('/health/queues').expect(200);

      if (response.body.status === 'up') {
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('syncQueue');
        expect(response.body.details).toHaveProperty('emailQueue');
      }
    });
  });

  describe('/health/configuration (GET)', () => {
    it('should return configuration health status', async () => {
      const response = await request(app.getHttpServer()).get('/health/configuration').expect(200);

      expect(response.body).toHaveProperty('service', 'configuration');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('lastCheck');
    });

    it('should include configuration details', async () => {
      const response = await request(app.getHttpServer()).get('/health/configuration').expect(200);

      if (response.body.status === 'up') {
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('requiredVariables');
        expect(response.body.details).toHaveProperty('configured');
        expect(response.body.details).toHaveProperty('environment');
      }
    });
  });

  describe('/health/external (GET)', () => {
    it('should return external services health status', async () => {
      const response = await request(app.getHttpServer()).get('/health/external').expect(200);

      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include GitHub API health check', async () => {
      const response = await request(app.getHttpServer()).get('/health/external').expect(200);

      expect(response.body.services).toHaveProperty('github');
      expect(response.body.services.github).toHaveProperty('status');
      expect(response.body.services.github).toHaveProperty('responseTime');
    });
  });

  describe('/health/metrics (GET)', () => {
    it('should return system metrics', async () => {
      const response = await request(app.getHttpServer()).get('/health/metrics').expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include all required metrics', async () => {
      const response = await request(app.getHttpServer()).get('/health/metrics').expect(200);

      const metrics = response.body.metrics;
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('queueSize');
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('diskUsage');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('throughput');
    });
  });

  describe('/health/scaling (GET)', () => {
    it('should return scaling recommendation', async () => {
      const response = await request(app.getHttpServer()).get('/health/scaling').expect(200);

      expect(response.body).toHaveProperty('recommendation');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include valid scaling recommendation', async () => {
      const response = await request(app.getHttpServer()).get('/health/scaling').expect(200);

      const recommendation = response.body.recommendation;
      expect(recommendation).toHaveProperty('action');
      expect(recommendation).toHaveProperty('reason');
      expect(recommendation).toHaveProperty('confidence');

      expect(['scale_up', 'scale_down', 'maintain']).toContain(recommendation.action);
      expect(typeof recommendation.confidence).toBe('number');
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Error handling', () => {
    it('should handle service unavailable gracefully', async () => {
      // This test would require mocking a service failure
      // For now, we just ensure the endpoints don't crash
      const endpoints = [
        '/health',
        '/health/detailed',
        '/health/database',
        '/health/redis',
        '/health/queues',
        '/health/configuration',
        '/health/external',
        '/health/metrics',
        '/health/scaling',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app.getHttpServer()).get(endpoint);

        // Should return either 200 (healthy) or 503 (service unavailable)
        expect([200, 503]).toContain(response.status);

        // Should always return JSON
        expect(response.type).toBe('application/json');
      }
    });
  });
});
