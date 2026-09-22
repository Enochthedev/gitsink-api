import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParserService } from '../parser/parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncQueueService } from './sync-queue.service';
import { PlatformDetectorService, PlatformRegistryService, UnifiedRepository } from '../platforms';
import { PlatformCredentials, PlatformType } from '../platforms/types/platform.types';
import { PortfolioMetadata } from '../parser/types/portfolio.types';
import { Prisma, Project } from '@prisma/client';
import { decrypt } from '../utils/encryption';
import matter from 'gray-matter';

/**
 * Enhanced ProjectsService with multi-platform support
 */
@Injectable()
export class EnhancedProjectsService {
  private readonly logger = new Logger(EnhancedProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ParserService,
    private readonly config: ConfigService,
    private readonly platformRegistry: PlatformRegistryService,
    private readonly platformDetector: PlatformDetectorService,
    @Inject(forwardRef(() => SyncQueueService))
    private readonly syncQueue: SyncQueueService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Queue sync project for any supported platform
   */
  async queueSyncProject(userId: string, repoUrl: string, branch = 'main'): Promise<void> {
    const validation = this.platformRegistry.validateRepositoryUrl(repoUrl);
    if (!validation.isValid) {
      throw new Error(`Invalid repository URL: ${validation.error}`);
    }

    await this.syncQueue.addJob(userId, repoUrl, branch);
  }

  /**
   * Sync project from any supported platform
   */
  async syncProjectFromPlatform(
    userId: string,
    repoUrl: string,
    branch = 'main',
    blacklisted = false,
  ): Promise<Project> {
    const validation = this.platformRegistry.validateRepositoryUrl(repoUrl);
    if (!validation.isValid || !validation.provider || !validation.parsed) {
      throw new Error(`Invalid repository URL: ${validation.error}`);
    }

    const { platform, provider, parsed } = validation;
    if (!platform) {
      throw new Error('Platform not detected');
    }

    const { owner, repo } = parsed;

    this.logger.debug(`Syncing ${platform} repository: ${owner}/${repo}`);

    // Get platform credentials for the user
    const credentials = await this.getPlatformCredentials(userId, platform);
    if (!credentials) {
      throw new Error(`No ${platform} credentials found for user`);
    }

    try {
      // Fetch repository data from platform
      const repoResponse = await provider.fetchRepository(credentials, owner, repo);
      const repoData = repoResponse.data;

      // Create unified repository model
      const unifiedRepo = new UnifiedRepository(repoData);

      // Fetch Portfolio.md file
      let parsedMd: PortfolioMetadata | null = null;
      let validationErrors: string[] = [];
      let valid = true;

      try {
        const portfolioResponse = await provider.fetchPortfolioFile(
          credentials,
          owner,
          repo,
          branch,
        );

        if (portfolioResponse.data) {
          const result = this.parser.parseMarkdown(portfolioResponse.data);
          if (result.valid) {
            parsedMd = result.data;
          } else {
            valid = false;
            validationErrors = result.errors.map(err => err.message || String(err));
          }
        }
      } catch (error) {
        this.logger.warn(`Portfolio.md not found or error fetching: ${error}`);
      }

      // Convert to Prisma project data
      const projectData = unifiedRepo.toPrismaProject(userId, {
        ...parsedMd,
        valid,
        validationErrors,
        blacklisted,
      });

      // Upsert project in database
      const project = await this.prisma.project.upsert({
        where: {
          ownerId_repoUrl: {
            ownerId: userId,
            repoUrl,
          },
        },
        create: projectData as any,
        update: {
          ...projectData,
          updatedAt: new Date(),
        } as any,
      });

      // Clear cache
      await this.clearProjectCache(userId, repoUrl);

      // Log sync operation
      await this.logSyncOperation(userId, project.id, 'sync', platform, repoUrl, 'completed');

      return project;
    } catch (error) {
      this.logger.error(`Failed to sync ${platform} repository ${owner}/${repo}:`, error);

      // Log failed sync operation
      await this.logSyncOperation(
        userId,
        null,
        'sync',
        platform,
        repoUrl,
        'failed',
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : 'Unknown error',
      );

      throw error;
    }
  }

  /**
   * Sync all repositories for a user across all connected platforms
   */
  async syncAllReposForUser(userId: string): Promise<void> {
    this.logger.debug(`Starting sync for all repositories for user: ${userId}`);

    // Get all platform connections for the user
    const connections = await this.prisma.platformConnection.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    if (connections.length === 0) {
      this.logger.warn(`No active platform connections found for user: ${userId}`);
      return;
    }

    for (const connection of connections) {
      try {
        await this.syncRepositoriesForPlatform(userId, connection.platform as PlatformType);
      } catch (error) {
        this.logger.error(
          `Failed to sync repositories for platform ${connection.platform}:`,
          error,
        );
      }
    }

    // Clear user's project cache
    await this.cache.del(`user:${userId}:projects`);
  }

  /**
   * Sync repositories for a specific platform
   */
  private async syncRepositoriesForPlatform(userId: string, platform: PlatformType): Promise<void> {
    const provider = this.platformRegistry.getProvider(platform);
    if (!provider) {
      throw new Error(`Provider not found for platform: ${platform}`);
    }

    const credentials = await this.getPlatformCredentials(userId, platform);
    if (!credentials) {
      throw new Error(`No credentials found for platform: ${platform}`);
    }

    try {
      // Fetch repositories from platform
      const reposResponse = await provider.fetchRepositories(credentials, {
        affiliation: 'owner',
        sort: 'updated',
        direction: 'desc',
        perPage: 100,
      });

      const repositories = reposResponse.data;
      this.logger.debug(`Found ${repositories.length} repositories on ${platform}`);

      for (const repo of repositories) {
        try {
          // Check if repository should be blacklisted
          const blacklisted = await this.checkRepositoryBlacklist(
            credentials,
            provider,
            repo.owner.username,
            repo.name,
            repo.defaultBranch,
          );

          if (blacklisted) {
            // Create/update blacklisted project record
            await this.createBlacklistedProject(userId, repo);
            continue;
          }

          // Queue sync for this repository
          await this.queueSyncProject(userId, repo.htmlUrl, repo.defaultBranch);
        } catch (error) {
          this.logger.warn(`Failed to process repository ${repo.fullName}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to fetch repositories from ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Check if repository should be blacklisted based on Profile.md
   */
  private async checkRepositoryBlacklist(
    credentials: PlatformCredentials,
    provider: any,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<boolean> {
    try {
      const profileResponse = await provider.fetchFileContent(
        credentials,
        owner,
        repo,
        'Profile.md',
        branch,
      );

      if (profileResponse.data) {
        const content =
          profileResponse.data.encoding === 'base64'
            ? Buffer.from(profileResponse.data.content, 'base64').toString('utf8')
            : profileResponse.data.content;

        const profileData = matter(content).data as Record<string, unknown>;

        return (
          profileData['blacklisted'] === true ||
          profileData['blacklist'] === true ||
          profileData['allowed'] === false
        );
      }
    } catch (error) {
      // Profile.md not found or error reading - not blacklisted
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.status !== 404) {
          this.logger.warn(`Error checking Profile.md for ${owner}/${repo}:`, error);
        }
      }
    }

    return false;
  }

  /**
   * Create blacklisted project record
   */
  private async createBlacklistedProject(userId: string, repo: any): Promise<void> {
    const unifiedRepo = new UnifiedRepository(repo);
    const projectData = unifiedRepo.toPrismaProject(userId, {
      blacklisted: true,
    });

    await this.prisma.project.upsert({
      where: {
        ownerId_repoUrl: {
          ownerId: userId,
          repoUrl: repo.htmlUrl,
        },
      },
      create: projectData as any,
      update: {
        blacklisted: true,
        syncedAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }

  /**
   * Get platform credentials for user
   */
  private async getPlatformCredentials(
    userId: string,
    platform: PlatformType,
  ): Promise<PlatformCredentials | null> {
    const connection = await this.prisma.platformConnection.findUnique({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
    });

    if (!connection || !connection.isActive || !connection.accessToken) {
      return null;
    }

    // Decrypt token if encryption is enabled
    const encryptionKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    const accessToken = encryptionKey
      ? decrypt(connection.accessToken, encryptionKey)
      : connection.accessToken;

    const refreshToken =
      connection.refreshToken && encryptionKey
        ? decrypt(connection.refreshToken, encryptionKey)
        : connection.refreshToken;

    return {
      accessToken,
      refreshToken: refreshToken || undefined,
      tokenExpiresAt: connection.tokenExpiresAt || undefined,
      scopes: connection.scopes,
    };
  }

  /**
   * Log sync operation to audit trail
   */
  private async logSyncOperation(
    userId: string,
    projectId: string | null,
    operation: string,
    platform: string,
    repositoryUrl: string,
    status: string,
    error?: string,
  ): Promise<void> {
    try {
      await this.prisma.syncHistory.create({
        data: {
          userId,
          projectId,
          operation,
          platform,
          repositoryUrl,
          status,
          error,
          startedAt: new Date(),
          completedAt: status === 'completed' ? new Date() : null,
        },
      });
    } catch (logError) {
      this.logger.error('Failed to log sync operation:', logError);
    }
  }

  /**
   * Clear project-related cache entries
   */
  private async clearProjectCache(userId: string, repoUrl: string): Promise<void> {
    const cacheKeys = [`user:${userId}:repo:${repoUrl}`, `user:${userId}:projects`];

    await Promise.all(cacheKeys.map(key => this.cache.del(key)));
  }

  /**
   * Get all projects for user (existing method with caching)
   */
  async getAllProjectsForUser(userId: string): Promise<Project[]> {
    const cacheKey = `user:${userId}:projects`;
    const cached = await this.cache.get<Project[]>(cacheKey);
    if (cached) return cached;

    const projects = await this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    await this.cache.set(cacheKey, projects);
    return projects;
  }

  /**
   * Get filtered projects for user
   */
  async getFilteredProjectsForUser(
    filter: {
      tag?: string;
      category?: string;
      featured?: boolean;
      platform?: PlatformType;
      language?: string;
    },
    userId: string,
  ): Promise<Project[]> {
    const where: Prisma.ProjectWhereInput = { ownerId: userId };

    if (filter.tag) {
      where.tags = { has: filter.tag };
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (typeof filter.featured === 'boolean') {
      where.featured = filter.featured;
    }

    if (filter.platform) {
      where.platform = filter.platform;
    }

    if (filter.language) {
      where.language = filter.language;
    }

    return this.prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get project by repository URL
   */
  async getProjectByRepoUrl(repoUrl: string, userId: string): Promise<Project | null> {
    const cacheKey = `user:${userId}:repo:${repoUrl}`;
    const cached = await this.cache.get<Project>(cacheKey);
    if (cached) return cached;

    const project = await this.prisma.project.findUnique({
      where: {
        ownerId_repoUrl: {
          ownerId: userId,
          repoUrl,
        },
      },
    });

    if (project) {
      await this.cache.set(cacheKey, project);
    }

    return project;
  }

  /**
   * Get project by ID
   */
  async getProjectById(id: string, userId: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { id, ownerId: userId },
    });
  }

  /**
   * Get projects by platform
   */
  async getProjectsByPlatform(userId: string, platform: PlatformType): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: {
        ownerId: userId,
        platform,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get sync history for user
   */
  async getSyncHistory(
    userId: string,
    options: {
      platform?: PlatformType;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<any[]> {
    const where: any = { userId };

    if (options.platform) {
      where.platform = options.platform;
    }

    if (options.status) {
      where.status = options.status;
    }

    return this.prisma.syncHistory.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            repoUrl: true,
          },
        },
      },
    });
  }

  /**
   * Get platform statistics for user
   */
  async getPlatformStatistics(userId: string): Promise<Record<string, any>> {
    const stats = await this.prisma.project.groupBy({
      by: ['platform'],
      where: {
        ownerId: userId,
        blacklisted: false,
      },
      _count: {
        _all: true,
      },
      _avg: {
        starCount: true,
        forkCount: true,
      },
      _sum: {
        starCount: true,
        forkCount: true,
      },
    });

    const result: Record<string, any> = {};

    for (const stat of stats) {
      result[stat.platform] = {
        count: stat._count._all,
        averageStars: Math.round(stat._avg.starCount || 0),
        averageForks: Math.round(stat._avg.forkCount || 0),
        totalStars: stat._sum.starCount || 0,
        totalForks: stat._sum.forkCount || 0,
      };
    }

    return result;
  }
}
