import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsResolver } from './projects.resolver';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParserService } from '../parser/parser.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('ProjectsResolver', () => {
  let resolver: ProjectsResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsResolver,
        ProjectsService,
        PrismaService,
        ParserService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    resolver = module.get<ProjectsResolver>(ProjectsResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
