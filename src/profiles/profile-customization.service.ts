import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProfileTheme,
  SocialLink,
  CustomSection,
  ProfileSettings,
} from './entities/public-profile.entity';

export interface ThemePreset {
  name: string;
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundStyle: string;
  fontFamily: string;
}

export interface ProfileStatistics {
  totalProjects: number;
  publicProjects: number;
  privateProjects: number;
  totalStars: number;
  totalForks: number;
  totalCommits?: number;
  languageBreakdown: { [language: string]: number };
  topRepositories: Array<{
    id: string;
    name: string;
    stars: number;
    forks: number;
    language?: string;
  }>;
  activityData: Array<{
    date: string;
    commits: number;
    repositories: number;
  }>;
  joinedDate: Date;
  lastActiveDate?: Date;
}

@Injectable()
export class ProfileCustomizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available theme presets
   */
  getThemePresets(): ThemePreset[] {
    return [
      {
        name: 'default',
        displayName: 'Default',
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        backgroundStyle: 'solid',
        fontFamily: 'Inter, sans-serif',
      },
      {
        name: 'dark',
        displayName: 'Dark Mode',
        primaryColor: '#17a2b8',
        secondaryColor: '#495057',
        backgroundStyle: 'gradient-dark',
        fontFamily: 'Inter, sans-serif',
      },
      {
        name: 'minimal',
        displayName: 'Minimal',
        primaryColor: '#28a745',
        secondaryColor: '#6c757d',
        backgroundStyle: 'minimal',
        fontFamily: 'Roboto, sans-serif',
      },
      {
        name: 'vibrant',
        displayName: 'Vibrant',
        primaryColor: '#e83e8c',
        secondaryColor: '#fd7e14',
        backgroundStyle: 'gradient-vibrant',
        fontFamily: 'Poppins, sans-serif',
      },
      {
        name: 'professional',
        displayName: 'Professional',
        primaryColor: '#343a40',
        secondaryColor: '#6c757d',
        backgroundStyle: 'professional',
        fontFamily: 'Source Sans Pro, sans-serif',
      },
      {
        name: 'creative',
        displayName: 'Creative',
        primaryColor: '#6f42c1',
        secondaryColor: '#e83e8c',
        backgroundStyle: 'gradient-creative',
        fontFamily: 'Nunito, sans-serif',
      },
    ];
  }

  /**
   * Apply a theme preset to a profile
   */
  async applyThemePreset(userId: string, presetName: string): Promise<ProfileTheme> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const preset = this.getThemePresets().find(p => p.name === presetName);
    if (!preset) {
      throw new BadRequestException('Invalid theme preset');
    }

    const newTheme: ProfileTheme = {
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      backgroundStyle: preset.backgroundStyle,
      fontFamily: preset.fontFamily,
    };

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        theme: newTheme as any,
      },
    });

    return newTheme;
  }

  /**
   * Update profile theme with custom settings
   */
  async updateTheme(userId: string, theme: Partial<ProfileTheme>): Promise<ProfileTheme> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const currentTheme = (profile.theme as unknown as ProfileTheme) || {};
    const updatedTheme: ProfileTheme = {
      ...currentTheme,
      ...theme,
    };

    // Validate colors if provided
    if (theme.primaryColor && !this.isValidColor(theme.primaryColor)) {
      throw new BadRequestException('Invalid primary color format');
    }
    if (theme.secondaryColor && !this.isValidColor(theme.secondaryColor)) {
      throw new BadRequestException('Invalid secondary color format');
    }

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        theme: updatedTheme as any,
      },
    });

    return updatedTheme;
  }

  /**
   * Manage social links
   */
  async updateSocialLinks(userId: string, socialLinks: SocialLink[]): Promise<SocialLink[]> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Validate social links
    for (const link of socialLinks) {
      if (!this.isValidUrl(link.url)) {
        throw new BadRequestException(`Invalid URL for ${link.platform}: ${link.url}`);
      }
      if (!this.isSupportedPlatform(link.platform)) {
        throw new BadRequestException(`Unsupported platform: ${link.platform}`);
      }
    }

    // Remove duplicates by platform
    const uniqueLinks = socialLinks.reduce((acc, link) => {
      const existingIndex = acc.findIndex(l => l.platform === link.platform);
      if (existingIndex >= 0) {
        acc[existingIndex] = link; // Replace existing
      } else {
        acc.push(link);
      }
      return acc;
    }, [] as SocialLink[]);

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        socialLinks: uniqueLinks as any,
      },
    });

    return uniqueLinks;
  }

  /**
   * Add a single social link
   */
  async addSocialLink(userId: string, socialLink: SocialLink): Promise<SocialLink[]> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (!this.isValidUrl(socialLink.url)) {
      throw new BadRequestException(`Invalid URL: ${socialLink.url}`);
    }
    if (!this.isSupportedPlatform(socialLink.platform)) {
      throw new BadRequestException(`Unsupported platform: ${socialLink.platform}`);
    }

    const currentLinks = (profile.socialLinks as unknown as SocialLink[]) || [];
    const existingIndex = currentLinks.findIndex(l => l.platform === socialLink.platform);

    let updatedLinks: SocialLink[];
    if (existingIndex >= 0) {
      // Replace existing link
      updatedLinks = [...currentLinks];
      updatedLinks[existingIndex] = socialLink;
    } else {
      // Add new link
      updatedLinks = [...currentLinks, socialLink];
    }

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        socialLinks: updatedLinks as any,
      },
    });

    return updatedLinks;
  }

  /**
   * Remove a social link
   */
  async removeSocialLink(userId: string, platform: string): Promise<SocialLink[]> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const currentLinks = (profile.socialLinks as unknown as SocialLink[]) || [];
    const updatedLinks = currentLinks.filter(l => l.platform !== platform);

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        socialLinks: updatedLinks as any,
      },
    });

    return updatedLinks;
  }

  /**
   * Update custom sections
   */
  async updateCustomSections(userId: string, customSections: CustomSection[]): Promise<void> {
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Validate custom sections
    for (const section of customSections) {
      if (!section.title || section.title.trim().length === 0) {
        throw new BadRequestException('Section title is required');
      }
      if (section.title.length > 100) {
        throw new BadRequestException('Section title must be 100 characters or less');
      }
      if (section.content.length > 2000) {
        throw new BadRequestException('Section content must be 2000 characters or less');
      }
    }

    // Sort sections by order
    const sortedSections = customSections
      .map((section, index) => ({
        ...section,
        order: section.order ?? index,
        visible: section.visible ?? true,
      }))
      .sort((a, b) => a.order - b.order);

    const currentSettings = (profile.settings as unknown as ProfileSettings) || {};
    const updatedSettings: ProfileSettings = {
      ...currentSettings,
      customSections: sortedSections,
    };

    await this.prisma.publicProfile.update({
      where: { userId },
      data: {
        settings: updatedSettings as any,
      },
    });
  }

  /**
   * Calculate comprehensive profile statistics
   */
  async calculateProfileStatistics(userId: string): Promise<ProfileStatistics> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        projects: {
          where: {
            deletedAt: null,
          },
          orderBy: [{ starCount: 'desc' }, { forkCount: 'desc' }],
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const totalProjects = user.projects.length;
    const publicProjects = user.projects.filter(p => p.published && !p.isPrivate).length;
    const privateProjects = user.projects.filter(p => p.isPrivate).length;
    const totalStars = user.projects.reduce((sum, p) => sum + p.starCount, 0);
    const totalForks = user.projects.reduce((sum, p) => sum + p.forkCount, 0);

    // Calculate language breakdown
    const languageBreakdown: { [language: string]: number } = {};
    user.projects.forEach(project => {
      if (project.language) {
        languageBreakdown[project.language] = (languageBreakdown[project.language] || 0) + 1;
      }

      // Add languages from project metadata if available
      if (project.languages && typeof project.languages === 'object') {
        const projectLanguages = project.languages as { [key: string]: number };
        Object.entries(projectLanguages).forEach(([lang, percentage]) => {
          languageBreakdown[lang] = (languageBreakdown[lang] || 0) + percentage / 100;
        });
      }
    });

    // Get top repositories (max 10)
    const topRepositories = user.projects.slice(0, 10).map(project => ({
      id: project.id,
      name: project.title,
      stars: project.starCount,
      forks: project.forkCount,
      language: project.language || undefined,
    }));

    // Generate activity data (last 30 days)
    const activityData = this.generateActivityData(user.projects);

    // Find last active date
    const lastActiveDate =
      user.projects
        .map(p => p.pushedAt || p.updatedAt)
        .filter(date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] || undefined;

    return {
      totalProjects,
      publicProjects,
      privateProjects,
      totalStars,
      totalForks,
      languageBreakdown,
      topRepositories,
      activityData,
      joinedDate: user.createdAt,
      lastActiveDate,
    };
  }

  /**
   * Get supported social media platforms
   */
  getSupportedPlatforms(): string[] {
    return [
      'github',
      'gitlab',
      'bitbucket',
      'twitter',
      'linkedin',
      'instagram',
      'facebook',
      'youtube',
      'twitch',
      'discord',
      'telegram',
      'reddit',
      'stackoverflow',
      'dev.to',
      'medium',
      'hashnode',
      'personal-website',
      'blog',
      'portfolio',
    ];
  }

  /**
   * Validate color format (hex)
   */
  private isValidColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if platform is supported
   */
  private isSupportedPlatform(platform: string): boolean {
    return this.getSupportedPlatforms().includes(platform.toLowerCase());
  }

  /**
   * Generate activity data for the last 30 days
   */
  private generateActivityData(
    projects: any[],
  ): Array<{ date: string; commits: number; repositories: number }> {
    const activityData: Array<{
      date: string;
      commits: number;
      repositories: number;
    }> = [];
    const now = new Date();

    // Generate data for last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      // Count repositories with activity on this date
      const repositoriesWithActivity = projects.filter(project => {
        const pushedAt = project.pushedAt;
        if (!pushedAt) return false;

        const pushedDate = new Date(pushedAt).toISOString().split('T')[0];
        return pushedDate === dateString;
      }).length;

      activityData.push({
        date: dateString,
        commits: repositoriesWithActivity * 2, // Estimate commits (simplified)
        repositories: repositoriesWithActivity,
      });
    }

    return activityData;
  }
}
