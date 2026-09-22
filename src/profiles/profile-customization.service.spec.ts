import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfileCustomizationService } from './profile-customization.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProfileCustomizationService', () => {
  let service: ProfileCustomizationService;
  let prismaService: any;

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    username: 'testuser',
    theme: { primaryColor: '#007bff', secondaryColor: '#6c757d' },
    socialLinks: [{ platform: 'github', url: 'https://github.com/testuser' }],
    settings: { customSections: [] },
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    createdAt: new Date('2023-01-01'),
    projects: [
      {
        id: 'project-1',
        title: 'Test Project',
        published: true,
        starCount: 10,
        forkCount: 5,
        language: 'TypeScript',
        languages: { TypeScript: 80, JavaScript: 20 },
        pushedAt: new Date('2023-06-01'),
        updatedAt: new Date('2023-06-01'),
        deletedAt: null,
        isPrivate: false,
      },
    ],
  };

  beforeEach(async () => {
    const mockPrismaService = {
      publicProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileCustomizationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProfileCustomizationService>(ProfileCustomizationService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getThemePresets', () => {
    it('should return available theme presets', () => {
      const presets = service.getThemePresets();

      expect(presets).toHaveLength(6);
      expect(presets[0]).toEqual({
        name: 'default',
        displayName: 'Default',
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        backgroundStyle: 'solid',
        fontFamily: 'Inter, sans-serif',
      });
      expect(presets.find(p => p.name === 'dark')).toBeDefined();
      expect(presets.find(p => p.name === 'minimal')).toBeDefined();
    });
  });

  describe('applyThemePreset', () => {
    it('should apply a theme preset successfully', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.applyThemePreset('user-1', 'dark');

      expect(result).toEqual({
        primaryColor: '#17a2b8',
        secondaryColor: '#495057',
        backgroundStyle: 'gradient-dark',
        fontFamily: 'Inter, sans-serif',
      });
      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { theme: expect.any(Object) },
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await expect(service.applyThemePreset('user-1', 'dark')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid preset', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.applyThemePreset('user-1', 'invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateTheme', () => {
    it('should update theme successfully', async () => {
      const themeUpdate = {
        primaryColor: '#ff0000',
        fontFamily: 'Arial, sans-serif',
      };
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.updateTheme('user-1', themeUpdate);

      expect(result).toEqual({
        primaryColor: '#ff0000',
        secondaryColor: '#6c757d',
        fontFamily: 'Arial, sans-serif',
      });
      expect(prismaService.publicProfile.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid color format', async () => {
      const themeUpdate = { primaryColor: 'invalid-color' };
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateTheme('user-1', themeUpdate)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(null);

      await expect(service.updateTheme('user-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSocialLinks', () => {
    it('should update social links successfully', async () => {
      const socialLinks = [
        { platform: 'github', url: 'https://github.com/newuser' },
        { platform: 'twitter', url: 'https://twitter.com/newuser' },
      ];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.updateSocialLinks('user-1', socialLinks);

      expect(result).toEqual(socialLinks);
      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { socialLinks: socialLinks },
      });
    });

    it('should remove duplicate platforms', async () => {
      const socialLinks = [
        { platform: 'github', url: 'https://github.com/user1' },
        { platform: 'github', url: 'https://github.com/user2' }, // Duplicate
        { platform: 'twitter', url: 'https://twitter.com/user' },
      ];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.updateSocialLinks('user-1', socialLinks);

      expect(result).toHaveLength(2);
      expect(result.find(l => l.platform === 'github')?.url).toBe('https://github.com/user2');
    });

    it('should throw BadRequestException for invalid URL', async () => {
      const socialLinks = [{ platform: 'github', url: 'invalid-url' }];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateSocialLinks('user-1', socialLinks)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for unsupported platform', async () => {
      const socialLinks = [{ platform: 'unsupported', url: 'https://example.com' }];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateSocialLinks('user-1', socialLinks)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('addSocialLink', () => {
    it('should add a new social link', async () => {
      const newLink = {
        platform: 'twitter',
        url: 'https://twitter.com/testuser',
      };
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.addSocialLink('user-1', newLink);

      expect(result).toHaveLength(2);
      expect(result.find(l => l.platform === 'twitter')).toEqual(newLink);
    });

    it('should replace existing link for same platform', async () => {
      const updatedLink = {
        platform: 'github',
        url: 'https://github.com/newuser',
      };
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.addSocialLink('user-1', updatedLink);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(updatedLink);
    });
  });

  describe('removeSocialLink', () => {
    it('should remove a social link', async () => {
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      const result = await service.removeSocialLink('user-1', 'github');

      expect(result).toHaveLength(0);
      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { socialLinks: [] },
      });
    });
  });

  describe('updateCustomSections', () => {
    it('should update custom sections successfully', async () => {
      const customSections = [
        {
          title: 'About Me',
          content: 'I am a developer',
          order: 1,
          visible: true,
        },
        {
          title: 'Skills',
          content: 'TypeScript, React',
          order: 2,
          visible: true,
        },
      ];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);
      prismaService.publicProfile.update.mockResolvedValue(mockProfile);

      await service.updateCustomSections('user-1', customSections);

      expect(prismaService.publicProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: {
          settings: expect.objectContaining({
            customSections: expect.arrayContaining([
              expect.objectContaining({ title: 'About Me', order: 1 }),
              expect.objectContaining({ title: 'Skills', order: 2 }),
            ]),
          }),
        },
      });
    });

    it('should throw BadRequestException for empty title', async () => {
      const customSections = [{ title: '', content: 'Content' }];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateCustomSections('user-1', customSections)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for title too long', async () => {
      const customSections = [{ title: 'a'.repeat(101), content: 'Content' }];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateCustomSections('user-1', customSections)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for content too long', async () => {
      const customSections = [{ title: 'Title', content: 'a'.repeat(2001) }];
      prismaService.publicProfile.findUnique.mockResolvedValue(mockProfile);

      await expect(service.updateCustomSections('user-1', customSections)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('calculateProfileStatistics', () => {
    it('should calculate profile statistics correctly', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.calculateProfileStatistics('user-1');

      expect(result).toEqual({
        totalProjects: 1,
        publicProjects: 1,
        privateProjects: 0,
        totalStars: 10,
        totalForks: 5,
        languageBreakdown: {
          TypeScript: 1.8, // 1 + 0.8 from percentage
          JavaScript: 0.2,
        },
        topRepositories: [
          {
            id: 'project-1',
            name: 'Test Project',
            stars: 10,
            forks: 5,
            language: 'TypeScript',
          },
        ],
        activityData: expect.any(Array),
        joinedDate: new Date('2023-01-01'),
        lastActiveDate: new Date('2023-06-01'),
      });
      expect(result.activityData).toHaveLength(30);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.calculateProfileStatistics('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return list of supported platforms', () => {
      const platforms = service.getSupportedPlatforms();

      expect(platforms).toContain('github');
      expect(platforms).toContain('twitter');
      expect(platforms).toContain('linkedin');
      expect(platforms).toContain('dev.to');
      expect(platforms.length).toBeGreaterThan(10);
    });
  });
});
