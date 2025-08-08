import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { EnhancedProjectsService } from './enhanced-projects.service';
import { ParserService } from '../parser/parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncQueueService } from './sync-queue.service';
import { PlatformRegistryService, PlatformDetectorService } from '../platforms';

describe('EnhancedProjectsService Integration', () => {
    let service: EnhancedProjectsService;

    beforeEach(async () => {
        const mockCache = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
        };

        const mockPrisma = {
            project: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockResolvedValue({}),
                groupBy: jest.fn().mockResolvedValue([]),
            },
            platformConnection: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            syncHistory: {
                create: jest.fn().mockResolvedValue({}),
                findMany: jest.fn().mockResolvedValue([]),
            },
        };

        const mockParser = {
            parseMarkdown: jest.fn().mockReturnValue({
                valid: true,
                data: { title: 'Test', description: 'Test project' },
            }),
        };

        const mockConfig = {
            get: jest.fn().mockReturnValue('test-value'),
        };

        const mockPlatformRegistry = {
            validateRepositoryUrl: jest.fn().mockReturnValue({
                isValid: true,
                platform: 'github',
                provider: {
                    fetchRepository: jest.fn(),
                    fetchPortfolioFile: jest.fn(),
                },
                parsed: { owner: 'user', repo: 'repo' },
            }),
            getProvider: jest.fn().mockReturnValue({
                fetchRepository: jest.fn(),
                fetchPortfolioFile: jest.fn(),
            }),
        };

        const mockPlatformDetector = {
            detectPlatform: jest.fn().mockReturnValue('github'),
            parseRepositoryUrl: jest.fn().mockReturnValue({
                platform: 'github',
                owner: 'user',
                repo: 'repo',
            }),
        };

        const mockSyncQueue = {
            addJob: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EnhancedProjectsService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: ParserService, useValue: mockParser },
                { provide: ConfigService, useValue: mockConfig },
                { provide: PlatformRegistryService, useValue: mockPlatformRegistry },
                { provide: PlatformDetectorService, useValue: mockPlatformDetector },
                { provide: SyncQueueService, useValue: mockSyncQueue },
                { provide: CACHE_MANAGER, useValue: mockCache },
            ],
        }).compile();

        service = module.get<EnhancedProjectsService>(EnhancedProjectsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should have queueSyncProject method', () => {
        expect(service.queueSyncProject).toBeDefined();
        expect(typeof service.queueSyncProject).toBe('function');
    });

    it('should have syncProjectFromPlatform method', () => {
        expect(service.syncProjectFromPlatform).toBeDefined();
        expect(typeof service.syncProjectFromPlatform).toBe('function');
    });

    it('should have getAllProjectsForUser method', () => {
        expect(service.getAllProjectsForUser).toBeDefined();
        expect(typeof service.getAllProjectsForUser).toBe('function');
    });

    it('should have getFilteredProjectsForUser method', () => {
        expect(service.getFilteredProjectsForUser).toBeDefined();
        expect(typeof service.getFilteredProjectsForUser).toBe('function');
    });

    it('should have getProjectsByPlatform method', () => {
        expect(service.getProjectsByPlatform).toBeDefined();
        expect(typeof service.getProjectsByPlatform).toBe('function');
    });

    it('should have getPlatformStatistics method', () => {
        expect(service.getPlatformStatistics).toBeDefined();
        expect(typeof service.getPlatformStatistics).toBe('function');
    });

    it('should have getSyncHistory method', () => {
        expect(service.getSyncHistory).toBeDefined();
        expect(typeof service.getSyncHistory).toBe('function');
    });
});