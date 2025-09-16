import { Test, TestingModule } from '@nestjs/testing';
import { GracefulShutdownService, ShutdownHook } from './graceful-shutdown.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from '../../health/health.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getQueueToken } from '@nestjs/bullmq';

describe('GracefulShutdownService', () => {
    let service: GracefulShutdownService;
    let prismaService: PrismaService;
    let healthService: HealthService;
    let cacheManager: any;
    let syncQueue: any;
    let emailQueue: any;

    const mockPrismaService = {
        $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const mockHealthService = {};

    const mockCacheManager = {
        close: jest.fn().mockResolvedValue(undefined),
    };

    const mockQueue = {
        close: jest.fn().mockResolvedValue(undefined),
        getWaiting: jest.fn().mockResolvedValue([]),
        getActive: jest.fn().mockResolvedValue([]),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GracefulShutdownService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: HealthService,
                    useValue: mockHealthService,
                },
                {
                    provide: CACHE_MANAGER,
                    useValue: mockCacheManager,
                },
                {
                    provide: getQueueToken('sync'),
                    useValue: mockQueue,
                },
                {
                    provide: getQueueToken('email'),
                    useValue: mockQueue,
                },
            ],
        }).compile();

        service = module.get<GracefulShutdownService>(GracefulShutdownService);
        prismaService = module.get<PrismaService>(PrismaService);
        healthService = module.get<HealthService>(HealthService);
        cacheManager = module.get(CACHE_MANAGER);
        syncQueue = module.get(getQueueToken('sync'));
        emailQueue = module.get(getQueueToken('email'));

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('registerHook', () => {
        it('should register a shutdown hook', () => {
            const hook: ShutdownHook = {
                name: 'test-hook',
                priority: 10,
                timeout: 5000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            service.registerHook(hook);

            const status = service.getShutdownStatus();
            expect(status.hooks.some(h => h.name === 'test-hook')).toBe(true);
        });

        it('should sort hooks by priority', () => {
            const hook1: ShutdownHook = {
                name: 'hook-1',
                priority: 5,
                timeout: 5000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            const hook2: ShutdownHook = {
                name: 'hook-2',
                priority: 1,
                timeout: 5000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            service.registerHook(hook1);
            service.registerHook(hook2);

            const status = service.getShutdownStatus();
            const hookNames = status.hooks.map(h => h.name);

            // hook-2 should come before hook-1 due to lower priority number
            expect(hookNames.indexOf('hook-2')).toBeLessThan(hookNames.indexOf('hook-1'));
        });
    });

    describe('isApplicationShuttingDown', () => {
        it('should return false initially', () => {
            expect(service.isApplicationShuttingDown()).toBe(false);
        });
    });

    describe('getShutdownStatus', () => {
        it('should return shutdown status information', () => {
            const status = service.getShutdownStatus();

            expect(status).toHaveProperty('isShuttingDown');
            expect(status).toHaveProperty('registeredHooks');
            expect(status).toHaveProperty('hooks');
            expect(Array.isArray(status.hooks)).toBe(true);
        });

        it('should include default hooks', () => {
            const status = service.getShutdownStatus();

            const hookNames = status.hooks.map(h => h.name);
            expect(hookNames).toContain('stop-accepting-requests');
            expect(hookNames).toContain('close-database');
            expect(hookNames).toContain('close-cache');
            expect(hookNames).toContain('final-cleanup');
        });
    });

    describe('addShutdownHook', () => {
        it('should add a custom shutdown hook', () => {
            const customHook: ShutdownHook = {
                name: 'custom-cleanup',
                priority: 7,
                timeout: 3000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            service.addShutdownHook(customHook);

            const status = service.getShutdownStatus();
            expect(status.hooks.some(h => h.name === 'custom-cleanup')).toBe(true);
        });
    });

    describe('onApplicationShutdown', () => {
        it('should handle application shutdown signal', async () => {
            const spy = jest.spyOn(service as any, 'initiateShutdown').mockImplementation(() => { });

            await service.onApplicationShutdown('SIGTERM');

            expect(spy).toHaveBeenCalledWith('SIGTERM');
        });

        it('should not initiate shutdown if already shutting down', async () => {
            // Set the service to shutting down state
            (service as any).isShuttingDown = true;

            const spy = jest.spyOn(service as any, 'initiateShutdown').mockImplementation(() => { });

            await service.onApplicationShutdown('SIGTERM');

            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('default shutdown hooks', () => {
        it('should execute database disconnect hook', async () => {
            const hooks = (service as any).shutdownHooks;
            const dbHook = hooks.find((h: ShutdownHook) => h.name === 'close-database');

            expect(dbHook).toBeDefined();

            await dbHook.execute();

            expect(mockPrismaService.$disconnect).toHaveBeenCalled();
        });

        it('should execute cache close hook', async () => {
            const hooks = (service as any).shutdownHooks;
            const cacheHook = hooks.find((h: ShutdownHook) => h.name === 'close-cache');

            expect(cacheHook).toBeDefined();

            await cacheHook.execute();

            expect(mockCacheManager.close).toHaveBeenCalled();
        });

        it('should execute queue stop hook', async () => {
            const hooks = (service as any).shutdownHooks;
            const queueHook = hooks.find((h: ShutdownHook) => h.name === 'stop-queue-workers');

            expect(queueHook).toBeDefined();

            await queueHook.execute();

            expect(syncQueue.close).toHaveBeenCalled();
            expect(emailQueue.close).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle hook execution errors gracefully', async () => {
            const failingHook: ShutdownHook = {
                name: 'failing-hook',
                priority: 1,
                timeout: 1000,
                execute: jest.fn().mockRejectedValue(new Error('Hook failed')),
            };

            service.registerHook(failingHook);

            // This should not throw even though the hook fails
            await expect((service as any).runGracefulShutdown()).resolves.not.toThrow();
        });

        it('should handle hook timeout', async () => {
            const slowHook: ShutdownHook = {
                name: 'slow-hook',
                priority: 1,
                timeout: 100, // Very short timeout
                execute: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000))),
            };

            service.registerHook(slowHook);

            // Should complete despite the slow hook timing out
            await expect((service as any).runGracefulShutdown()).resolves.not.toThrow();
        });
    });

    describe('emergency shutdown', () => {
        it('should only run critical hooks during emergency shutdown', async () => {
            const criticalHook: ShutdownHook = {
                name: 'close-database',
                priority: 1,
                timeout: 1000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            const nonCriticalHook: ShutdownHook = {
                name: 'non-critical-cleanup',
                priority: 2,
                timeout: 1000,
                execute: jest.fn().mockResolvedValue(undefined),
            };

            service.registerHook(criticalHook);
            service.registerHook(nonCriticalHook);

            await (service as any).runEmergencyShutdown();

            expect(criticalHook.execute).toHaveBeenCalled();
            expect(nonCriticalHook.execute).not.toHaveBeenCalled();
        });
    });
});