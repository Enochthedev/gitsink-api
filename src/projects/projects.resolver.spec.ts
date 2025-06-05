import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsResolver } from './projects.resolver';
import { ProjectsService } from './projects.service';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheModule } from '@nestjs/cache-manager';

describe('ProjectsResolver', () => {
  let resolver: ProjectsResolver;
  let service: { getFilteredProjectsForUser: jest.Mock };

  beforeEach(async () => {
    service = { getFilteredProjectsForUser: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      providers: [
        ProjectsResolver,

        { provide: ProjectsService, useValue: service },

        ProjectsService,
        PrismaService,
        ParserService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },

      ],
    }).compile();

    resolver = module.get<ProjectsResolver>(ProjectsResolver);
    service.getFilteredProjectsForUser.mockReset();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('filteredProjects delegates to service', async () => {
    const filter = { tag: 'api' };
    service.getFilteredProjectsForUser.mockResolvedValue(['result']);
    const result = await resolver.filteredProjects(filter as any);
    expect(service.getFilteredProjectsForUser).toHaveBeenCalledWith(
      filter,
      'mock-user-id',
    );
    expect(result).toEqual(['result']);
  });
});
