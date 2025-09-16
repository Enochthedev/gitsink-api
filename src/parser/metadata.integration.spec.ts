import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';

describe('MetadataController (Integration)', () => {
  let app: INestApplication;
  let metadataService: MetadataService;

  const mockUser = { id: 'user1', email: 'test@example.com' };
  const mockMetadata = {
    category: 'web',
    framework: 'react',
    tags: ['frontend', 'javascript'],
  };

  beforeEach(async () => {
    const mockMetadataService = {
      storeCustomMetadata: jest.fn(),
      getCustomMetadata: jest.fn(),
      getMetadataHistory: jest.fn(),
      compareMetadataVersions: jest.fn(),
      searchByMetadata: jest.fn(),
      getMetadataStatistics: jest.fn(),
      deleteMetadataVersion: jest.fn(),
    };

    const mockPrismaService = {
      customMetadata: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      project: {
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockJwtGuard = {
      canActivate: jest.fn(() => true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MetadataController],
      providers: [
        {
          provide: MetadataService,
          useValue: mockMetadataService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    })
      .overrideGuard(EnhancedJwtGuard)
      .useValue(mockJwtGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    metadataService = moduleFixture.get<MetadataService>(MetadataService);

    // Mock request user
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /metadata', () => {
    it('should create metadata successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        projectId: 'project1',
        userId: 'user1',
        version: 1,
        metadata: mockMetadata,
        hash: 'hash123',
        size: 100,
        fieldCount: 3,
        createdAt: new Date().toISOString(),
      };

      (metadataService.storeCustomMetadata as jest.Mock).mockResolvedValue(mockEntry);

      const response = await request(app.getHttpServer())
        .post('/metadata')
        .send({
          projectId: 'project1',
          metadata: mockMetadata,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockEntry);
    });

    it('should handle validation errors', async () => {
      (metadataService.storeCustomMetadata as jest.Mock).mockRejectedValue(
        new Error('Metadata validation failed'),
      );

      const response = await request(app.getHttpServer())
        .post('/metadata')
        .send({
          projectId: 'project1',
          metadata: { id: 'reserved-field' },
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Metadata validation failed');
    });
  });

  describe('GET /metadata/:projectId', () => {
    it('should retrieve metadata successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        projectId: 'project1',
        userId: 'user1',
        version: 1,
        metadata: mockMetadata,
        hash: 'hash123',
        size: 100,
        fieldCount: 3,
        createdAt: new Date().toISOString(),
      };

      (metadataService.getCustomMetadata as jest.Mock).mockResolvedValue(mockEntry);

      const response = await request(app.getHttpServer()).get('/metadata/project1').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockEntry);
    });

    it('should return 404 when metadata not found', async () => {
      (metadataService.getCustomMetadata as jest.Mock).mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/metadata/nonexistent').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Metadata not found');
    });
  });

  describe('POST /metadata/search', () => {
    it('should search metadata successfully', async () => {
      const mockProjectIds = ['project1', 'project2'];

      (metadataService.searchByMetadata as jest.Mock).mockResolvedValue(mockProjectIds);

      const response = await request(app.getHttpServer())
        .post('/metadata/search')
        .send({
          field: 'category',
          value: 'web',
          operator: 'equals',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockProjectIds);
      expect(response.body.total).toBe(2);
    });
  });

  describe('GET /metadata/statistics/user', () => {
    it('should retrieve user statistics', async () => {
      const mockStats = {
        projectsWithMetadata: 5,
        totalMetadataEntries: 10,
        averageFieldCount: 3,
        mostCommonFields: [
          { field: 'category', count: 5 },
          { field: 'framework', count: 3 },
        ],
        averageSize: 150,
        maxSize: 500,
        minSize: 50,
      };

      (metadataService.getMetadataStatistics as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app.getHttpServer())
        .get('/metadata/statistics/user')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });
  });
});
