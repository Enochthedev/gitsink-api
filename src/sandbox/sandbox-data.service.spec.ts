import { Test, TestingModule } from '@nestjs/testing';
import { SandboxDataService } from './sandbox-data.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SandboxDataService', () => {
  let service: SandboxDataService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    const mockPrismaService = {
      project: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      publicProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxDataService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<SandboxDataService>(SandboxDataService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTestRepositories', () => {
    it('should generate default number of repositories', () => {
      const repositories = service.generateTestRepositories();

      expect(repositories).toHaveLength(10);
      expect(repositories[0]).toHaveProperty('id');
      expect(repositories[0]).toHaveProperty('name');
      expect(repositories[0]).toHaveProperty('description');
      expect(repositories[0]).toHaveProperty('language');
      expect(repositories[0]).toHaveProperty('topics');
      expect(repositories[0]).toHaveProperty('starCount');
      expect(repositories[0]).toHaveProperty('forkCount');
      expect(repositories[0]).toHaveProperty('platform', 'github');
      expect(repositories[0]).toHaveProperty('portfolioContent');
      expect(repositories[0]).toHaveProperty('readmeContent');
      expect(repositories[0].metadata).toHaveProperty('sandbox', true);
    });

    it('should generate specified number of repositories', () => {
      const repositories = service.generateTestRepositories(5);

      expect(repositories).toHaveLength(5);
    });

    it('should generate more repositories than samples with variations', () => {
      const repositories = service.generateTestRepositories(15);

      expect(repositories).toHaveLength(15);

      // Check that we have variations (repositories with suffixes)
      const variationRepos = repositories.filter(
        repo =>
          repo.name.includes('-v2') ||
          repo.name.includes('-pro') ||
          repo.name.includes('-lite') ||
          repo.name.includes('-beta') ||
          repo.name.includes('-experimental'),
      );

      expect(variationRepos.length).toBeGreaterThan(0);
    });

    it('should generate repositories with valid data structure', () => {
      const repositories = service.generateTestRepositories(3);

      repositories.forEach(repo => {
        expect(repo.id).toBeDefined();
        expect(repo.name).toBeDefined();
        expect(repo.fullName).toMatch(/^sandbox-user\/.+/);
        expect(repo.htmlUrl).toMatch(/^https:\/\/github\.com\/sandbox-user\/.+/);
        expect(repo.cloneUrl).toMatch(/^https:\/\/github\.com\/sandbox-user\/.+\.git/);
        expect(repo.defaultBranch).toBe('main');
        expect(Array.isArray(repo.topics)).toBe(true);
        expect(typeof repo.starCount).toBe('number');
        expect(typeof repo.forkCount).toBe('number');
        expect(typeof repo.isPrivate).toBe('boolean');
        expect(repo.createdAt).toBeInstanceOf(Date);
        expect(repo.updatedAt).toBeInstanceOf(Date);
        expect(repo.pushedAt).toBeInstanceOf(Date);
        expect(repo.platform).toBe('github');
        expect(repo.portfolioContent).toBeDefined();
        expect(repo.readmeContent).toBeDefined();
        expect(repo.metadata.sandbox).toBe(true);
      });
    });

    it('should generate repositories with realistic data', () => {
      const repositories = service.generateTestRepositories(10);

      // Check that we have the expected sample repositories
      const expectedNames = [
        'awesome-react-app',
        'node-api-server',
        'python-data-analysis',
        'vue-dashboard',
        'rust-cli-tool',
        'go-microservice',
        'flutter-mobile-app',
        'java-spring-boot',
        'machine-learning-model',
        'blockchain-smart-contract',
      ];

      expectedNames.forEach(name => {
        const repo = repositories.find(r => r.name === name);
        expect(repo).toBeDefined();
      });
    });
  });

  describe('generateTestUser', () => {
    it('should generate a test user with valid data', () => {
      const user = service.generateTestUser();

      expect(user.id).toBeDefined();
      expect(user.email).toMatch(/^.+@sandbox\.example\.com$/);
      expect(user.username).toBeDefined();
      expect(user.displayName).toBeDefined();
      expect(user.avatar).toMatch(/^https:\/\/avatars\.githubusercontent\.com\/.+/);
      expect(user.bio).toBeDefined();
      expect(user.location).toBe('Sandbox City, Virtual State');
      expect(user.website).toMatch(/^https:\/\/.+\.dev$/);
      expect(typeof user.publicRepos).toBe('number');
      expect(typeof user.followers).toBe('number');
      expect(typeof user.following).toBe('number');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.metadata.sandbox).toBe(true);
    });

    it('should generate different users on multiple calls', () => {
      const user1 = service.generateTestUser();
      const user2 = service.generateTestUser();

      // While they might occasionally be the same due to randomness,
      // they should generally be different
      expect(user1.id).not.toBe(user2.id);
    });
  });

  describe('createSandboxProjects', () => {
    it('should create sandbox projects successfully', async () => {
      const repositories = service.generateTestRepositories(3);
      prismaService.project.createMany.mockResolvedValue({ count: 3 });

      await service.createSandboxProjects('user-1', repositories);

      expect(prismaService.project.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: repositories[0].name,
            description: repositories[0].description,
            tags: repositories[0].topics,
            repoUrl: repositories[0].htmlUrl,
            language: repositories[0].language,
            starCount: repositories[0].starCount,
            forkCount: repositories[0].forkCount,
            isPrivate: repositories[0].isPrivate,
            platform: repositories[0].platform,
            ownerId: 'user-1',
            customMetadata: expect.objectContaining({
              sandbox: true,
              portfolioContent: repositories[0].portfolioContent,
              readmeContent: repositories[0].readmeContent,
            }),
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should handle large batches of projects', async () => {
      const repositories = service.generateTestRepositories(25);
      prismaService.project.createMany.mockResolvedValue({ count: 25 });

      await service.createSandboxProjects('user-1', repositories);

      // Should be called multiple times due to batching (batch size is 10)
      expect(prismaService.project.createMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('createSandboxProfile', () => {
    it('should create new sandbox profile when none exists', async () => {
      const testUser = service.generateTestUser();
      prismaService.publicProfile.findUnique.mockResolvedValue(null);
      prismaService.publicProfile.create.mockResolvedValue({} as any);

      await service.createSandboxProfile('user-1', testUser);

      expect(prismaService.publicProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          username: testUser.username,
          displayName: testUser.displayName,
          bio: testUser.bio,
          avatar: testUser.avatar,
          location: testUser.location,
          website: testUser.website,
          socialLinks: expect.arrayContaining([
            expect.objectContaining({ platform: 'github' }),
            expect.objectContaining({ platform: 'twitter' }),
            expect.objectContaining({ platform: 'linkedin' }),
          ]),
          settings: expect.objectContaining({
            sandbox: true,
          }),
          isPublic: true,
        }),
      });
    });

    it('should update existing profile with sandbox flag', async () => {
      const testUser = service.generateTestUser();
      const existingProfile = {
        id: 'profile-1',
        userId: 'user-1',
        settings: { showEmail: false },
      };

      prismaService.publicProfile.findUnique.mockResolvedValue(existingProfile as any);
      prismaService.publicProfile.update.mockResolvedValue({} as any);

      await service.createSandboxProfile('user-1', testUser);

      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: {
          settings: {
            showEmail: false,
            sandbox: true,
          },
        },
      });
    });
  });

  describe('cleanupSandboxData', () => {
    it('should cleanup sandbox projects and profile', async () => {
      const sandboxProfile = {
        id: 'profile-1',
        userId: 'user-1',
        settings: { sandbox: true },
      };

      prismaService.project.deleteMany.mockResolvedValue({ count: 5 });
      prismaService.publicProfile.findUnique.mockResolvedValue(sandboxProfile as any);
      prismaService.publicProfile.delete.mockResolvedValue({} as any);

      await service.cleanupSandboxData('user-1');

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

    it('should not delete profile if not created in sandbox', async () => {
      const productionProfile = {
        id: 'profile-1',
        userId: 'user-1',
        settings: { sandbox: false },
      };

      prismaService.project.deleteMany.mockResolvedValue({ count: 3 });
      prismaService.publicProfile.findUnique.mockResolvedValue(productionProfile as any);

      await service.cleanupSandboxData('user-1');

      expect(prismaService.project.deleteMany).toHaveBeenCalled();
      expect(prismaService.publicProfile.delete).not.toHaveBeenCalled();
    });

    it('should handle case when no profile exists', async () => {
      prismaService.project.deleteMany.mockResolvedValue({ count: 2 });
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await service.cleanupSandboxData('user-1');

      expect(prismaService.project.deleteMany).toHaveBeenCalled();
      expect(prismaService.publicProfile.delete).not.toHaveBeenCalled();
    });
  });

  describe('portfolio and readme content generation', () => {
    it('should generate valid portfolio content', () => {
      const repositories = service.generateTestRepositories(1);
      const repo = repositories[0];

      expect(repo.portfolioContent).toContain(`title: "${repo.name}"`);
      expect(repo.portfolioContent).toContain(`description: "${repo.description}"`);
      expect(repo.portfolioContent).toContain(`# ${repo.name}`);
      expect(repo.portfolioContent).toContain(repo.description);
      expect(repo.portfolioContent).toContain(repo.language);
    });

    it('should generate valid readme content', () => {
      const repositories = service.generateTestRepositories(1);
      const repo = repositories[0];

      expect(repo.readmeContent).toContain(`# ${repo.name}`);
      expect(repo.readmeContent).toContain(repo.description);
      expect(repo.readmeContent).toContain('## 🚀 Quick Start');
      expect(repo.readmeContent).toContain('## 📋 Prerequisites');
      expect(repo.readmeContent).toContain('## 🛠️ Installation');
      expect(repo.readmeContent).toContain('sandbox/demo repository');
    });
  });
});
