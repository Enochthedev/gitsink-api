import { Repository, PlatformType } from '../types/platform.types';
import { Project } from '@prisma/client';

/**
 * Unified repository model that combines platform-specific data
 * with our internal project representation
 */
export class UnifiedRepository {
  // Core repository information
  public readonly id: string;
  public readonly name: string;
  public readonly fullName: string;
  public readonly description?: string;
  public readonly htmlUrl: string;
  public readonly cloneUrl: string;
  public readonly sshUrl?: string;
  public readonly defaultBranch: string;
  public readonly platform: PlatformType;

  // Repository metadata
  public readonly language?: string;
  public readonly languages?: Record<string, number>;
  public readonly topics: string[];
  public readonly license?: string;
  public readonly size: number;

  // Repository statistics
  public readonly starCount: number;
  public readonly forkCount: number;
  public readonly openIssuesCount: number;

  // Repository flags
  public readonly isPrivate: boolean;
  public readonly isFork: boolean;
  public readonly isArchived: boolean;
  public readonly isDisabled: boolean;
  public readonly hasWiki: boolean;
  public readonly hasPages: boolean;
  public readonly hasIssues: boolean;
  public readonly hasProjects: boolean;
  public readonly hasDownloads: boolean;

  // Timestamps
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly pushedAt: Date;

  // Owner information
  public readonly owner: {
    id: string;
    username: string;
    type: 'user' | 'organization';
    avatar?: string;
  };

  // Platform-specific metadata
  public readonly platformMetadata: Record<string, any>;

  constructor(repository: Repository) {
    this.id = repository.id;
    this.name = repository.name;
    this.fullName = repository.fullName;
    this.description = repository.description;
    this.htmlUrl = repository.htmlUrl;
    this.cloneUrl = repository.cloneUrl;
    this.sshUrl = repository.sshUrl;
    this.defaultBranch = repository.defaultBranch;
    this.platform = repository.platform;

    this.language = repository.language;
    this.languages = repository.languages;
    this.topics = repository.topics;
    this.license = repository.license;
    this.size = repository.size;

    this.starCount = repository.starCount;
    this.forkCount = repository.forkCount;
    this.openIssuesCount = repository.openIssuesCount;

    this.isPrivate = repository.isPrivate;
    this.isFork = repository.isFork;
    this.isArchived = repository.isArchived;
    this.isDisabled = repository.isDisabled;
    this.hasWiki = repository.hasWiki;
    this.hasPages = repository.hasPages;
    this.hasIssues = repository.hasIssues;
    this.hasProjects = repository.hasProjects;
    this.hasDownloads = repository.hasDownloads;

    this.createdAt = repository.createdAt;
    this.updatedAt = repository.updatedAt;
    this.pushedAt = repository.pushedAt;

    this.owner = repository.owner;
    this.platformMetadata = repository.platformMetadata;
  }

  /**
   * Convert to Prisma Project model for database storage
   */
  toPrismaProject(
    userId: string,
    portfolioData?: any,
  ): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      ownerId: userId,
      title: portfolioData?.title || this.name,
      description: portfolioData?.description || this.description || '',
      tags: portfolioData?.tags || this.topics,
      icon: portfolioData?.icon,
      image: portfolioData?.image,
      demoUrl: portfolioData?.demoUrl,
      repoUrl: this.htmlUrl,
      featured: portfolioData?.featured ?? false,
      published: portfolioData?.published ?? false,
      order: portfolioData?.order,
      category: portfolioData?.category,
      githubSync: true,
      blacklisted: portfolioData?.blacklisted ?? false,
      markdown: portfolioData?.body || '',
      valid: portfolioData?.valid ?? true,
      validationErrors: portfolioData?.validationErrors || [],
      collaborators: [],
      firstCommitAt: null, // Would need additional API call to get first commit
      lastCommitAt: this.pushedAt,
      syncedAt: new Date(),
      deletedAt: null,

      // Enhanced fields
      platform: this.platform,
      platformId: this.id,
      defaultBranch: this.defaultBranch,
      language: this.language || null,
      languages: this.languages || {},
      starCount: this.starCount,
      forkCount: this.forkCount,
      isPrivate: this.isPrivate,
      license: this.license || null,
      topics: this.topics,
      size: this.size,
      openIssues: this.openIssuesCount,
      hasWiki: this.hasWiki,
      hasPages: this.hasPages,
      archived: this.isArchived,
      disabled: this.isDisabled,
      pushedAt: this.pushedAt,

      githubMetadata: this.platform === 'github' ? this.platformMetadata : {},
      customMetadata: portfolioData?.custom || {},
    };
  }

  /**
   * Create from existing Prisma Project
   */
  static fromPrismaProject(project: Project): UnifiedRepository {
    const repository: Repository = {
      id: project.platformId || project.id,
      name: project.title,
      fullName: project.title, // We don't store full name separately
      description: project.description,
      htmlUrl: project.repoUrl || '',
      cloneUrl: project.repoUrl || '',
      sshUrl: undefined,
      defaultBranch: project.defaultBranch || 'main',
      language: project.language || undefined,
      languages: (project.languages as Record<string, number>) || {},
      topics: project.topics,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      pushedAt: project.pushedAt || project.updatedAt,
      starCount: project.starCount,
      forkCount: project.forkCount,
      openIssuesCount: project.openIssues,
      isPrivate: project.isPrivate,
      isFork: false, // We don't track this in our current schema
      isArchived: project.archived,
      isDisabled: project.disabled,
      hasWiki: project.hasWiki,
      hasPages: project.hasPages,
      hasIssues: true, // Default assumption
      hasProjects: true, // Default assumption
      hasDownloads: true, // Default assumption
      license: project.license || undefined,
      size: project.size || 0,
      platform: (project.platform as PlatformType) || 'github',
      platformMetadata: (project.githubMetadata as Record<string, any>) || {},
      owner: {
        id: project.ownerId,
        username: 'unknown', // We don't store owner username in Project
        type: 'user',
      },
    };

    return new UnifiedRepository(repository);
  }

  /**
   * Get repository clone URLs
   */
  getCloneUrls(): { https: string; ssh?: string } {
    return {
      https: this.cloneUrl,
      ssh: this.sshUrl,
    };
  }

  /**
   * Get repository web URLs
   */
  getWebUrls(): {
    repository: string;
    issues?: string;
    wiki?: string;
    releases?: string;
  } {
    const baseUrl = this.htmlUrl;

    return {
      repository: baseUrl,
      issues: this.hasIssues ? `${baseUrl}/issues` : undefined,
      wiki: this.hasWiki ? `${baseUrl}/wiki` : undefined,
      releases: `${baseUrl}/releases`,
    };
  }

  /**
   * Get repository statistics summary
   */
  getStatistics(): {
    stars: number;
    forks: number;
    openIssues: number;
    size: number;
    language?: string;
    topics: string[];
  } {
    return {
      stars: this.starCount,
      forks: this.forkCount,
      openIssues: this.openIssuesCount,
      size: this.size,
      language: this.language,
      topics: this.topics,
    };
  }

  /**
   * Check if repository has specific features
   */
  hasFeature(feature: 'wiki' | 'pages' | 'issues' | 'projects' | 'downloads'): boolean {
    switch (feature) {
      case 'wiki':
        return this.hasWiki;
      case 'pages':
        return this.hasPages;
      case 'issues':
        return this.hasIssues;
      case 'projects':
        return this.hasProjects;
      case 'downloads':
        return this.hasDownloads;
      default:
        return false;
    }
  }

  /**
   * Get repository activity level based on recent pushes
   */
  getActivityLevel(): 'high' | 'medium' | 'low' | 'inactive' {
    const now = new Date();
    const daysSinceLastPush = Math.floor(
      (now.getTime() - this.pushedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceLastPush <= 7) return 'high';
    if (daysSinceLastPush <= 30) return 'medium';
    if (daysSinceLastPush <= 90) return 'low';
    return 'inactive';
  }

  /**
   * Get repository popularity score
   */
  getPopularityScore(): number {
    // Simple popularity calculation based on stars, forks, and activity
    const starsWeight = 0.4;
    const forksWeight = 0.3;
    const activityWeight = 0.3;

    const starsScore = Math.min(this.starCount / 100, 1); // Normalize to 0-1
    const forksScore = Math.min(this.forkCount / 50, 1); // Normalize to 0-1

    const activityLevels = { high: 1, medium: 0.7, low: 0.4, inactive: 0.1 };
    const activityScore = activityLevels[this.getActivityLevel()];

    return starsScore * starsWeight + forksScore * forksWeight + activityScore * activityWeight;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      fullName: this.fullName,
      description: this.description,
      htmlUrl: this.htmlUrl,
      cloneUrl: this.cloneUrl,
      sshUrl: this.sshUrl,
      defaultBranch: this.defaultBranch,
      platform: this.platform,
      language: this.language,
      languages: this.languages,
      topics: this.topics,
      license: this.license,
      size: this.size,
      starCount: this.starCount,
      forkCount: this.forkCount,
      openIssuesCount: this.openIssuesCount,
      isPrivate: this.isPrivate,
      isFork: this.isFork,
      isArchived: this.isArchived,
      isDisabled: this.isDisabled,
      hasWiki: this.hasWiki,
      hasPages: this.hasPages,
      hasIssues: this.hasIssues,
      hasProjects: this.hasProjects,
      hasDownloads: this.hasDownloads,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      pushedAt: this.pushedAt,
      owner: this.owner,
      statistics: this.getStatistics(),
      activityLevel: this.getActivityLevel(),
      popularityScore: this.getPopularityScore(),
      webUrls: this.getWebUrls(),
      cloneUrls: this.getCloneUrls(),
    };
  }
}
