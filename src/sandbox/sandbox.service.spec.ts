import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxService } from './sandbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('SandboxService', () => {
  let service: SandboxService;
  let prismaService: jest.Mocked<PrismaService>;
  let metricsService: jest.Mocked<MetricsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    settings: {},
  };

  const mockSandboxSession = {
    id: 'session-1',
    userId: 'user-1',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    projectCount: 0,
    apiCallCount: 0,
    syncOperationCount: 0,
    isActive: true,
    metadata: {
      maxProjects: 10,
      maxApiCalls: 1000,
      maxSyncOperations: 50,
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      project: {
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      publicProfile: {
        findUnique: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    const mockMetricsService = {
      createCustomCounter: jest.fn().mockReturnValue({
        inc: jest.fn(),
      }),
      createCustomHistogram: jest.fn().mockReturnValue({
        observe: jest.fn(),
      }),
      createCustomGauge: jest.fn().mockReturnValue({
        set: jest.fn(),
        remove: jest.fn(),
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          SANDBOX_ENABLED: true,
          SANDBOX_MAX_PROJECTS: 10,
          SANDBOX_MAX_API_CALLS: 1000,
          SANDBOX_MAX_SYNC_OPS: 50,
          SANDBOX_SESSION_DURATION: 24 * 60 * 60 * 1000,
          SANDBOX_DATA_RETENTION: 7 * 24 * 60 * 60 * 1000,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
    prismaService = module.get(PrismaService);
    metricsService = module.get(MetricsService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isSandboxEnabled', () => {
    it('should return true when sandbox is enabled', () => {
      expect(service.isSandboxEnabled()).toBe(true);
    });

    it('should return false when sandbox is disabled', () => {
      configService.get.mockReturnValueOnce(false);
      const disabledService = new SandboxService(prismaService, metricsService, configService);
      expect(disabledService.isSandboxEnabled()).toBe(false);
    });
  });

  describe('getSandboxConfig', () => {
    it('should return sandbox configuration', () => {
      const config = service.getSandboxConfig();
      expect(config).toEqual({
        enabled: true,
        maxProjects: 10,
        maxApiCalls: 1000,
        maxSyncOperations: 50,
        sessionDuration: 24 * 60 * 60 * 1000,
        dataRetention: 7 * 24 * 60 * 60 * 1000,
      });
    });
  });

  describe('startSandboxSession', () => {
    it('should start a new sandbox session', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });
      prismaService.user.update.mockResolvedValue(mockUser);

      const session = await service.startSandboxSession('user-1', {
        maxProjects: 5,
        maxApiCalls: 500,
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.isActive).toBe(true);
      expect(session.projectCount).toBe(0);
      expect(session.apiCallCount).toBe(0);
      expect(session.syncOperationCount).toBe(0);
    });

    it('should return existing active session', async () => {
      const existingSession = {
        ...mockSandboxSession,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...existingSession,
            startedAt: existingSession.startedAt.toISOString(),
            expiresAt: existingSession.expiresAt.toISOString(),
          },
        },
      });

      const session = await service.startSandboxSession('user-1');

      expect(session.id).toBe(existingSession.id);
      expect(session.isActive).toBe(true);
    });

    it('should throw error when sandbox is disabled', async () => {
      configService.get.mockReturnValueOnce(false);
      const disabledService = new SandboxService(prismaService, metricsService, configService);

      await expect(disabledService.startSandboxSession('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getActiveSandboxSession', () => {
    it('should return active session', async () => {
      const activeSession = {
        ...mockSandboxSession,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...activeSession,
            startedAt: activeSession.startedAt.toISOString(),
            expiresAt: activeSession.expiresAt.toISOString(),
          },
        },
      });

      const session = await service.getActiveSandboxSession('user-1');

      expect(session).toBeDefined();
      expect(session?.id).toBe(activeSession.id);
      expect(session?.isActive).toBe(true);
    });

    it('should return null for expired session', async () => {
      const expiredSession = {
        ...mockSandboxSession,
        isActive: true,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...expiredSession,
            startedAt: expiredSession.startedAt.toISOString(),
            expiresAt: expiredSession.expiresAt.toISOString(),
          },
        },
      });

      prismaService.user.update.mockResolvedValue(mockUser);

      const session = await service.getActiveSandboxSession('user-1');

      expect(session).toBeNull();
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          settings: expect.objectContaining({
            sandboxSession: expect.objectContaining({
              isActive: false,
            }),
          }),
        },
      });
    });

    it('should return null when no session exists', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });

      const session = await service.getActiveSandboxSession('user-1');

      expect(session).toBeNull();
    });
  });

  describe('getSandboxUsage', () => {
    it('should return usage statistics', async () => {
      const activeSession = {
        ...mockSandboxSession,
        projectCount: 3,
        apiCallCount: 150,
        syncOperationCount: 5,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...activeSession,
            startedAt: activeSession.startedAt.toISOString(),
            expiresAt: activeSession.expiresAt.toISOString(),
          },
        },
      });

      const usage = await service.getSandboxUsage('user-1');

      expect(usage).toBeDefined();
      expect(usage?.projectsUsed).toBe(3);
      expect(usage?.apiCallsUsed).toBe(150);
      expect(usage?.syncOperationsUsed).toBe(5);
      expect(usage?.maxProjects).toBe(10);
      expect(usage?.maxApiCalls).toBe(1000);
      expect(usage?.maxSyncOperations).toBe(50);
      expect(usage?.sessionTimeRemaining).toBeGreaterThan(0);
    });

    it('should return null when no active session', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });

      const usage = await service.getSandboxUsage('user-1');

      expect(usage).toBeNull();
    });
  });

  describe('isUserInSandboxMode', () => {
    it('should return true for user with active session', async () => {
      const activeSession = {
        ...mockSandboxSession,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...activeSession,
            startedAt: activeSession.startedAt.toISOString(),
            expiresAt: activeSession.expiresAt.toISOString(),
          },
        },
      });

      const isInSandbox = await service.isUserInSandboxMode('user-1');

      expect(isInSandbox).toBe(true);
    });

    it('should return false for user without active session', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });

      const isInSandbox = await service.isUserInSandboxMode('user-1');

      expect(isInSandbox).toBe(false);
    });
  });

  describe('incrementProjectCount', () => {
    it('should increment project count', async () => {
      const activeSession = {
        ...mockSandboxSession,
        projectCount: 5,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique
        .mockResolvedValueOnce({
          ...mockUser,
          settings: {
            sandboxSession: {
              ...activeSession,
              startedAt: activeSession.startedAt.toISOString(),
              expiresAt: activeSession.expiresAt.toISOString(),
            },
          },
        })
        .mockResolvedValueOnce({
          ...mockUser,
          settings: {
            sandboxSession: {
              ...activeSession,
              startedAt: activeSession.startedAt.toISOString(),
              expiresAt: activeSession.expiresAt.toISOString(),
            },
          },
        });

      prismaService.user.update.mockResolvedValue(mockUser);

      await service.incrementProjectCount('user-1');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          settings: expect.objectContaining({
            sandboxSession: expect.objectContaining({
              projectCount: 6,
            }),
          }),
        },
      });
    });

    it('should throw error when project limit reached', async () => {
      const activeSession = {
        ...mockSandboxSession,
        projectCount: 10, // At limit
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: {
            ...activeSession,
            startedAt: activeSession.startedAt.toISOString(),
            expiresAt: activeSession.expiresAt.toISOString(),
          },
        },
      });

      await expect(service.incrementProjectCount('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should do nothing when user not in sandbox', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });

      await service.incrementProjectCount('user-1');

      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resetSandboxData', () => {
    it('should reset sandbox data successfully', async () => {
      const activeSession = {
        ...mockSandboxSession,
        projectCount: 5,
        apiCallCount: 100,
        syncOperationCount: 10,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      prismaService.user.findUnique
        .mockResolvedValueOnce({
          ...mockUser,
          settings: {
            sandboxSession: {
              ...activeSession,
              startedAt: activeSession.startedAt.toISOString(),
              expiresAt: activeSession.expiresAt.toISOString(),
            },
          },
        })
        .mockResolvedValueOnce({
          ...mockUser,
          settings: {
            sandboxSession: {
              ...activeSession,
              startedAt: activeSession.startedAt.toISOString(),
              expiresAt: activeSession.expiresAt.toISOString(),
            },
          },
        });

      prismaService.user.update.mockResolvedValue(mockUser);
      prismaService.project.deleteMany.mockResolvedValue({ count: 5 });
      prismaService.publicProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        settings: { sandbox: true },
      });
      prismaService.publicProfile.delete.mockResolvedValue({} as any);

      await service.resetSandboxData('user-1');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          settings: expect.objectContaining({
            sandboxSession: expect.objectContaining({
              projectCount: 0,
              apiCallCount: 0,
              syncOperationCount: 0,
            }),
          }),
        },
      });

      expect(prismaService.project.deleteMany).toHaveBeenCalledWith({
        where: {
          ownerId: 'user-1',
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });

      expect(prismaService.publicProfile.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should throw error when no active session', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {},
      });

      await expect(service.resetSandboxData('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('endSandboxSession', () => {
    it('should end sandbox session successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: {
          sandboxSession: mockSandboxSession,
        },
      });
      prismaService.user.update.mockResolvedValue(mockUser);

      await service.endSandboxSession('user-1');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          settings: expect.objectContaining({
            sandboxSession: expect.objectContaining({
              isActive: false,
            }),
          }),
        },
      });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const expiredSession = {
        ...mockSandboxSession,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      };

      prismaService.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          settings: {
            sandboxSession: {
              ...expiredSession,
              startedAt: expiredSession.startedAt.toISOString(),
              expiresAt: expiredSession.expiresAt.toISOString(),
              isActive: true,
            },
          },
        },
      ]);

      prismaService.user.update.mockResolvedValue(mockUser);

      const cleanedCount = await service.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          settings: expect.objectContaining({
            sandboxSession: expect.objectContaining({
              isActive: false,
            }),
          }),
        },
      });
    });

    it('should not cleanup active sessions', async () => {
      const activeSession = {
        ...mockSandboxSession,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      prismaService.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          settings: {
            sandboxSession: {
              ...activeSession,
              startedAt: activeSession.startedAt.toISOString(),
              expiresAt: activeSession.expiresAt.toISOString(),
              isActive: true,
            },
          },
        },
      ]);

      const cleanedCount = await service.cleanupExpiredSessions();

      expect(cleanedCount).toBe(0);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
