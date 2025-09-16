import { Test, TestingModule } from '@nestjs/testing';
import { SyncHistoryService, SyncOperation, ChangeRecord } from './sync-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditAction, AuditResource } from './interfaces/audit.interface';

describe('SyncHistoryService', () => {
  let service: SyncHistoryService;
  let prisma: jest.Mocked<PrismaService>;
  let auditService: jest.Mocked<AuditService>;

  const mockSyncHistory = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    projectId: 'project-456',
    operation: 'sync',
    platform: 'github',
    repositoryUrl: 'https://github.com/user/repo',
    status: 'started',
    changes: '[]',
    metadata: '{}',
    error: null,
    startedAt: new Date('2024-01-01T10:00:00Z'),
    completedAt: null,
    duration: null,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
    project: {
      id: 'project-456',
      title: 'Test Project',
      repoUrl: 'https://github.com/user/repo',
    },
  };

  beforeEach(async () => {
    const mockPrisma = {
      syncHistory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
    } as any;

    const mockAuditService = {
      logUserAction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncHistoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<SyncHistoryService>(SyncHistoryService);
    prisma = module.get(PrismaService);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startSyncOperation', () => {
    it('should start a sync operation successfully', async () => {
      const operation: Omit<SyncOperation, 'id' | 'status' | 'startedAt'> = {
        userId: 'user-123',
        projectId: 'project-456',
        operation: 'sync',
        platform: 'github',
        repositoryUrl: 'https://github.com/user/repo',
        metadata: { source: 'webhook' },
      };

      prisma.syncHistory.create.mockResolvedValue(mockSyncHistory);

      const syncId = await service.startSyncOperation(operation);

      expect(syncId).toBe(mockSyncHistory.id);
      expect(prisma.syncHistory.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          projectId: 'project-456',
          operation: 'sync',
          platform: 'github',
          repositoryUrl: 'https://github.com/user/repo',
          status: 'started',
          changes: JSON.stringify([]),
          metadata: JSON.stringify({ source: 'webhook' }),
          startedAt: expect.any(Date),
        },
      });

      expect(auditService.logUserAction).toHaveBeenCalledWith(
        'user-123',
        AuditAction.PROJECT_SYNCED,
        AuditResource.SYNC_OPERATION,
        mockSyncHistory.id,
        {
          operation: 'sync',
          platform: 'github',
          repositoryUrl: 'https://github.com/user/repo',
          projectId: 'project-456',
        },
      );
    });

    it('should handle missing optional fields', async () => {
      const operation: Omit<SyncOperation, 'id' | 'status' | 'startedAt'> = {
        userId: 'user-123',
        operation: 'create',
        platform: 'github',
        repositoryUrl: 'https://github.com/user/repo',
      };

      prisma.syncHistory.create.mockResolvedValue(mockSyncHistory);

      await service.startSyncOperation(operation);

      expect(prisma.syncHistory.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          projectId: undefined,
          operation: 'create',
          platform: 'github',
          repositoryUrl: 'https://github.com/user/repo',
          status: 'started',
          changes: JSON.stringify([]),
          metadata: JSON.stringify({}),
          startedAt: expect.any(Date),
        },
      });
    });

    it('should throw error when database operation fails', async () => {
      const operation: Omit<SyncOperation, 'id' | 'status' | 'startedAt'> = {
        userId: 'user-123',
        operation: 'sync',
        platform: 'github',
        repositoryUrl: 'https://github.com/user/repo',
      };

      prisma.syncHistory.create.mockRejectedValue(new Error('Database error'));

      await expect(service.startSyncOperation(operation)).rejects.toThrow('Database error');
    });
  });

  describe('completeSyncOperation', () => {
    it('should complete a sync operation successfully', async () => {
      const changes: ChangeRecord[] = [
        {
          field: 'title',
          oldValue: 'Old Title',
          newValue: 'New Title',
          changeType: 'updated',
        },
      ];
      const metadata = { updatedFields: ['title'] };

      prisma.syncHistory.findUnique.mockResolvedValue(mockSyncHistory);
      prisma.syncHistory.update.mockResolvedValue({
        ...mockSyncHistory,
        status: 'completed',
        completedAt: new Date(),
        duration: 5000,
      });

      await service.completeSyncOperation(mockSyncHistory.id, changes, metadata);

      expect(prisma.syncHistory.findUnique).toHaveBeenCalledWith({
        where: { id: mockSyncHistory.id },
      });

      expect(prisma.syncHistory.update).toHaveBeenCalledWith({
        where: { id: mockSyncHistory.id },
        data: {
          status: 'completed',
          changes: JSON.stringify(changes),
          metadata: JSON.stringify(metadata),
          completedAt: expect.any(Date),
          duration: expect.any(Number),
        },
      });

      expect(auditService.logUserAction).toHaveBeenCalledWith(
        mockSyncHistory.userId,
        AuditAction.PROJECT_SYNCED,
        AuditResource.SYNC_OPERATION,
        mockSyncHistory.id,
        expect.objectContaining({
          operation: mockSyncHistory.operation,
          platform: mockSyncHistory.platform,
          status: 'completed',
          changesCount: 1,
        }),
        { success: true },
      );
    });

    it('should throw error when sync operation not found', async () => {
      prisma.syncHistory.findUnique.mockResolvedValue(null);

      await expect(service.completeSyncOperation('non-existent-id')).rejects.toThrow(
        'Sync operation not found: non-existent-id',
      );
    });
  });

  describe('failSyncOperation', () => {
    it('should mark a sync operation as failed', async () => {
      const error = 'Repository not found';
      const metadata = { httpStatus: 404 };

      prisma.syncHistory.findUnique.mockResolvedValue(mockSyncHistory);
      prisma.syncHistory.update.mockResolvedValue({
        ...mockSyncHistory,
        status: 'failed',
        error,
        completedAt: new Date(),
        duration: 3000,
      });

      await service.failSyncOperation(mockSyncHistory.id, error, metadata);

      expect(prisma.syncHistory.update).toHaveBeenCalledWith({
        where: { id: mockSyncHistory.id },
        data: {
          status: 'failed',
          error,
          metadata: JSON.stringify(metadata),
          completedAt: expect.any(Date),
          duration: expect.any(Number),
        },
      });

      expect(auditService.logUserAction).toHaveBeenCalledWith(
        mockSyncHistory.userId,
        AuditAction.PROJECT_SYNCED,
        AuditResource.SYNC_OPERATION,
        mockSyncHistory.id,
        expect.objectContaining({
          status: 'failed',
          error,
        }),
        { success: false, error },
      );
    });
  });

  describe('getSyncHistory', () => {
    it('should return sync history with pagination', async () => {
      const filters = {
        userId: 'user-123',
        limit: 10,
        offset: 0,
        orderBy: 'startedAt' as const,
        orderDirection: 'desc' as const,
      };

      prisma.syncHistory.count.mockResolvedValue(25);
      prisma.syncHistory.findMany.mockResolvedValue([mockSyncHistory]);

      const result = await service.getSyncHistory(filters);

      expect(result).toEqual({
        history: [
          expect.objectContaining({
            id: mockSyncHistory.id,
            userId: mockSyncHistory.userId,
            operation: mockSyncHistory.operation,
            platform: mockSyncHistory.platform,
            status: mockSyncHistory.status,
          }),
        ],
        totalCount: 25,
        hasNextPage: true,
        hasPreviousPage: false,
      });

      expect(prisma.syncHistory.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { startedAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
          project: {
            select: {
              id: true,
              title: true,
              repoUrl: true,
            },
          },
        },
      });
    });

    it('should handle multiple filters', async () => {
      const filters = {
        userId: 'user-123',
        operation: ['sync', 'update'],
        platform: ['github', 'gitlab'],
        status: ['completed'],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 50,
        offset: 0,
      };

      prisma.syncHistory.count.mockResolvedValue(5);
      prisma.syncHistory.findMany.mockResolvedValue([mockSyncHistory]);

      await service.getSyncHistory(filters);

      expect(prisma.syncHistory.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          operation: { in: ['sync', 'update'] },
          platform: { in: ['github', 'gitlab'] },
          status: { in: ['completed'] },
          startedAt: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-01-31'),
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: 0,
        take: 50,
        include: expect.any(Object),
      });
    });
  });

  describe('getSyncHistoryStats', () => {
    it('should return sync history statistics', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      prisma.syncHistory.count
        .mockResolvedValueOnce(100) // total operations
        .mockResolvedValueOnce(90) // successful operations
        .mockResolvedValueOnce(10); // failed operations

      prisma.syncHistory.aggregate.mockResolvedValue({
        _avg: { duration: 5000 },
      });

      prisma.syncHistory.groupBy
        .mockResolvedValueOnce([
          // platform stats
          { platform: 'github', _count: 80 },
          { platform: 'gitlab', _count: 20 },
        ])
        .mockResolvedValueOnce([
          // operation stats
          { operation: 'sync', _count: 70 },
          { operation: 'create', _count: 30 },
        ]);

      // Mock additional count calls for success rates
      prisma.syncHistory.count
        .mockResolvedValueOnce(75) // github success count
        .mockResolvedValueOnce(15) // gitlab success count
        .mockResolvedValueOnce(65) // sync success count
        .mockResolvedValueOnce(25); // create success count

      prisma.syncHistory.findMany.mockResolvedValue([
        {
          id: 'failure-1',
          operation: 'sync',
          platform: 'github',
          error: 'Network timeout',
          startedAt: new Date(),
        },
      ]);

      const result = await service.getSyncHistoryStats('user-123', startDate, endDate);

      expect(result).toEqual({
        totalOperations: 100,
        successfulOperations: 90,
        failedOperations: 10,
        averageDuration: 5000,
        operationsByPlatform: [
          { platform: 'github', count: 80, successRate: 93.75 },
          { platform: 'gitlab', count: 20, successRate: 75 },
        ],
        operationsByType: [
          { operation: 'sync', count: 70, successRate: 92.86 },
          { operation: 'create', count: 30, successRate: 83.33 },
        ],
        recentFailures: [
          {
            id: 'failure-1',
            operation: 'sync',
            platform: 'github',
            error: 'Network timeout',
            startedAt: expect.any(Date),
          },
        ],
      });
    });
  });

  describe('detectProjectChanges', () => {
    it('should detect changes between old and new project data', async () => {
      const oldProject = {
        title: 'Old Title',
        description: 'Old description',
        starCount: 10,
        tags: ['old-tag'],
      };

      const newProject = {
        title: 'New Title',
        description: 'Old description',
        starCount: 15,
        tags: ['old-tag', 'new-tag'],
        category: 'web-app', // new field
      };

      const changes = service.detectProjectChanges(oldProject, newProject);

      expect(changes).toEqual([
        {
          field: 'title',
          oldValue: 'Old Title',
          newValue: 'New Title',
          changeType: 'updated',
        },
        {
          field: 'starCount',
          oldValue: 10,
          newValue: 15,
          changeType: 'updated',
        },
        {
          field: 'tags',
          oldValue: ['old-tag'],
          newValue: ['old-tag', 'new-tag'],
          changeType: 'updated',
        },
        {
          field: 'category',
          oldValue: undefined,
          newValue: 'web-app',
          changeType: 'created',
        },
      ]);
    });

    it('should detect deleted fields', async () => {
      const oldProject = {
        title: 'Title',
        description: 'Description to be deleted',
      };

      const newProject = {
        title: 'Title',
        description: null,
      };

      const changes = service.detectProjectChanges(oldProject, newProject);

      expect(changes).toEqual([
        {
          field: 'description',
          oldValue: 'Description to be deleted',
          newValue: null,
          changeType: 'deleted',
        },
      ]);
    });

    it('should return empty array when no changes detected', async () => {
      const project = {
        title: 'Same Title',
        description: 'Same description',
        starCount: 10,
      };

      const changes = service.detectProjectChanges(project, project);

      expect(changes).toEqual([]);
    });
  });

  describe('analyzeSyncFailures', () => {
    it('should analyze sync failures and return patterns', async () => {
      prisma.syncHistory.count.mockResolvedValue(50); // total failures

      prisma.syncHistory.groupBy
        .mockResolvedValueOnce([
          // failures by platform
          { platform: 'github', _count: 30 },
          { platform: 'gitlab', _count: 20 },
        ])
        .mockResolvedValueOnce([
          // failures by operation
          { operation: 'sync', _count: 35 },
          { operation: 'create', _count: 15 },
        ])
        .mockResolvedValueOnce([
          // failures by error
          { error: 'Network timeout', _count: 20 },
          { error: 'Repository not found', _count: 15 },
        ]);

      prisma.$queryRaw.mockResolvedValue([
        { date: new Date('2024-01-01'), count: BigInt(5) },
        { date: new Date('2024-01-02'), count: BigInt(3) },
      ]);

      const result = await service.analyzeSyncFailures('user-123');

      expect(result).toEqual({
        totalFailures: 50,
        failuresByPlatform: [
          { platform: 'github', count: 30, percentage: 60 },
          { platform: 'gitlab', count: 20, percentage: 40 },
        ],
        failuresByOperation: [
          { operation: 'sync', count: 35, percentage: 70 },
          { operation: 'create', count: 15, percentage: 30 },
        ],
        commonErrors: [
          { error: 'Network timeout', count: 20, percentage: 40 },
          { error: 'Repository not found', count: 15, percentage: 30 },
        ],
        failureTrends: [
          { date: '2024-01-01', count: 5 },
          { date: '2024-01-02', count: 3 },
        ],
      });
    });

    it('should handle zero failures', async () => {
      prisma.syncHistory.count.mockResolvedValue(0);

      const result = await service.analyzeSyncFailures('user-123');

      expect(result).toEqual({
        totalFailures: 0,
        failuresByPlatform: [],
        failuresByOperation: [],
        commonErrors: [],
        failureTrends: [],
      });
    });
  });
});
