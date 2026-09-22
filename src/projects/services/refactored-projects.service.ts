import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Project } from '@prisma/client';

import { ParserService } from '../../parser/parser.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../sync-queue.service';
import { StandardizedLoggerService } from '../../common/services/standardized-logger.service';
import {
  GitHubSyncContext,
  buildProjectData,
  fetchAndParsePortfolioMd,
  fetchGitHubRepoData,
  generateProjectCacheKeys,
  generateSyncId,
  shouldSkipConcurrentSync,
  validateSyncParameters,
} from '../utils/github-sync.utils';
import { CACHE_CONSTANTS, DB_CONSTANTS, GITHUB_CONSTANTS } from '../../common/constants';
import { DatabaseError, ExternalServiceError } from '../../common/utils/error.utils';
import { validatePagination } from '../../common/utils/validation.utils';

/**
 * Refactored ProjectsService with improved error handling, logging, and separation of concerns
 */
@Injectable()
export class RefactoredProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ParserService,
    private readonly config: ConfigService,
    private readonly logger: StandardizedLoggerService,
    @Inject(forwardRef(() => SyncQueueService))
    private readonly syncQueue: SyncQueueService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.logger.setContext(RefactoredProjectsService.name);
  }

  /**
   * Queues a project sync operation
   */
  async queueSyncProject(userId: string, repoUrl: string, branch = 'main'): Promise<void> {
    validateSyncParameters(userId, repoUrl, branch);

    this.logger.logQueueOperation('sync-project', 'queued', {
      userId,
      metadata: { repoUrl, branch },
    });

    await this.syncQueue.addJob(userId, repoUrl, branch);
  }

  /**
   * Refactored GitHub sync method with improved error handling and separation of concerns
   */
  async syncProjectFromGitHub(
    userId: string,
    repoUrl: string,
    branch = 'main',
    blacklisted = false,
  ): Promise<Project> {
    const operationStart = Date.now();
    const syncId = generateSyncId(userId, repoUrl);

    const context: GitHubSyncContext = {
      userId,
      repoUrl,
      branch,
      syncId,
      operationStart,
    };

    this.logger.logSyncOperation('github-sync', 'started', {
      userId,
      requestId: syncId,
      metadata: { repoUrl, branch, blacklisted },
    });

    try {
      // Validate input parameters
      validateSyncParameters(userId, repoUrl, branch);

      // Check for concurrent sync operations
      const existingProject = await this.getExistingProject(userId, repoUrl);
      if (shouldSkipConcurrentSync(existingProject, context)) {
        this.logger.warn('Skipping concurrent sync operation', {
          syncId,
          userId,
          repoUrl,
          lastSyncAt: existingProject?.syncedAt,
        });
        return existingProject as Project;
      }

      // Fetch repository data from GitHub
      const repoData = await this.fetchRepositoryData(repoUrl, context);

      // Fetch and parse Portfolio.md
      const portfolioData = await this.fetchPortfolioData(repoUrl, branch, context);

      // Build project data for database
      const projectData = buildProjectData(
        userId,
        repoUrl,
        repoData,
        portfolioData.parsedMd,
        portfolioData.validationErrors,
        portfolioData.valid,
        blacklisted,
      );

      // Upsert project in database
      const project = await this.upsertProject(userId, repoUrl, projectData, context);

      // Invalidate cache
      await this.invalidateProjectCache(userId, repoUrl, context);

      const duration = Date.now() - operationStart;
      this.logger.logSyncOperation('github-sync', 'completed', {
        userId,
        requestId: syncId,
        duration,
        metadata: {
          projectId: project.id,
          title: project.title,
          valid: project.valid,
          portfolioMdExists: portfolioData.portfolioMdExists,
          validationErrors: portfolioData.validationErrors.length,
        },
      });

      return project;
    } catch (error) {
      const duration = Date.now() - operationStart;
      this.logger.logSyncOperation('github-sync', 'failed', {
        userId,
        requestId: syncId,
        duration,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          repoUrl,
          branch,
        },
      });

      // Re-throw with enhanced error information
      if (error instanceof ExternalServiceError || error instanceof DatabaseError) {
        throw error;
      }

      throw new ExternalServiceError(
        `Failed to sync project from GitHub: ${error instanceof Error ? error.message : String(error)}`,
        'GITHUB_SYNC_FAILED',
        { repoUrl, branch, syncId },
        syncId,
        userId,
      );
    }
  }

  /**
   * Gets all projects for a user with improved caching and error handling
   */
  async getAllProjectsForUser(userId: string, includeDeleted = false): Promise<Project[]> {
    const cacheKey = `user:${userId}:projects${includeDeleted ? ':all' : ''}`;
    const operationStart = Date.now();

    try {
      // Try cache first
      const cached = await this.getCachedProjects(cacheKey);
      if (cached) {
        this.logger.logCacheOperation('get', 'hit', {
          userId,
          key: cacheKey,
          duration: Date.now() - operationStart,
        });
        return cached;
      }

      // Query database
      const projects = await this.queryUserProjects(userId, includeDeleted);

      // Cache results
      await this.cacheProjects(cacheKey, projects, includeDeleted);

      const duration = Date.now() - operationStart;
      this.logger.logDatabaseOperation('SELECT', 'success', {
        userId,
        table: 'projects',
        rowCount: projects.length,
        duration,
        metadata: { includeDeleted },
      });

      return projects;
    } catch (error) {
      const duration = Date.now() - operationStart;
      this.logger.logDatabaseOperation('SELECT', 'failure', {
        userId,
        table: 'projects',
        duration,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          includeDeleted,
        },
      });

      throw new DatabaseError(
        'Failed to retrieve user projects',
        'USER_PROJECTS_QUERY_FAILED',
        { userId, includeDeleted },
        undefined,
        userId,
      );
    }
  }

  /**
   * Enhanced project filtering with better validation
   */
  async getFilteredProjectsForUser(
    filter: { tag?: string; category?: string; featured?: boolean },
    userId: string,
    pagination?: { offset?: number; limit?: number },
  ): Promise<Project[]> {
    const { offset, limit } = validatePagination(pagination?.offset, pagination?.limit);

    const whereClause: Prisma.ProjectWhereInput = {
      ownerId: userId,
      deletedAt: null, // Always filter soft-deleted projects
      ...(filter.tag && { tags: { has: filter.tag } }),
      ...(filter.category && { category: filter.category }),
      ...(typeof filter.featured === 'boolean' && { featured: filter.featured }),
    };

    try {
      const projects = await this.prisma.project.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      });

      this.logger.logDatabaseOperation('SELECT', 'success', {
        userId,
        table: 'projects',
        rowCount: projects.length,
        metadata: { filter, pagination: { offset, limit } },
      });

      return projects;
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'failure', {
        userId,
        table: 'projects',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          filter,
        },
      });

      throw new DatabaseError(
        'Failed to filter user projects',
        'FILTERED_PROJECTS_QUERY_FAILED',
        { userId, filter },
        undefined,
        userId,
      );
    }
  }

  // Private helper methods for better separation of concerns

  private async getExistingProject(
    userId: string,
    repoUrl: string,
  ): Promise<{ syncedAt: Date | null } | null> {
    return this.prisma.project.findUnique({
      where: {
        ownerId_repoUrl: { ownerId: userId, repoUrl },
      },
      select: { id: true, syncedAt: true },
    });
  }

  private async fetchRepositoryData(repoUrl: string, context: GitHubSyncContext) {
    this.logger.logExternalService('github', 'fetch-repo', 'success', {
      userId: context.userId,
      requestId: context.syncId,
      metadata: { repoUrl },
    });

    try {
      const repoData = await fetchGitHubRepoData(repoUrl, context);

      this.logger.logExternalService('github', 'fetch-repo', 'success', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          repoName: repoData.name,
          repoId: repoData.id,
          isPrivate: repoData.private,
        },
      });

      return repoData;
    } catch (error) {
      this.logger.logExternalService('github', 'fetch-repo', 'failure', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          repoUrl,
        },
      });
      throw error;
    }
  }

  private async fetchPortfolioData(repoUrl: string, branch: string, context: GitHubSyncContext) {
    this.logger.logExternalService('github', 'fetch-portfolio', 'success', {
      userId: context.userId,
      requestId: context.syncId,
      metadata: { repoUrl, branch },
    });

    try {
      const portfolioData = await fetchAndParsePortfolioMd(repoUrl, branch, this.parser, context);

      this.logger.logExternalService('github', 'fetch-portfolio', 'success', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          portfolioMdExists: portfolioData.portfolioMdExists,
          valid: portfolioData.valid,
          validationErrors: portfolioData.validationErrors.length,
        },
      });

      return portfolioData;
    } catch (error) {
      this.logger.logExternalService('github', 'fetch-portfolio', 'failure', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          repoUrl,
          branch,
        },
      });
      throw error;
    }
  }

  private async upsertProject(
    userId: string,
    repoUrl: string,
    projectData: any,
    context: GitHubSyncContext,
  ): Promise<Project> {
    try {
      const project = await this.prisma.$transaction(async tx => {
        return await tx.project.upsert({
          where: {
            ownerId_repoUrl: { ownerId: userId, repoUrl },
          },
          create: projectData,
          update: {
            ...projectData,
            // Don't update ownerId and repoUrl in update
            ownerId: undefined,
            repoUrl: undefined,
          },
        });
      });

      this.logger.logDatabaseOperation('UPSERT', 'success', {
        userId: context.userId,
        requestId: context.syncId,
        table: 'projects',
        metadata: {
          projectId: project.id,
          title: project.title,
        },
      });

      return project;
    } catch (error) {
      this.logger.logDatabaseOperation('UPSERT', 'failure', {
        userId: context.userId,
        requestId: context.syncId,
        table: 'projects',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          repoUrl,
        },
      });

      throw new DatabaseError(
        'Failed to save project to database',
        'PROJECT_UPSERT_FAILED',
        { userId, repoUrl },
        context.syncId,
        userId,
      );
    }
  }

  private async getCachedProjects(cacheKey: string): Promise<Project[] | null> {
    try {
      return await this.cache.get<Project[]>(cacheKey);
    } catch (error) {
      this.logger.logCacheOperation('get', 'failure', {
        key: cacheKey,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async cacheProjects(
    cacheKey: string,
    projects: Project[],
    includeDeleted: boolean,
  ): Promise<void> {
    try {
      const ttl = includeDeleted
        ? CACHE_CONSTANTS.USER_PROJECTS_DELETED_TTL
        : CACHE_CONSTANTS.USER_PROJECTS_TTL;
      await this.cache.set(cacheKey, projects, ttl);

      this.logger.logCacheOperation('set', 'success', {
        key: cacheKey,
        ttl,
        size: projects.length,
      });
    } catch (error) {
      this.logger.logCacheOperation('set', 'failure', {
        key: cacheKey,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      // Don't fail the request if cache fails
    }
  }

  private async queryUserProjects(userId: string, includeDeleted: boolean): Promise<Project[]> {
    const whereClause: Prisma.ProjectWhereInput = {
      ownerId: userId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    };

    return this.prisma.project.findMany({
      where: whereClause,
      orderBy: [{ featured: 'desc' }, { published: 'desc' }, { updatedAt: 'desc' }],
      include: {
        aiAnalysis: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            confidence: true,
            createdAt: true,
          },
        },
      },
    });
  }

  private async invalidateProjectCache(
    userId: string,
    repoUrl: string,
    context: GitHubSyncContext,
  ): Promise<void> {
    try {
      const cacheKeys = generateProjectCacheKeys(userId, repoUrl);
      await Promise.all(cacheKeys.map(key => this.cache.del(key)));

      this.logger.logCacheOperation('del', 'success', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          keysInvalidated: cacheKeys.length,
        },
      });
    } catch (error) {
      this.logger.logCacheOperation('del', 'failure', {
        userId: context.userId,
        requestId: context.syncId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      // Don't fail the sync if cache invalidation fails
    }
  }
}
