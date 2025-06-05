import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParserService } from '../parser/parser.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheModule } from '@nestjs/cache-manager';


describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: { project: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { project: { findMany: jest.fn().mockResolvedValue([]) } };
    const module: TestingModule = await Test.createTestingModule({

      providers: [ProjectsService, PrismaService, ParserService, ConfigService],

      imports: [CacheModule.register()],
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ParserService, useValue: {} },
        { provide: ConfigService, useValue: {} },

        PrismaService,
        ParserService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },

      ],


    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('filters by tag only', async () => {
    await service.getFilteredProjectsForUser({ tag: 'api' }, 'user1');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user1', tags: { has: 'api' } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('filters by category and featured', async () => {
    await service.getFilteredProjectsForUser(
      { category: 'web', featured: true },
      'user1',
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user1', category: 'web', featured: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('handles empty filter', async () => {
    await service.getFilteredProjectsForUser({}, 'user1');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user1' },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
