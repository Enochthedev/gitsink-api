import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MetadataService } from './metadata.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MetadataService', () => {
  let service: MetadataService;
  let prismaService: PrismaService;
  let cacheManager: any;

  beforeEach(async () => {
    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockPrismaService = {
      $queryRawUnsafe: jest.fn(),
      $queryRaw: jest.fn(),
      customMetadata: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      project: {
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
    prismaService = module.get<PrismaService>(PrismaService);
    cacheManager = module.get(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchByMetadata', () => {
    it('should handle equals operator with raw query', async () => {
      const mockProjects = [{ id: 'project1' }, { id: 'project2' }];
      (prismaService.$queryRawUnsafe as jest.Mock).mockResolvedValue(mockProjects);

      const result = await service.searchByMetadata('user1', {
        field: 'category',
        value: 'web',
        operator: 'equals',
      });

      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith(
        `SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata"->>'category' = $2`,
        'user1',
        'web',
      );
      expect(result).toEqual(['project1', 'project2']);
    });

    it('should handle in operator with raw query', async () => {
      const mockProjects = [{ id: 'project1' }];
      (prismaService.$queryRawUnsafe as jest.Mock).mockResolvedValue(mockProjects);

      const result = await service.searchByMetadata('user1', {
        field: 'tags',
        value: ['react', 'typescript'],
        operator: 'in',
      });

      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith(
        `SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata"->>'tags' IN ($2,$3)`,
        'user1',
        'react',
        'typescript',
      );
      expect(result).toEqual(['project1']);
    });

    it('should handle exists operator with raw query', async () => {
      const mockProjects = [{ id: 'project1' }];
      (prismaService.$queryRawUnsafe as jest.Mock).mockResolvedValue(mockProjects);

      const result = await service.searchByMetadata('user1', {
        field: 'customField',
        value: true,
        operator: 'exists',
      });

      expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith(
        `SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata" ? $2`,
        'user1',
        'customField',
      );
      expect(result).toEqual(['project1']);
    });

    it('should handle contains operator for strings', async () => {
      const mockProjects = [{ id: 'project1' }];
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue(mockProjects);

      const result = await service.searchByMetadata('user1', {
        field: 'description',
        value: 'awesome',
        operator: 'contains',
        dataType: 'string',
      });

      expect(result).toEqual(['project1']);
    });

    it('should handle numeric comparison operators', async () => {
      const mockProjects = [{ id: 'project1' }];
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue(mockProjects);

      const result = await service.searchByMetadata('user1', {
        field: 'priority',
        value: 5,
        operator: 'gt',
        dataType: 'number',
      });

      expect(result).toEqual(['project1']);
    });

    it('should return empty array for unsupported operators', async () => {
      const result = await service.searchByMetadata('user1', {
        field: 'field',
        value: 'value',
        operator: 'unsupported' as any,
      });

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      (prismaService.$queryRawUnsafe as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        service.searchByMetadata('user1', {
          field: 'category',
          value: 'web',
          operator: 'equals',
        }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('storeCustomMetadata', () => {
    it('should store metadata with versioning', async () => {
      const mockMetadata = { category: 'web', framework: 'react' };
      const mockEntry = {
        id: 'entry1',
        projectId: 'project1',
        userId: 'user1',
        version: 1,
        metadata: mockMetadata,
        hash: 'hash123',
        size: 100,
        fieldCount: 2,
        createdAt: new Date(),
      };

      (prismaService.customMetadata.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaService.customMetadata.create as jest.Mock).mockResolvedValue(mockEntry);
      (prismaService.project.update as jest.Mock).mockResolvedValue({});

      const result = await service.storeCustomMetadata('project1', mockMetadata, 'user1');

      expect(result).toEqual(mockEntry);
      expect(prismaService.customMetadata.create).toHaveBeenCalled();
      expect(prismaService.project.update).toHaveBeenCalled();
    });

    it('should validate metadata before storing', async () => {
      const invalidMetadata = { id: 'reserved-field' }; // Using reserved field

      await expect(
        service.storeCustomMetadata('project1', invalidMetadata, 'user1'),
      ).rejects.toThrow('Metadata validation failed');
    });
  });

  describe('getCustomMetadata', () => {
    it('should retrieve metadata from cache if available', async () => {
      const mockMetadata = {
        id: 'entry1',
        projectId: 'project1',
        userId: 'user1',
        version: 1,
        metadata: { category: 'web' },
        hash: 'hash123',
        size: 100,
        fieldCount: 1,
        createdAt: new Date(),
      };

      (cacheManager.get as jest.Mock).mockResolvedValue(mockMetadata);

      const result = await service.getCustomMetadata('project1');

      expect(result).toEqual(mockMetadata);
      expect(cacheManager.get).toHaveBeenCalledWith('metadata:project1:latest');
      expect(prismaService.customMetadata.findFirst).not.toHaveBeenCalled();
    });

    it('should retrieve metadata from database if not cached', async () => {
      const mockEntry = {
        id: 'entry1',
        projectId: 'project1',
        userId: 'user1',
        version: 1,
        metadata: { category: 'web' },
        hash: 'hash123',
        size: 100,
        fieldCount: 1,
        createdAt: new Date(),
      };

      (cacheManager.get as jest.Mock).mockResolvedValue(null);
      (prismaService.customMetadata.findFirst as jest.Mock).mockResolvedValue(mockEntry);

      const result = await service.getCustomMetadata('project1');

      expect(result).toBeDefined();
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });
});
