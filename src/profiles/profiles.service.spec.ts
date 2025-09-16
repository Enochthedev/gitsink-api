import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileSettingsDto } from './dto/profile-settings.dto';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prismaService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    createdAt: new Date('2023-01-01'),
    projects: [],
  };

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    bio: 'Test bio',
    avatar: 'https://example.com/avatar.jpg',
    location: 'Test City',
    website: 'https://example.com',
    socialLinks: [{ platform: 'twitter', url: 'https://twitter.com/testuser' }],
    theme: { primaryColor: '#007bff' },
    settings: { isPublic: true, showStats: true },
    isPublic: true,
    customDomain: null,
    viewCount: 0,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
      publicProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    const createProfileDto: CreateProfileDto = {
      username: 'testuser',
      displayName: 'Test User',
      bio: 'Test bio',
      isPublic: true,
    };

    it('should create a profile successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.publicProfile.findUnique
        .mockResolvedValueOnce(null) // No existing profile
        .mockResolvedValueOnce(null); // Username not taken
      prismaService.publicProfile.create.mockResolvedValue(mockProfile);

      const result = await service.createProfile('user-1', createProfileDto);

      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('Test User');
      expect(prismaService.publicProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          username: 'testuser',
          displayName: 'Test User',
          bio: 'Test bio',
          isPublic: true,
        }),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.createProfile('user-1', createProfileDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if profile already exists', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.createProfile('user-1', createProfileDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if username is taken', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.publicProfile.findUnique
        .mockResolvedValueOnce(null) // No existing profile
        .mockResolvedValueOnce(mockProfile); // Username taken

      await expect(service.createProfile('user-1', createProfileDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if custom domain is taken', async () => {
      const dtoWithDomain = {
        ...createProfileDto,
        customDomain: 'example.com',
      };

      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.publicProfile.findUnique
        .mockResolvedValueOnce(null) // No existing profile
        .mockResolvedValueOnce(null) // Username not taken
        .mockResolvedValueOnce(mockProfile); // Domain taken

      await expect(service.createProfile('user-1', dtoWithDomain)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getProfileByUserId', () => {
    it('should return profile with stats', async () => {
      const mockUserWithProjects = {
        ...mockUser,
        projects: [
          {
            id: 'project-1',
            published: true,
            starCount: 10,
            forkCount: 5,
            language: 'TypeScript',
            languages: { TypeScript: 80, JavaScript: 20 },
            pushedAt: new Date('2023-06-01'),
            updatedAt: new Date('2023-06-01'),
            deletedAt: null,
          },
        ],
      };

      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.user.findUnique.mockResolvedValue(mockUserWithProjects);

      const result = await service.getProfileByUserId('user-1');

      expect(result).toBeDefined();
      expect(result!.username).toBe('testuser');
      expect(result!.stats).toBeDefined();
      expect(result!.stats!.totalProjects).toBe(1);
      expect(result!.stats!.publicProjects).toBe(1);
      expect(result!.stats!.totalStars).toBe(10);
      expect(result!.stats!.totalForks).toBe(5);
    });

    it('should return null if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      const result = await service.getProfileByUserId('user-1');

      expect(result).toBeNull();
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile and increment view count', async () => {
      const mockUserWithProjects = {
        ...mockUser,
        projects: [],
      };

      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.user.findUnique.mockResolvedValue(mockUserWithProjects);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.getPublicProfile('testuser');

      expect(result).toBeDefined();
      expect(result!.username).toBe('testuser');
      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('should return null if profile is not public', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      const result = await service.getPublicProfile('testuser');

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    const updateProfileDto: UpdateProfileDto = {
      displayName: 'Updated Name',
      bio: 'Updated bio',
    };

    it('should update profile successfully', async () => {
      const updatedProfile = {
        ...mockProfile,
        displayName: 'Updated Name',
        bio: 'Updated bio',
      };

      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(updatedProfile);

      const result = await service.updateProfile('user-1', updateProfileDto);

      expect(result.displayName).toBe('Updated Name');
      expect(result.bio).toBe('Updated bio');
      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          displayName: 'Updated Name',
          bio: 'Updated bio',
        }),
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('user-1', updateProfileDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if new username is taken', async () => {
      const updateWithUsername = {
        ...updateProfileDto,
        username: 'newusername',
      };

      prismaService.publicProfile.findUnique
        .mockResolvedValueOnce(mockProfile) // Existing profile
        .mockResolvedValueOnce({ ...mockProfile, id: 'other-profile' }); // Username taken

      await expect(service.updateProfile('user-1', updateWithUsername)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateProfileSettings', () => {
    const settingsDto: ProfileSettingsDto = {
      isPublic: false,
      showStats: false,
      featuredProjects: ['project-1'],
    };

    it('should update profile settings successfully', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      await service.updateProfileSettings('user-1', settingsDto);

      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          settings: expect.objectContaining({
            isPublic: false,
            showStats: false,
            featuredProjects: ['project-1'],
          }),
          isPublic: false,
        }),
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await expect(service.updateProfileSettings('user-1', settingsDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile successfully', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.delete.mockResolvedValue(mockProfile);

      await service.deleteProfile('user-1');

      expect(prismaService.publicProfile.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await expect(service.deleteProfile('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('isUsernameAvailable', () => {
    it('should return true if username is available', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      const result = await service.isUsernameAvailable('newusername');

      expect(result).toBe(true);
    });

    it('should return false if username is taken', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.isUsernameAvailable('testuser');

      expect(result).toBe(false);
    });
  });

  describe('isDomainAvailable', () => {
    it('should return true if domain is available', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      const result = await service.isDomainAvailable('newdomain.com');

      expect(result).toBe(true);
    });

    it('should return false if domain is taken', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.isDomainAvailable('example.com');

      expect(result).toBe(false);
    });
  });

  describe('searchProfiles', () => {
    it('should return matching profiles', async () => {
      const profiles = [mockProfile];
      prismaService.publicProfile.findMany.mockResolvedValue(profiles);

      const result = await service.searchProfiles('test', 20, 0);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('testuser');
      expect(prismaService.publicProfile.findMany).toHaveBeenCalledWith({
        where: {
          isPublic: true,
          OR: [
            { username: { contains: 'test', mode: 'insensitive' } },
            { displayName: { contains: 'test', mode: 'insensitive' } },
            { bio: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ viewCount: 'desc' }, { updatedAt: 'desc' }],
        take: 20,
        skip: 0,
      });
    });
  });

  describe('getFeaturedProfiles', () => {
    it('should return featured profiles ordered by view count', async () => {
      const profiles = [mockProfile];
      prismaService.publicProfile.findMany.mockResolvedValue(profiles);

      const result = await service.getFeaturedProfiles(10);

      expect(result).toHaveLength(1);
      expect(prismaService.publicProfile.findMany).toHaveBeenCalledWith({
        where: { isPublic: true },
        orderBy: [{ viewCount: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
      });
    });
  });

  describe('generateProfileUrl', () => {
    it('should generate URL with custom domain', () => {
      const result = service.generateProfileUrl('testuser', 'custom.com');
      expect(result).toBe('https://custom.com');
    });

    it('should generate URL with default domain', () => {
      process.env.APP_URL = 'https://gitsink.dev';
      const result = service.generateProfileUrl('testuser');
      expect(result).toBe('https://gitsink.dev/profile/testuser');
    });

    it('should use fallback domain if APP_URL not set', () => {
      delete process.env.APP_URL;
      const result = service.generateProfileUrl('testuser');
      expect(result).toBe('https://gitsink.dev/profile/testuser');
    });
  });
});
