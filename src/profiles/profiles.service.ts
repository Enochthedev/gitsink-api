import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileSettingsDto } from './dto/profile-settings.dto';
import {
  PublicProfile,
  ProfileStats,
  SocialLink,
  ProfileTheme,
  ProfileSettings,
} from './entities/public-profile.entity';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new public profile for a user
   */
  async createProfile(userId: string, createProfileDto: CreateProfileDto): Promise<PublicProfile> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if profile already exists
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException('Profile already exists for this user');
    }

    // Check if username is already taken
    const existingUsername = await this.prisma.publicProfile.findUnique({
      where: { username: createProfileDto.username },
    });

    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    // Validate custom domain if provided
    if (createProfileDto.customDomain) {
      const existingDomain = await this.prisma.publicProfile.findUnique({
        where: { customDomain: createProfileDto.customDomain },
      });

      if (existingDomain) {
        throw new ConflictException('Custom domain is already taken');
      }
    }

    try {
      const profile = await this.prisma.publicProfile.create({
        data: {
          userId,
          username: createProfileDto.username,
          displayName: createProfileDto.displayName,
          bio: createProfileDto.bio,
          avatar: createProfileDto.avatar,
          location: createProfileDto.location,
          website: createProfileDto.website,
          socialLinks: createProfileDto.socialLinks || ([] as any),
          theme: createProfileDto.theme || ({} as any),
          settings: {
            isPublic: createProfileDto.isPublic ?? false,
            showEmail: false,
            showStats: true,
            showPrivateRepos: false,
            featuredProjects: [],
            customSections: [],
            layout: 'default',
            showActivity: true,
            showContributions: true,
          },
          isPublic: createProfileDto.isPublic ?? false,
          customDomain: createProfileDto.customDomain,
        },
      });

      return new PublicProfile(profile);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Username or custom domain is already taken');
        }
      }
      throw error;
    }
  }

  /**
   * Get a profile by user ID
   */
  async getProfileByUserId(userId: string): Promise<PublicProfile | null> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    const profileEntity = new PublicProfile(profile);
    profileEntity.stats = await this.calculateProfileStats(userId);

    return profileEntity;
  }

  /**
   * Get a public profile by username
   */
  async getPublicProfile(username: string): Promise<PublicProfile | null> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: {
        username,
        isPublic: true,
      },
    });

    if (!profile) {
      return null;
    }

    // Increment view count
    await this.incrementViewCount(profile.id);

    const profileEntity = new PublicProfile(profile);
    profileEntity.stats = await this.calculateProfileStats(profile.userId);

    return profileEntity;
  }

  /**
   * Get a profile by custom domain
   */
  async getProfileByDomain(domain: string): Promise<PublicProfile | null> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: {
        customDomain: domain,
        isPublic: true,
      },
    });

    if (!profile) {
      return null;
    }

    // Increment view count
    await this.incrementViewCount(profile.id);

    const profileEntity = new PublicProfile(profile);
    profileEntity.stats = await this.calculateProfileStats(profile.userId);

    return profileEntity;
  }

  /**
   * Update a profile
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<PublicProfile> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException('Profile not found');
    }

    // Check username uniqueness if being updated
    if (updateProfileDto.username && updateProfileDto.username !== existingProfile.username) {
      const existingUsername = await this.prisma.publicProfile.findUnique({
        where: { username: updateProfileDto.username },
      });

      if (existingUsername) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Check custom domain uniqueness if being updated
    if (
      updateProfileDto.customDomain &&
      updateProfileDto.customDomain !== existingProfile.customDomain
    ) {
      const existingDomain = await this.prisma.publicProfile.findUnique({
        where: { customDomain: updateProfileDto.customDomain },
      });

      if (existingDomain) {
        throw new ConflictException('Custom domain is already taken');
      }
    }

    try {
      const updatedProfile = await this.prisma.publicProfile.update({
        where: { userId },
        data: {
          ...(updateProfileDto.username && {
            username: updateProfileDto.username,
          }),
          ...(updateProfileDto.displayName !== undefined && {
            displayName: updateProfileDto.displayName,
          }),
          ...(updateProfileDto.bio !== undefined && {
            bio: updateProfileDto.bio,
          }),
          ...(updateProfileDto.avatar !== undefined && {
            avatar: updateProfileDto.avatar,
          }),
          ...(updateProfileDto.location !== undefined && {
            location: updateProfileDto.location,
          }),
          ...(updateProfileDto.website !== undefined && {
            website: updateProfileDto.website,
          }),
          ...(updateProfileDto.socialLinks && {
            socialLinks: updateProfileDto.socialLinks as any,
          }),
          ...(updateProfileDto.theme && {
            theme: {
              ...((existingProfile.theme as object) || {}),
              ...updateProfileDto.theme,
            } as any,
          }),
          ...(updateProfileDto.isPublic !== undefined && {
            isPublic: updateProfileDto.isPublic,
          }),
          ...(updateProfileDto.customDomain !== undefined && {
            customDomain: updateProfileDto.customDomain,
          }),
        },
      });

      return new PublicProfile(updatedProfile);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Username or custom domain is already taken');
        }
      }
      throw error;
    }
  }

  /**
   * Update profile settings
   */
  async updateProfileSettings(userId: string, settingsDto: ProfileSettingsDto): Promise<void> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException('Profile not found');
    }

    const currentSettings = (existingProfile.settings as ProfileSettings) || {};
    const updatedSettings = {
      ...currentSettings,
      ...settingsDto,
    };

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        settings: updatedSettings as any,
        ...(settingsDto.isPublic !== undefined && {
          isPublic: settingsDto.isPublic,
        }),
      },
    });
  }

  /**
   * Delete a profile
   */
  async deleteProfile(userId: string): Promise<void> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      throw new NotFoundException('Profile not found');
    }

    await this.prisma.publicProfile.delete({
      where: { userId },
    });
  }

  /**
   * Generate profile URL
   */
  generateProfileUrl(username: string, customDomain?: string): string {
    if (customDomain) {
      return `https://${customDomain}`;
    }

    // This would typically use your app's domain
    const baseUrl = process.env.APP_URL || 'https://gitsink.dev';
    return `${baseUrl}/profile/${username}`;
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { username },
    });

    return !existingProfile;
  }

  /**
   * Check if custom domain is available
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { customDomain: domain },
    });

    return !existingProfile;
  }

  /**
   * Search public profiles
   */
  async searchProfiles(
    query: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PublicProfile[]> {
    const profiles = await this.prisma.publicProfile.findMany({
      where: {
        isPublic: true,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { bio: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ viewCount: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return profiles.map(profile => new PublicProfile(profile));
  }

  /**
   * Get featured profiles
   */
  async getFeaturedProfiles(limit: number = 10): Promise<PublicProfile[]> {
    const profiles = await this.prisma.publicProfile.findMany({
      where: {
        isPublic: true,
      },
      orderBy: [{ viewCount: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return profiles.map(profile => new PublicProfile(profile));
  }

  /**
   * Calculate profile statistics - Optimized to avoid N+1 queries
   */
  private async calculateProfileStats(userId: string): Promise<ProfileStats> {
    // Use a single optimized query with aggregations to avoid N+1 issues
    const [user, projectStats, languageStats] = await Promise.all([
      // Get user basic info
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          createdAt: true,
        },
      }),

      // Get project statistics in a single aggregated query
      this.prisma.project.aggregate({
        where: {
          ownerId: userId,
          deletedAt: null,
        },
        _count: {
          id: true,
          published: true,
        },
        _sum: {
          starCount: true,
          forkCount: true,
        },
      }),

      // Get language statistics using groupBy for efficiency
      this.prisma.project.groupBy({
        by: ['language'],
        where: {
          ownerId: userId,
          deletedAt: null,
          language: { not: null },
        },
        _count: {
          language: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get public projects count separately for accuracy
    const publicProjectsCount = await this.prisma.project.count({
      where: {
        ownerId: userId,
        deletedAt: null,
        published: true,
      },
    });

    // Get last activity using optimized query
    const lastActivityProject = await this.prisma.project.findFirst({
      where: {
        ownerId: userId,
        deletedAt: null,
        pushedAt: { not: null },
      },
      select: {
        pushedAt: true,
        updatedAt: true,
      },
      orderBy: [{ pushedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    // Process language statistics
    const languages: { [key: string]: number } = {};
    languageStats.forEach(stat => {
      if (stat.language) {
        languages[stat.language] = stat._count.language;
      }
    });

    // Get additional language data from project metadata if needed
    if (Object.keys(languages).length === 0) {
      const projectsWithLanguages = await this.prisma.project.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          languages: { not: Prisma.JsonNull },
        },
        select: {
          languages: true,
        },
      });

      projectsWithLanguages.forEach(project => {
        if (project.languages && typeof project.languages === 'object') {
          const projectLanguages = project.languages as {
            [key: string]: number;
          };
          Object.entries(projectLanguages).forEach(([lang, percentage]) => {
            languages[lang] = (languages[lang] || 0) + percentage;
          });
        }
      });
    }

    const lastActivityAt =
      lastActivityProject?.pushedAt || lastActivityProject?.updatedAt || undefined;

    return {
      totalProjects: projectStats._count.id || 0,
      publicProjects: publicProjectsCount,
      totalStars: projectStats._sum.starCount || 0,
      totalForks: projectStats._sum.forkCount || 0,
      languages,
      lastActivityAt,
      joinedAt: user.createdAt,
    };
  }

  /**
   * Increment profile view count
   */
  private async incrementViewCount(profileId: string): Promise<void> {
    await this.prisma.publicProfile.update({
      where: { id: profileId },
      data: {
        viewCount: {
          increment: 1,
        },
      },
    });
  }
}
