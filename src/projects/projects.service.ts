import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ParserService } from '../parser/parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioMetadata } from '../parser/types/portfolio.types';
import axios from 'axios';
import matter from 'gray-matter';
import { Prisma, Project } from '@prisma/client';
import { parseGitHubRepoUrl } from '../utils/github.utils';
import { GitHubRepo } from '../types/github.types';
import { isInputJsonValue } from '../utils/is-json';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '../utils/encryption';
import { PinoLogger } from 'nestjs-pino';
import { SyncQueueService } from './sync-queue.service';
import {
  ExternalServiceError,
  DatabaseError,
  ValidationError,
  BusinessLogicError
} from '../common/exceptions/app-error';
import {
  DatabaseErrorBoundary,
  ExternalServiceErrorBoundary,
  ValidationErrorBoundary
} from '../common/decorators/error-boundary.decorator';
import { EnhancedLoggerService } from '../common/services/enhanced-logger.service';
import { SyncEventsService } from '../sync/sync-events.service';
import { QueueManagerService } from '../queues/services/queue-manager.service';
import { QueueType } from '../queues/config/queue.config';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

/**
 * Service encapsulating all project-related persistence logic. It handles
 * communication with GitHub, parsing markdown and caching results.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private parser: ParserService,
    private config: ConfigService,
    private readonly logger: PinoLogger,
    private readonly enhancedLogger: EnhancedLoggerService,
    @Inject(forwardRef(() => SyncQueueService))
    private readonly syncQueue: SyncQueueService,
    private readonly syncEvents: SyncEventsService,
    private readonly queueManager: QueueManagerService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.logger.setContext(ProjectsService.name);
  }

  @ValidationErrorBoundary('Invalid sync parameters')
  async queueSyncProject(userId: string, repoUrl: string, branch = 'main'): Promise<void> {
    if (!userId || !repoUrl) {
      throw new ValidationError('User ID and repository URL are required');
    }

    try {
      parseGitHubRepoUrl(repoUrl);
    } catch (error) {
      throw new ValidationError('Invalid GitHub repository URL format', { repoUrl });
    }

    await this.syncQueue.addJob(userId, repoUrl, branch);
  }

  /**
   * Fetch project data from GitHub and upsert it in the database.
   *
   * @param userId      Owner of the repository
   * @param repoUrl     HTTPS URL of the repository
   * @param branch      Branch containing the Portfolio.md file
   * @param blacklisted Whether the repo should be marked as blacklisted
   */
  async syncProjectFromGitHub(
    userId: string,
    repoUrl: string,
    branch = 'main',
    blacklisted = false,
  ): Promise<Project> {
    const operationStart = Date.now();
    const syncId = `${userId}-${repoUrl}-${Date.now()}`;

    this.logger.info(`Starting GitHub sync operation`, {
      syncId,
      userId,
      repoUrl,
      branch,
      blacklisted,
    });

    try {
      const { owner, repo } = parseGitHubRepoUrl(repoUrl);

      const githubApiBase = `${this.config.get<string>('GITHUB_API_BASE')}/${owner}/${repo}`;
      const rawMdUrl = `${this.config.get<string>('GITHUB_MD_URL')}/${owner}/${repo}/${branch}/Portfolio.md`;

      // Enhanced error handling for GitHub API calls
      let repoData: GitHubRepo;
      try {
        const repoResponse = await axios.get<GitHubRepo>(githubApiBase, {
          timeout: 30000, // 30 second timeout
          headers: {
            'User-Agent': 'GitSink-API/1.0',
            Accept: 'application/vnd.github.v3+json',
          },
        });
        repoData = repoResponse.data;

        this.logger.debug(`Successfully fetched repository data`, {
          syncId,
          repoName: repoData.name,
          repoId: repoData.id,
          isPrivate: repoData.private,
        });
      } catch (error) {
        this.logger.error(`Failed to fetch repository data from GitHub API`, {
          syncId,
          githubApiBase,
          error: error instanceof Error ? error.message : String(error),
          status: axios.isAxiosError(error) ? error.response?.status : undefined,
        });

        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            throw new Error(`Repository not found: ${repoUrl}`);
          } else if (error.response?.status === 403) {
            throw new Error(
              `Access denied to repository: ${repoUrl}. Check GitHub token permissions.`,
            );
          } else if (error.response?.status === 401) {
            throw new Error(`GitHub authentication failed. Check GitHub token validity.`);
          } else if (error.code === 'ECONNABORTED') {
            throw new Error(`GitHub API request timeout for repository: ${repoUrl}`);
          }
        }
        throw new Error(
          `Failed to fetch repository data: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Enhanced error handling for Portfolio.md fetching and parsing
      let parsedMd: PortfolioMetadata | null = null;
      let validationErrors: string[] = [];
      let valid = true;
      let portfolioMdExists = false;

      try {
        const mdResponse = await axios.get<string>(rawMdUrl, {
          timeout: 15000, // 15 second timeout for markdown files
          headers: {
            'User-Agent': 'GitSink-API/1.0',
            Accept: 'text/plain, application/vnd.github.v3.raw',
          },
        });

        const mdRaw: string = mdResponse.data;
        portfolioMdExists = true;

        // Check for blacklist status in frontmatter
        try {
          const fm = matter(mdRaw);
          const data = fm.data as Record<string, unknown>;
          if (
            data['blacklisted'] === true ||
            data['blacklist'] === true ||
            data['allowed'] === false
          ) {
            blacklisted = true;
            this.logger.debug(`Repository marked as blacklisted via Portfolio.md`, { syncId });
          }
        } catch (e) {
          // Ignore matter errors
        }

        this.logger.debug(`Successfully fetched Portfolio.md`, {
          syncId,
          contentLength: mdRaw.length,
        });

        // Parse markdown with enhanced error handling
        try {
          const result = this.parser.parseMarkdown(mdRaw);
          if (result.valid) {
            parsedMd = result.data;
            this.logger.debug(`Successfully parsed Portfolio.md`, {
              syncId,
              title: parsedMd?.title,
              tags: parsedMd?.tags?.length || 0,
            });
          } else {
            valid = false;
            validationErrors = result.errors.map(error =>
              error instanceof Error ? error.message : String(error),
            );
            this.logger.warn(`Portfolio.md validation failed`, {
              syncId,
              validationErrors,
            });
          }
        } catch (parseError) {
          valid = false;
          const errorMessage =
            parseError instanceof Error ? parseError.message : String(parseError);
          validationErrors = [`Markdown parsing failed: ${errorMessage}`];
          this.logger.error(`Failed to parse Portfolio.md`, {
            syncId,
            parseError: errorMessage,
          });
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 404) {
            this.logger.debug(`Portfolio.md not found at ${rawMdUrl}`, {
              syncId,
            });
            // This is not an error - many repos don't have Portfolio.md
          } else if (err.response?.status === 403) {
            this.logger.warn(`Access denied to Portfolio.md at ${rawMdUrl}`, {
              syncId,
            });
            validationErrors.push('Access denied to Portfolio.md file');
          } else if (err.code === 'ECONNABORTED') {
            this.logger.warn(`Timeout fetching Portfolio.md from ${rawMdUrl}`, {
              syncId,
            });
            validationErrors.push('Timeout fetching Portfolio.md file');
          } else {
            this.logger.error(`Error fetching Portfolio.md: ${err.message}`, {
              syncId,
              status: err.response?.status,
              url: rawMdUrl,
            });
            validationErrors.push(`Failed to fetch Portfolio.md: ${err.message}`);
          }
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(`Unexpected error fetching Portfolio.md: ${errorMessage}`, {
            syncId,
            url: rawMdUrl,
          });
          validationErrors.push(`Unexpected error: ${errorMessage}`);
        }
      }

      const title = parsedMd?.title || repoData.name;
      const description = parsedMd?.description || repoData.description || '';

      let githubMetadata: Prisma.InputJsonValue = {};
      let customMetadata: Prisma.InputJsonValue = {};

      if (isInputJsonValue(repoData)) {
        githubMetadata = repoData;
      }

      if (isInputJsonValue(parsedMd?.custom)) {
        customMetadata = parsedMd.custom;
      }

      // Use transaction to prevent race conditions during concurrent syncs
      const project = await this.prisma.$transaction(async tx => {
        // Check if another sync is in progress for this repository
        const existingProject = await tx.project.findUnique({
          where: {
            ownerId_repoUrl: {
              ownerId: userId,
              repoUrl,
            },
          },
          select: {
            id: true,
            syncedAt: true,
          },
        });

        // Prevent concurrent syncs within 30 seconds
        if (existingProject?.syncedAt) {
          const timeSinceLastSync = Date.now() - existingProject.syncedAt.getTime();
          if (timeSinceLastSync < 30000) {
            this.logger.warn(`Skipping sync - another sync completed recently`, {
              syncId,
              timeSinceLastSync,
              lastSyncAt: existingProject.syncedAt,
            });
            // Return the existing project instead of syncing again
            return await tx.project.findUnique({
              where: { id: existingProject.id },
            });
          }
        }

        // Perform the upsert with enhanced metadata
        return await tx.project.upsert({
          where: {
            ownerId_repoUrl: {
              ownerId: userId,
              repoUrl,
            },
          },
          create: {
            ownerId: userId,
            title,
            description,
            tags: parsedMd?.tags || [],
            icon: parsedMd?.icon,
            image: parsedMd?.image,
            demoUrl: parsedMd?.demoUrl,
            repoUrl,
            valid,
            validationErrors,
            featured: parsedMd?.featured ?? false,
            published: parsedMd?.published ?? false,
            category: parsedMd?.category,
            order: parsedMd?.order,
            blacklisted,
            markdown: parsedMd?.body || '',
            collaborators: repoData?.contributors_url ? [] : [],
            firstCommitAt: null,
            lastCommitAt: new Date(repoData.pushed_at),
            githubMetadata,
            customMetadata,
            syncedAt: new Date(),
            // Enhanced fields from GitHub API
            platform: 'github',
            platformId: String(repoData.id),
            defaultBranch: (repoData.default_branch as string) || 'main',
            language: (repoData.language as string) || null,
            starCount: Number(repoData.stargazers_count) || 0,
            forkCount: Number(repoData.forks_count) || 0,
            isPrivate: Boolean(repoData.private) || false,
            license: (repoData.license as any)?.name || null,
            topics: Array.isArray(repoData.topics) ? repoData.topics : [],
            size: Number(repoData.size) || null,
            openIssues: Number(repoData.open_issues_count) || 0,
            hasWiki: Boolean(repoData.has_wiki) || false,
            hasPages: Boolean(repoData.has_pages) || false,
            archived: Boolean(repoData.archived) || false,
            disabled: Boolean(repoData.disabled) || false,
            pushedAt: repoData.pushed_at ? new Date(repoData.pushed_at) : null,
          },
          update: {
            title,
            description,
            tags: parsedMd?.tags || [],
            icon: parsedMd?.icon,
            image: parsedMd?.image,
            demoUrl: parsedMd?.demoUrl,
            valid,
            validationErrors,
            featured: parsedMd?.featured ?? false,
            published: parsedMd?.published ?? false,
            category: parsedMd?.category,
            order: parsedMd?.order,
            blacklisted,
            markdown: parsedMd?.body || '',
            lastCommitAt: new Date(repoData.pushed_at),
            githubMetadata,
            customMetadata,
            syncedAt: new Date(),
            // Update enhanced fields
            defaultBranch: (repoData.default_branch as string) || 'main',
            language: (repoData.language as string) || null,
            starCount: Number(repoData.stargazers_count) || 0,
            forkCount: Number(repoData.forks_count) || 0,
            isPrivate: Boolean(repoData.private) || false,
            license: (repoData.license as any)?.name || null,
            topics: Array.isArray(repoData.topics) ? repoData.topics : [],
            size: Number(repoData.size) || null,
            openIssues: Number(repoData.open_issues_count) || 0,
            hasWiki: Boolean(repoData.has_wiki) || false,
            hasPages: Boolean(repoData.has_pages) || false,
            archived: Boolean(repoData.archived) || false,
            disabled: Boolean(repoData.disabled) || false,
            pushedAt: repoData.pushed_at ? new Date(repoData.pushed_at) : null,
          },
        });
      });

      // Enhanced cache invalidation with error handling
      try {
        if (project) {
          const cacheKey = `user:${project.ownerId}:repo:${repoUrl}`;
          await Promise.all([
            this.cache.del(cacheKey),
            this.cache.del(`user:${project.ownerId}:projects`),
            this.cache.del(`projects:${project.ownerId}`), // Additional cache key
          ]);
          await this.cache.set(cacheKey, project);

          this.logger.debug(`Cache invalidated successfully`, {
            syncId,
            cacheKey,
          });
        }
      } catch (cacheError) {
        // Don't fail the sync if cache operations fail
        this.logger.warn(`Cache operations failed`, {
          syncId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
      }

      // Trigger AI enrichment
      try {
        if (project && !project.blacklisted && !project.deletedAt) {
          await this.queueManager.addJob(
            QueueType.AI_ENRICHMENT,
            'enrich-project',
            {
              repositoryId: project.id,
              userId: project.ownerId,
              repositoryUrl: project.repoUrl,
              enrichmentType: 'full',
              options: {
                forceRegenerate: false,
                includeReadme: true,
                analyzeCode: true,
                generateTags: true,
              },
            }
          );
          this.logger.debug(`Queued AI enrichment for project ${project.id}`, { syncId });
        }
      } catch (error) {
        this.logger.warn(`Failed to queue AI enrichment`, {
          syncId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const operationDuration = Date.now() - operationStart;
      if (project) {
        this.logger.info(`GitHub sync operation completed successfully`, {
          syncId,
          projectId: project.id,
          title: project.title,
          valid: project.valid,
          portfolioMdExists,
          validationErrors: validationErrors.length,
          duration: operationDuration,
        });

        return project;
      } else {
        throw new Error('Project creation failed');
      }
    } catch (error) {
      const operationDuration = Date.now() - operationStart;
      this.logger.error(`GitHub sync operation failed`, {
        syncId,
        userId,
        repoUrl,
        branch,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration: operationDuration,
      });

      // Re-throw with enhanced error information
      const enhancedError = new Error(
        `Failed to sync project from GitHub: ${error instanceof Error ? error.message : String(error)}`,
      );
      (enhancedError as any).cause = error;
      throw enhancedError;
    }
  }

  /**
   * Return all projects belonging to the provided user. Results are cached to
   * avoid hitting the database repeatedly.
   * Enhanced with better cache invalidation, error handling, and consistent soft delete filtering.
   */
  async getAllProjectsForUser(userId: string, includeDeleted = false): Promise<Project[]> {
    const cacheKey = `user:${userId}:projects${includeDeleted ? ':all' : ''}`;

    try {
      const cached = await this.cache.get<Project[]>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for user projects`, {
          userId,
          cacheKey,
          includeDeleted,
        });
        return cached;
      }
    } catch (cacheError) {
      this.logger.warn(`Cache get failed for user projects`, {
        userId,
        cacheKey,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
      // Continue to database query if cache fails
    }

    try {
      const whereClause: Prisma.ProjectWhereInput = {
        ownerId: userId,
        ...(includeDeleted ? {} : { deletedAt: null }), // Conditionally exclude soft-deleted projects
      };

      const projects = await this.prisma.project.findMany({
        where: whereClause,
        orderBy: [
          { featured: 'desc' }, // Featured projects first
          { published: 'desc' }, // Then published projects
          { updatedAt: 'desc' }, // Then by most recently updated
        ],
        include: {
          // Include related data to avoid N+1 queries later
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

      // Cache the result for 5 minutes
      await this.cache.set(cacheKey, projects, 300000);

      this.logger.debug(`Cached ${projects.length} projects for user`, {
        userId,
        cacheKey,
      });

      return projects;
    } catch (dbError) {
      this.logger.error(`Database query failed for user projects`, {
        userId,
        includeDeleted,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      throw dbError;
    }
  }

  /**
   * Return paginated projects for the provided user.
   */
  async getPaginatedProjectsForUser(
    userId: string,
    pagination: PaginationDto,
    includeDeleted = false,
  ): Promise<PaginatedResult<Project>> {
    const { page = 1, limit = 20, sortBy, sortDirection = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const cacheKey = `user:${userId}:projects:p:${page}:l:${limit}:s:${sortBy || 'def'}:${sortDirection}${includeDeleted ? ':del' : ''}`;

    try {
      const cached = await this.cache.get<PaginatedResult<Project>>(cacheKey);
      if (cached) return cached;
    } catch (e) { }

    const whereClause: Prisma.ProjectWhereInput = {
      ownerId: userId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    };

    let orderBy: Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[];

    if (sortBy) {
      orderBy = { [sortBy]: sortDirection };
    } else {
      orderBy = [
        { featured: 'desc' },
        { published: 'desc' },
        { updatedAt: 'desc' },
      ];
    }

    try {
      const [total, projects] = await this.prisma.$transaction([
        this.prisma.project.count({ where: whereClause }),
        this.prisma.project.findMany({
          where: whereClause,
          orderBy,
          skip,
          take: limit,
          include: {
            aiAnalysis: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                confidence: true,
                createdAt: true,
              }
            }
          }
        })
      ]);

      const totalPages = Math.ceil(total / limit);
      const result: PaginatedResult<Project> = {
        data: projects,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        }
      };

      await this.cache.set(cacheKey, result, 300000);
      return result;

    } catch (error) {
      throw new DatabaseError(`Failed to fetch paginated projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve projects for a user based on optional filter criteria.
   */
  async getFilteredProjectsForUser(
    filter: { tag?: string; category?: string; featured?: boolean },
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

    return this.prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Look up a single project by its repository URL. Cached results are
   * returned if available.
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
    if (project) await this.cache.set(cacheKey, project);
    return project;
  }

  /**
   * Fetch a project by its database ID ensuring it belongs to the given user.
   */
  async getProjectById(id: string, userId: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { id, ownerId: userId },
    });
  }

  /**
   * Synchronize all repositories for the given user, respecting any blacklist
   * flags found in `Profile.md`.
   */
  async syncAllReposForUser(userId: string): Promise<void> {
    const startTime = Date.now();
    const syncedProjects: Array<{
      id: string;
      title: string;
      repoUrl: string;
      language?: string;
      starCount: number;
      isPrivate: boolean;
    }> = [];

    try {
      // Publish sync started event
      await this.syncEvents.publishSyncStarted(userId, 'Fetching repositories from GitHub...');

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      // Check both githubToken and accessToken for backwards compatibility
      const encryptedToken = user?.githubToken || user?.accessToken;
      if (!encryptedToken) {
        await this.syncEvents.publishSyncFailed(userId, 'GitHub token not found for user');
        throw new Error('GitHub token not found for user');
      }
      const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
      // Only decrypt if the token looks encrypted (contains non-token characters)
      let token = encryptedToken;
      if (key && !encryptedToken.startsWith('gho_') && !encryptedToken.startsWith('ghp_')) {
        try {
          token = decrypt(encryptedToken, key);
        } catch {
          // Token might not be encrypted, use as-is
          token = encryptedToken;
        }
      }

      const headers = { Authorization: `token ${token}` };

      // 1. Fetch all repositories
      const repos = await axios.get<GitHubRepo[]>(
        'https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=updated',
        { headers },
      );

      const totalRepos = repos.data.length;
      let processedCount = 0;

      // 2. Upsert all repositories immediately as placeholders
      await this.syncEvents.publishSyncProgress(userId, 0, totalRepos, 'Creating project placeholders...');

      for (const repo of repos.data) {
        processedCount++;
        const repoUrl = repo.html_url;

        // Upsert project placeholder
        // This ensures the user sees the project immediately
        // The background worker will later populate details or mark as blacklisted
        const project = await this.prisma.project.upsert({
          where: {
            ownerId_repoUrl: {
              ownerId: userId,
              repoUrl: String(repoUrl),
            },
          },
          create: {
            ownerId: userId,
            title: repo.name,
            description: repo.description || '',
            repoUrl: String(repoUrl),
            featured: false,
            published: false, // Default to false, worker will enable if Portfolio.md exists
            githubSync: true,
            blacklisted: false, // Assume active until worker verifies otherwise
            markdown: '',
            tags: [],
            collaborators: [],
            firstCommitAt: null,
            lastCommitAt: new Date(repo.pushed_at),
            githubMetadata: isInputJsonValue(repo) ? (repo as Prisma.InputJsonValue) : {},
            customMetadata: {},
            syncedAt: new Date(),
          },
          update: {
            description: repo.description || '',
            lastCommitAt: new Date(repo.pushed_at),
            githubMetadata: isInputJsonValue(repo) ? (repo as Prisma.InputJsonValue) : {},
            syncedAt: new Date(),
          },
        });

        // Add to synced lists for response/event
        syncedProjects.push({
          id: project.id,
          title: project.title,
          repoUrl: String(repoUrl),
          language: typeof repo.language === 'string' ? repo.language : undefined,
          starCount: Number(repo.stargazers_count) || 0,
          isPrivate: Boolean(repo.private),
        });

        // 3. Queue background sync job for content
        // IMPORTANT: We use the queue to handle rate limiting and methodically sync content
        try {
          await this.queueSyncProject(
            userId,
            String(repoUrl),
            typeof repo.default_branch === 'string' ? repo.default_branch : 'main',
          );
        } catch (queueError) {
          this.logger.error(`Failed to queue sync for ${repo.name}`, queueError);
        }

        // Publish incremental progress
        if (processedCount % 5 === 0) {
          await this.syncEvents.publishSyncProgress(
            userId,
            processedCount,
            totalRepos,
            `Queued ${processedCount}/${totalRepos} repositories...`,
          );
        }
      }

      await this.cache.del(`projects:${userId}`);

      const duration = Date.now() - startTime;

      // Publish sync completed event (placeholders created)
      await this.syncEvents.publishSyncCompleted(userId, syncedProjects, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Publish sync failed event (if not already published)
      if (!errorMessage.includes('GitHub token not found')) {
        await this.syncEvents.publishSyncFailed(userId, errorMessage);
      }

      throw error;
    }
  }

  // Enhanced GraphQL methods
  async getEnhancedProjects(
    userId: string,
    filter: any = {},
    sort?: any,
    pagination: any = { offset: 0, limit: 20 },
  ): Promise<any> {
    const { offset = 0, limit = 20 } = pagination;

    // Build where clause from filter with soft delete filtering
    const where: Prisma.ProjectWhereInput = {
      ownerId: userId,
      deletedAt: null, // Always filter out soft-deleted projects
      ...(filter.search && {
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { description: { contains: filter.search, mode: 'insensitive' } },
          { tags: { hasSome: [filter.search] } },
        ],
      }),
      ...(filter.categories && { category: { in: filter.categories } }),
      ...(filter.languages && { language: { in: filter.languages } }),
      ...(filter.platforms && { platform: { in: filter.platforms } }),
      ...(filter.tags && { tags: { hasSome: filter.tags } }),
      ...(filter.featured !== undefined && { featured: filter.featured }),
      ...(filter.published !== undefined && { published: filter.published }),
      ...(filter.isPrivate !== undefined && { isPrivate: filter.isPrivate }),
      ...(filter.isArchived !== undefined && { archived: filter.isArchived }),
      ...(filter.hasIssues !== undefined && { openIssues: { gt: 0 } }),
      ...(filter.hasWiki !== undefined && { hasWiki: filter.hasWiki }),
      ...(filter.hasPages !== undefined && { hasPages: filter.hasPages }),
      ...(filter.starCount && {
        starCount: {
          ...(filter.starCount.min !== undefined && {
            gte: filter.starCount.min,
          }),
          ...(filter.starCount.max !== undefined && {
            lte: filter.starCount.max,
          }),
        },
      }),
      ...(filter.forkCount && {
        forkCount: {
          ...(filter.forkCount.min !== undefined && {
            gte: filter.forkCount.min,
          }),
          ...(filter.forkCount.max !== undefined && {
            lte: filter.forkCount.max,
          }),
        },
      }),
      ...(filter.size && {
        size: {
          ...(filter.size.min !== undefined && { gte: filter.size.min }),
          ...(filter.size.max !== undefined && { lte: filter.size.max }),
        },
      }),
      ...(filter.createdAt && {
        createdAt: {
          ...(filter.createdAt.from && {
            gte: new Date(filter.createdAt.from),
          }),
          ...(filter.createdAt.to && { lte: new Date(filter.createdAt.to) }),
        },
      }),
      ...(filter.updatedAt && {
        updatedAt: {
          ...(filter.updatedAt.from && {
            gte: new Date(filter.updatedAt.from),
          }),
          ...(filter.updatedAt.to && { lte: new Date(filter.updatedAt.to) }),
        },
      }),
      ...(filter.lastCommitAt && {
        lastCommitAt: {
          ...(filter.lastCommitAt.from && {
            gte: new Date(filter.lastCommitAt.from),
          }),
          ...(filter.lastCommitAt.to && {
            lte: new Date(filter.lastCommitAt.to),
          }),
        },
      }),
      ...(filter.minPopularityScore !== undefined && {
        starCount: { gte: filter.minPopularityScore },
      }),
    };

    // Build orderBy clause from sort
    let orderBy: Prisma.ProjectOrderByWithRelationInput = { updatedAt: 'desc' };
    if (sort) {
      const sortField = sort.field?.toLowerCase();
      const sortOrder = sort.order?.toLowerCase() || 'desc';

      switch (sortField) {
        case 'title':
          orderBy = { title: sortOrder };
          break;
        case 'created_at':
          orderBy = { createdAt: sortOrder };
          break;
        case 'updated_at':
          orderBy = { updatedAt: sortOrder };
          break;
        case 'stars':
          orderBy = { starCount: sortOrder };
          break;
        case 'forks':
          orderBy = { forkCount: sortOrder };
          break;
        case 'last_commit':
          orderBy = { lastCommitAt: sortOrder };
          break;
        case 'popularity':
          // Use stars as primary popularity indicator
          orderBy = { starCount: sortOrder };
          break;
        default:
          orderBy = { updatedAt: 'desc' };
      }
    }

    // Execute count and data queries in parallel for better performance
    const [totalCount, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          aiAnalysis: {
            orderBy: { version: 'desc' },
            take: 1, // Only get the latest AI analysis to avoid N+1
          },
          syncHistory: {
            where: { status: 'completed' },
            orderBy: { completedAt: 'desc' },
            take: 1, // Only get the latest successful sync
            select: {
              id: true,
              completedAt: true,
              duration: true,
            },
          },
        },
      }),
    ]);

    // Build edges with cursors
    const edges = projects.map((project, index) => ({
      node: {
        ...project,
        // Flatten the latest AI analysis for easier access
        latestAiAnalysis: project.aiAnalysis[0] || null,
        latestSync: project.syncHistory[0] || null,
        // Remove the arrays to avoid confusion
        aiAnalysis: undefined,
        syncHistory: undefined,
      },
      cursor: Buffer.from(`${offset + index}`).toString('base64'),
    }));

    // Calculate pagination info
    const hasNextPage = offset + limit < totalCount;
    const hasPreviousPage = offset > 0;
    const startCursor = edges.length > 0 ? edges[0].cursor : null;
    const endCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage,
        startCursor,
        endCursor,
      },
      totalCount,
    };
  }

  async searchProjects(
    userId: string,
    query: string,
    filter: any = {},
    pagination: any = { offset: 0, limit: 20 },
  ): Promise<Project[]> {
    const { offset = 0, limit = 20 } = pagination;

    if (!query || query.trim().length === 0) {
      // If no query, return filtered projects
      const result = await this.getEnhancedProjects(userId, filter, undefined, pagination);
      return result.edges.map((edge: any) => edge.node);
    }

    // Prepare search terms for PostgreSQL full-text search
    const searchTerms = query.trim().split(/\s+/).join(' & ');

    // Build base where clause from filter
    const baseWhere: Prisma.ProjectWhereInput = {
      ownerId: userId,
      ...(filter.categories && { category: { in: filter.categories } }),
      ...(filter.languages && { language: { in: filter.languages } }),
      ...(filter.platforms && { platform: { in: filter.platforms } }),
      ...(filter.tags && { tags: { hasSome: filter.tags } }),
      ...(filter.featured !== undefined && { featured: filter.featured }),
      ...(filter.published !== undefined && { published: filter.published }),
      ...(filter.isPrivate !== undefined && { isPrivate: filter.isPrivate }),
      ...(filter.isArchived !== undefined && { archived: filter.isArchived }),
    };

    // Use raw SQL for full-text search with ranking
    const searchQuery = `
      SELECT p.*, 
             ts_rank(
               to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '') || ' ' || array_to_string(p.tags, ' ')),
               plainto_tsquery('english', $1)
             ) as rank
      FROM "Project" p
      WHERE p."ownerId" = $2
        AND to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '') || ' ' || array_to_string(p.tags, ' '))
            @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC, p."updatedAt" DESC
      LIMIT $3 OFFSET $4
    `;

    try {
      const searchResults = await this.prisma.$queryRawUnsafe(
        searchQuery,
        query,
        userId,
        limit,
        offset,
      );

      // If we have search results, return them
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        return searchResults as Project[];
      }
    } catch (error) {
      this.logger.warn(`Full-text search failed, falling back to simple search: ${error}`);
    }

    // Fallback to simple LIKE search if full-text search fails
    const fallbackWhere: Prisma.ProjectWhereInput = {
      ...baseWhere,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: query.split(/\s+/) } },
      ],
    };

    return this.prisma.project.findMany({
      where: fallbackWhere,
      orderBy: [{ featured: 'desc' }, { starCount: 'desc' }, { updatedAt: 'desc' }],
      skip: offset,
      take: limit,
      include: {
        aiAnalysis: true,
      },
    });
  }

  async getProjectStatistics(userId: string, filter: any = {}): Promise<any> {
    // Build where clause from filter
    const where: Prisma.ProjectWhereInput = {
      ownerId: userId,
      ...(filter.categories && { category: { in: filter.categories } }),
      ...(filter.languages && { language: { in: filter.languages } }),
      ...(filter.platforms && { platform: { in: filter.platforms } }),
      ...(filter.tags && { tags: { hasSome: filter.tags } }),
      ...(filter.featured !== undefined && { featured: filter.featured }),
      ...(filter.published !== undefined && { published: filter.published }),
      ...(filter.isPrivate !== undefined && { isPrivate: filter.isPrivate }),
      ...(filter.isArchived !== undefined && { archived: filter.isArchived }),
      ...(filter.createdAt && {
        createdAt: {
          ...(filter.createdAt.from && {
            gte: new Date(filter.createdAt.from),
          }),
          ...(filter.createdAt.to && { lte: new Date(filter.createdAt.to) }),
        },
      }),
    };

    // Get basic counts
    const [totalProjects, publicProjects, privateProjects, featuredProjects, aggregates] =
      await Promise.all([
        this.prisma.project.count({ where }),
        this.prisma.project.count({ where: { ...where, published: true } }),
        this.prisma.project.count({ where: { ...where, published: false } }),
        this.prisma.project.count({ where: { ...where, featured: true } }),
        this.prisma.project.aggregate({
          where,
          _sum: {
            starCount: true,
            forkCount: true,
          },
        }),
      ]);

    // Get language statistics
    const languageStats = await this.prisma.project.groupBy({
      by: ['language'],
      where: {
        ...where,
        language: { not: null },
      },
      _count: {
        language: true,
      },
      _sum: {
        starCount: true,
        forkCount: true,
      },
      orderBy: {
        _count: {
          language: 'desc',
        },
      },
    });

    // Get category statistics
    const categoryStats = await this.prisma.project.groupBy({
      by: ['category'],
      where: {
        ...where,
        category: { not: null },
      },
      _count: {
        category: true,
      },
      orderBy: {
        _count: {
          category: 'desc',
        },
      },
    });

    // Get platform statistics using raw query for simplicity
    const platformStatsRaw = await this.prisma.$queryRaw<
      Array<{ platform: string; count: bigint }>
    >`
      SELECT platform, COUNT(*) as count
      FROM "Project"
      WHERE "ownerId" = ${userId}
        AND platform IS NOT NULL
      GROUP BY platform
      ORDER BY count DESC
    `;

    // Format language statistics
    const formattedLanguageStats = languageStats.map(stat => ({
      language: stat.language || 'Unknown',
      count: stat._count.language,
      percentage: totalProjects > 0 ? (stat._count.language / totalProjects) * 100 : 0,
      totalBytes: 0, // Would need to calculate from languages JSON field
    }));

    // Format category statistics
    const formattedCategoryStats = categoryStats.map(stat => ({
      category: stat.category || 'Uncategorized',
      count: stat._count.category,
      percentage: totalProjects > 0 ? (stat._count.category / totalProjects) * 100 : 0,
    }));

    // Format platform statistics
    const formattedPlatformStats = platformStatsRaw.map(stat => ({
      platform: stat.platform || 'Unknown',
      count: Number(stat.count),
      percentage: totalProjects > 0 ? (Number(stat.count) / totalProjects) * 100 : 0,
    }));

    return {
      totalProjects,
      publicProjects,
      privateProjects,
      featuredProjects,
      totalStars: aggregates._sum.starCount || 0,
      totalForks: aggregates._sum.forkCount || 0,
      languageStats: formattedLanguageStats,
      categoryStats: formattedCategoryStats,
      platformStats: formattedPlatformStats,
    };
  }

  async getTrendingProjects(timeframe: string = '7d', limit: number = 10): Promise<Project[]> {
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Use raw SQL for complex trending calculation
    const trendingQuery = `
      SELECT p.*,
             (
               COALESCE(p."starCount", 0) * 0.4 +
               COALESCE(p."forkCount", 0) * 0.3 +
               CASE 
                 WHEN p."lastCommitAt" > $1 THEN 20
                 WHEN p."lastCommitAt" > $2 THEN 10
                 ELSE 0
               END +
               CASE 
                 WHEN p."createdAt" > $1 THEN 15
                 WHEN p."createdAt" > $2 THEN 5
                 ELSE 0
               END +
               CASE WHEN p.featured THEN 10 ELSE 0 END
             ) as trending_score
      FROM "Project" p
      WHERE p.published = true
        AND p.archived = false
        AND (p."lastCommitAt" > $3 OR p."createdAt" > $3)
      ORDER BY trending_score DESC, p."starCount" DESC
      LIMIT $4
    `;

    try {
      const recentDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const veryRecentDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const trendingResults = await this.prisma.$queryRawUnsafe(
        trendingQuery,
        veryRecentDate.toISOString(),
        recentDate.toISOString(),
        startDate.toISOString(),
        limit,
      );

      if (Array.isArray(trendingResults) && trendingResults.length > 0) {
        return trendingResults as Project[];
      }
    } catch (error) {
      this.logger.warn(`Trending projects query failed, falling back to simple sort: ${error}`);
    }

    // Fallback to simple sorting if complex query fails
    return this.prisma.project.findMany({
      where: {
        published: true,
        archived: false,
        OR: [{ lastCommitAt: { gte: startDate } }, { createdAt: { gte: startDate } }],
      },
      orderBy: [
        { featured: 'desc' },
        { starCount: 'desc' },
        { forkCount: 'desc' },
        { lastCommitAt: 'desc' },
      ],
      take: limit,
      include: {
        aiAnalysis: true,
      },
    });
  }

  async getFeaturedProjects(limit: number): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: {
        published: true,
        featured: true,
      },
      orderBy: { starCount: 'desc' },
      take: limit,
    });
  }

  /**
   * Enhanced cache invalidation helper method
   */
  private async invalidateProjectCaches(userId: string, repoUrl?: string): Promise<void> {
    const cacheKeys = [`user:${userId}:projects`, `projects:${userId}`];

    if (repoUrl) {
      cacheKeys.push(`user:${userId}:repo:${repoUrl}`);
    }

    // Add pattern-based cache keys
    const patternKeys = [`user:${userId}:*`, `projects:*:${userId}`];

    try {
      // Delete specific cache keys
      const deletePromises = cacheKeys.map(key =>
        this.cache.del(key).catch(error => {
          this.logger.warn(`Failed to delete cache key: ${key}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }),
      );

      await Promise.all(deletePromises);

      this.logger.debug(`Cache invalidation completed`, {
        userId,
        repoUrl,
        keysInvalidated: cacheKeys.length,
      });
    } catch (error) {
      this.logger.error(`Cache invalidation failed`, {
        userId,
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw error - cache invalidation failure shouldn't break the operation
    }
  }

  /**
   * Enhanced method to handle concurrent project sync operations
   */
  async syncProjectSafely(
    userId: string,
    repoUrl: string,
    branch = 'main',
    blacklisted = false,
  ): Promise<Project> {
    const lockKey = `sync-lock:${userId}:${Buffer.from(repoUrl).toString('base64')}`;
    const lockTTL = 300; // 5 minutes

    try {
      // Try to acquire lock (simplified - in production use Redis SET NX EX)
      const existingLock = await this.cache.get(lockKey);
      if (existingLock) {
        this.logger.warn(`Sync already in progress for repository`, {
          userId,
          repoUrl,
          lockKey,
        });
        throw new Error(`Sync already in progress for repository: ${repoUrl}`);
      }

      // Acquire lock
      await this.cache.set(lockKey, Date.now(), lockTTL * 1000);

      try {
        // Perform the sync
        const result = await this.syncProjectFromGitHub(userId, repoUrl, branch, blacklisted);

        // Invalidate related caches
        await this.invalidateProjectCaches(userId, repoUrl);

        return result;
      } finally {
        // Release lock
        await this.cache.del(lockKey);
      }
    } catch (error) {
      this.logger.error(`Safe sync failed for repository`, {
        userId,
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
