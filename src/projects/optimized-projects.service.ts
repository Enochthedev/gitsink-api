import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryCacheService } from '../common/services/query-cache.service';
import { DatabasePerformanceService } from '../common/services/database-performance.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, Project } from '@prisma/client';

export interface OptimizedQueryOptions {
  useCache?: boolean;
  cacheTtl?: number;
  cacheTags?: string[];
  enableProfiling?: boolean;
}

export interface PaginationOptions {
  offset?: number;
  limit?: number;
  cursor?: string;
}

export interface ProjectFilter {
  search?: string;
  categories?: string[];
  languages?: string[];
  platforms?: string[];
  tags?: string[];
  featured?: boolean;
  published?: boolean;
  isPrivate?: boolean;
  isArchived?: boolean;
  starCount?: { min?: number; max?: number };
  forkCount?: { min?: number; max?: number };
  createdAt?: { from?: Date; to?: Date };
  updatedAt?: { from?: Date; to?: Date };
  lastCommitAt?: { from?: Date; to?: Date };
}

export interface ProjectSort {
  field: 'title' | 'created_at' | 'updated_at' | 'stars' | 'forks' | 'last_commit' | 'popularity';
  order: 'asc' | 'desc';
}

@Injectable()
export class OptimizedProjectsService {
  private readonly logger = new Logger(OptimizedProjectsService.name);
  private readonly defaultCacheTtl: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly queryCacheService: QueryCacheService,
    private readonly performanceService: DatabasePerformanceService,
    private readonly configService: ConfigService,
  ) {
    this.defaultCacheTtl = this.configService.get<number>('PROJECT_CACHE_TTL', 300); // 5 minutes
  }

  /**
   * Get projects with optimized caching and performance monitoring
   */
  async getProjectsOptimized(
    userId: string,
    filter: ProjectFilter = {},
    sort?: ProjectSort,
    pagination: PaginationOptions = {},
    options: OptimizedQueryOptions = {},
  ): Promise<{
    projects: Project[];
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    performance: { queryTime: number; cacheHit: boolean };
  }> {
    const startTime = Date.now();
    const { offset = 0, limit = 20 } = pagination;
    const { useCache = true, cacheTtl = this.defaultCacheTtl, cacheTags = ['projects'] } = options;

    // Generate cache key
    const cacheKey = this.queryCacheService.generateQueryKey(
      'getProjects',
      { userId, filter, sort, pagination },
      userId,
    );

    let cacheHit = false;

    // Try cache first if enabled
    if (useCache) {
      const cached = await this.queryCacheService.get(cacheKey, {
        namespace: 'projects',
        ttl: cacheTtl,
        tags: [...cacheTags, `user:${userId}`],
      });

      if (cached) {
        cacheHit = true;
        const queryTime = Date.now() - startTime;
        this.logger.debug(`Cache hit for projects query (${queryTime}ms)`);

        return {
          projects: (cached as any)?.projects || [],
          totalCount: (cached as any)?.totalCount || 0,
          hasNextPage: (cached as any)?.hasNextPage || false,
          hasPreviousPage: (cached as any)?.hasPreviousPage || false,
          performance: { queryTime, cacheHit },
        };
      }
    }

    // Build optimized query
    const where = this.buildWhereClause(userId, filter);
    const orderBy = this.buildOrderByClause(sort);

    try {
      // Execute queries in parallel for better performance
      const [projects, totalCount] = await Promise.all([
        this.executeOptimizedProjectQuery(
          where,
          Array.isArray(orderBy) ? orderBy[0] : orderBy,
          offset,
          limit,
        ),
        this.executeOptimizedCountQuery(where),
      ]);

      // Calculate pagination info
      const hasNextPage = offset + limit < totalCount;
      const hasPreviousPage = offset > 0;

      const result = {
        projects,
        totalCount,
        hasNextPage,
        hasPreviousPage,
        performance: { queryTime: Date.now() - startTime, cacheHit },
      };

      // Cache the result if caching is enabled
      if (useCache) {
        await this.queryCacheService.set(cacheKey, result, {
          namespace: 'projects',
          ttl: cacheTtl,
          tags: [...cacheTags, `user:${userId}`],
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Optimized projects query failed', error);
      throw error;
    }
  }

  /**
   * Search projects with full-text search optimization
   */
  async searchProjectsOptimized(
    userId: string,
    query: string,
    filter: ProjectFilter = {},
    pagination: PaginationOptions = {},
    options: OptimizedQueryOptions = {},
  ): Promise<{
    projects: Project[];
    totalCount: number;
    searchTime: number;
    cacheHit: boolean;
  }> {
    const startTime = Date.now();
    const { offset = 0, limit = 20 } = pagination;
    const { useCache = true, cacheTtl = this.defaultCacheTtl } = options;

    if (!query || query.trim().length === 0) {
      const result = await this.getProjectsOptimized(
        userId,
        filter,
        undefined,
        pagination,
        options,
      );
      return {
        projects: result.projects,
        totalCount: result.totalCount,
        searchTime: result.performance.queryTime,
        cacheHit: result.performance.cacheHit,
      };
    }

    // Generate cache key for search
    const cacheKey = this.queryCacheService.generateQueryKey(
      'searchProjects',
      { userId, query, filter, pagination },
      userId,
    );

    let cacheHit = false;

    // Try cache first
    if (useCache) {
      const cached = await this.queryCacheService.get(cacheKey, {
        namespace: 'search',
        ttl: cacheTtl,
        tags: ['projects', 'search', `user:${userId}`],
      });

      if (cached) {
        cacheHit = true;
        return {
          projects: (cached as any)?.projects || [],
          totalCount: (cached as any)?.totalCount || 0,
          searchTime: Date.now() - startTime,
          cacheHit,
        };
      }
    }

    try {
      // Use PostgreSQL full-text search for better performance
      const searchResults = await this.executeFullTextSearch(userId, query, filter, offset, limit);
      const totalCount = await this.executeFullTextSearchCount(userId, query, filter);

      const result = {
        projects: searchResults,
        totalCount,
        searchTime: Date.now() - startTime,
        cacheHit,
      };

      // Cache search results
      if (useCache) {
        await this.queryCacheService.set(cacheKey, result, {
          namespace: 'search',
          ttl: cacheTtl,
          tags: ['projects', 'search', `user:${userId}`],
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Full-text search failed, falling back to simple search', error);

      // Fallback to simple LIKE search
      return this.executeSimpleSearch(userId, query, filter, pagination, options);
    }
  }

  /**
   * Get project statistics with caching
   */
  async getProjectStatisticsOptimized(
    userId: string,
    filter: ProjectFilter = {},
    options: OptimizedQueryOptions = {},
  ): Promise<any> {
    const { useCache = true, cacheTtl = this.defaultCacheTtl * 2 } = options; // Longer cache for stats

    const cacheKey = this.queryCacheService.generateQueryKey(
      'getProjectStatistics',
      { userId, filter },
      userId,
    );

    if (useCache) {
      const cached = await this.queryCacheService.get(cacheKey, {
        namespace: 'statistics',
        ttl: cacheTtl,
        tags: ['projects', 'statistics', `user:${userId}`],
      });

      if (cached) {
        return cached;
      }
    }

    const where = this.buildWhereClause(userId, filter);

    try {
      // Execute statistics queries in parallel
      const [basicStats, languageStats, categoryStats, platformStats] = await Promise.all([
        this.getBasicStatistics(where),
        this.getLanguageStatistics(where),
        this.getCategoryStatistics(where),
        this.getPlatformStatistics(userId),
      ]);

      const result = {
        ...basicStats,
        languageStats,
        categoryStats,
        platformStats,
        generatedAt: new Date(),
      };

      // Cache the statistics
      if (useCache) {
        await this.queryCacheService.set(cacheKey, result, {
          namespace: 'statistics',
          ttl: cacheTtl,
          tags: ['projects', 'statistics', `user:${userId}`],
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get project statistics', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for user projects
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.queryCacheService.invalidateByTags([`user:${userId}`]);
    this.logger.debug(`Invalidated cache for user: ${userId}`);
  }

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(userId: string): Promise<void> {
    const commonQueries = [
      // Most common project queries
      {
        filter: {},
        sort: { field: 'updated_at' as const, order: 'desc' as const },
      },
      {
        filter: { published: true },
        sort: { field: 'stars' as const, order: 'desc' as const },
      },
      {
        filter: { featured: true },
        sort: { field: 'updated_at' as const, order: 'desc' as const },
      },
    ];

    const warmingTasks = commonQueries.map(({ filter, sort }) => ({
      key: this.queryCacheService.generateQueryKey('getProjects', { userId, filter, sort }, userId),
      factory: () => this.getProjectsOptimized(userId, filter, sort, {}, { useCache: false }),
      options: {
        namespace: 'projects',
        ttl: this.defaultCacheTtl,
        tags: ['projects', `user:${userId}`],
      },
    }));

    // Add statistics warming
    warmingTasks.push({
      key: this.queryCacheService.generateQueryKey('getProjectStatistics', { userId }, userId),
      factory: () => this.getProjectStatisticsOptimized(userId, {}, { useCache: false }),
      options: {
        namespace: 'statistics',
        ttl: this.defaultCacheTtl * 2,
        tags: ['projects', 'statistics', `user:${userId}`],
      },
    });

    await this.queryCacheService.warmCache(warmingTasks);
    this.logger.debug(`Warmed cache for user: ${userId}`);
  }

  private buildWhereClause(userId: string, filter: ProjectFilter): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = {
      ownerId: userId,
      deletedAt: null, // Only active projects
    };

    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { tags: { hasSome: filter.search.split(/\s+/) } },
      ];
    }

    if (filter.categories?.length) {
      where.category = { in: filter.categories };
    }

    if (filter.languages?.length) {
      where.language = { in: filter.languages };
    }

    if (filter.platforms?.length) {
      where.platform = { in: filter.platforms };
    }

    if (filter.tags?.length) {
      where.tags = { hasSome: filter.tags };
    }

    if (filter.featured !== undefined) {
      where.featured = filter.featured;
    }

    if (filter.published !== undefined) {
      where.published = filter.published;
    }

    if (filter.isPrivate !== undefined) {
      where.isPrivate = filter.isPrivate;
    }

    if (filter.isArchived !== undefined) {
      where.archived = filter.isArchived;
    }

    if (filter.starCount) {
      where.starCount = {};
      if (filter.starCount.min !== undefined) {
        where.starCount.gte = filter.starCount.min;
      }
      if (filter.starCount.max !== undefined) {
        where.starCount.lte = filter.starCount.max;
      }
    }

    if (filter.forkCount) {
      where.forkCount = {};
      if (filter.forkCount.min !== undefined) {
        where.forkCount.gte = filter.forkCount.min;
      }
      if (filter.forkCount.max !== undefined) {
        where.forkCount.lte = filter.forkCount.max;
      }
    }

    if (filter.createdAt) {
      where.createdAt = {};
      if (filter.createdAt.from) {
        where.createdAt.gte = filter.createdAt.from;
      }
      if (filter.createdAt.to) {
        where.createdAt.lte = filter.createdAt.to;
      }
    }

    if (filter.updatedAt) {
      where.updatedAt = {};
      if (filter.updatedAt.from) {
        where.updatedAt.gte = filter.updatedAt.from;
      }
      if (filter.updatedAt.to) {
        where.updatedAt.lte = filter.updatedAt.to;
      }
    }

    if (filter.lastCommitAt) {
      where.lastCommitAt = {};
      if (filter.lastCommitAt.from) {
        where.lastCommitAt.gte = filter.lastCommitAt.from;
      }
      if (filter.lastCommitAt.to) {
        where.lastCommitAt.lte = filter.lastCommitAt.to;
      }
    }

    return where;
  }

  private buildOrderByClause(
    sort?: ProjectSort,
  ): Prisma.ProjectOrderByWithRelationInput | Prisma.ProjectOrderByWithRelationInput[] {
    if (!sort) {
      return { updatedAt: 'desc' };
    }

    const { field, order } = sort;

    switch (field) {
      case 'title':
        return { title: order };
      case 'created_at':
        return { createdAt: order };
      case 'updated_at':
        return { updatedAt: order };
      case 'stars':
        return { starCount: order };
      case 'forks':
        return { forkCount: order };
      case 'last_commit':
        return { lastCommitAt: order };
      case 'popularity':
        // Multi-field sort for popularity
        return [{ featured: 'desc' }, { starCount: order }, { forkCount: order }];
      default:
        return { updatedAt: 'desc' };
    }
  }

  private async executeOptimizedProjectQuery(
    where: Prisma.ProjectWhereInput,
    orderBy: Prisma.ProjectOrderByWithRelationInput,
    offset: number,
    limit: number,
  ): Promise<Project[]> {
    return this.prismaService.executeWithMetrics(
      () =>
        this.prismaService.project.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            aiAnalysis: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        }),
      'findManyProjects',
    );
  }

  private async executeOptimizedCountQuery(where: Prisma.ProjectWhereInput): Promise<number> {
    return this.prismaService.executeWithMetrics(
      () => this.prismaService.project.count({ where }),
      'countProjects',
    );
  }

  private async executeFullTextSearch(
    userId: string,
    query: string,
    filter: ProjectFilter,
    offset: number,
    limit: number,
  ): Promise<Project[]> {
    const baseWhere = this.buildWhereClause(userId, filter);

    // Build additional WHERE conditions for the raw query
    const conditions: string[] = ['"ownerId" = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filter.categories?.length) {
      conditions.push(`"category" = ANY($${paramIndex})`);
      params.push(filter.categories);
      paramIndex++;
    }

    if (filter.published !== undefined) {
      conditions.push(`"published" = $${paramIndex}`);
      params.push(filter.published);
      paramIndex++;
    }

    if (filter.featured !== undefined) {
      conditions.push(`"featured" = $${paramIndex}`);
      params.push(filter.featured);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const searchQuery = `
      SELECT p.*, 
             ts_rank(
               to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '') || ' ' || array_to_string(p.tags, ' ')),
               plainto_tsquery('english', $${paramIndex})
             ) as rank
      FROM "Project" p
      WHERE ${whereClause}
        AND p."deletedAt" IS NULL
        AND to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '') || ' ' || array_to_string(p.tags, ' '))
            @@ plainto_tsquery('english', $${paramIndex})
      ORDER BY rank DESC, p."starCount" DESC, p."updatedAt" DESC
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `;

    params.push(query, limit, offset);

    return this.prismaService.executeWithMetrics(
      () => this.prismaService.$queryRawUnsafe(searchQuery, ...params) as Promise<Project[]>,
      'fullTextSearch',
    );
  }

  private async executeFullTextSearchCount(
    userId: string,
    query: string,
    filter: ProjectFilter,
  ): Promise<number> {
    const baseWhere = this.buildWhereClause(userId, filter);

    const conditions: string[] = ['"ownerId" = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filter.categories?.length) {
      conditions.push(`"category" = ANY($${paramIndex})`);
      params.push(filter.categories);
      paramIndex++;
    }

    if (filter.published !== undefined) {
      conditions.push(`"published" = $${paramIndex}`);
      params.push(filter.published);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) as count
      FROM "Project" p
      WHERE ${whereClause}
        AND p."deletedAt" IS NULL
        AND to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '') || ' ' || array_to_string(p.tags, ' '))
            @@ plainto_tsquery('english', $${paramIndex})
    `;

    params.push(query);

    const result = await this.prismaService.executeWithMetrics(
      () =>
        this.prismaService.$queryRawUnsafe(countQuery, ...params) as Promise<
          Array<{ count: bigint }>
        >,
      'fullTextSearchCount',
    );

    return Number(result[0]?.count || 0);
  }

  private async executeSimpleSearch(
    userId: string,
    query: string,
    filter: ProjectFilter,
    pagination: PaginationOptions,
    options: OptimizedQueryOptions,
  ): Promise<any> {
    const searchFilter: ProjectFilter = {
      ...filter,
      search: query,
    };

    const result = await this.getProjectsOptimized(
      userId,
      searchFilter,
      undefined,
      pagination,
      options,
    );

    return {
      projects: result.projects,
      totalCount: result.totalCount,
      searchTime: result.performance.queryTime,
      cacheHit: result.performance.cacheHit,
    };
  }

  private async getBasicStatistics(where: Prisma.ProjectWhereInput): Promise<any> {
    const [totalProjects, publicProjects, privateProjects, featuredProjects, aggregates] =
      await Promise.all([
        this.prismaService.project.count({ where }),
        this.prismaService.project.count({
          where: { ...where, published: true },
        }),
        this.prismaService.project.count({
          where: { ...where, published: false },
        }),
        this.prismaService.project.count({ where: { ...where, featured: true } }),
        this.prismaService.project.aggregate({
          where,
          _sum: {
            starCount: true,
            forkCount: true,
          },
          _avg: {
            starCount: true,
            forkCount: true,
          },
        }),
      ]);

    return {
      totalProjects,
      publicProjects,
      privateProjects,
      featuredProjects,
      totalStars: aggregates._sum.starCount || 0,
      totalForks: aggregates._sum.forkCount || 0,
      averageStars: Math.round(aggregates._avg.starCount || 0),
      averageForks: Math.round(aggregates._avg.forkCount || 0),
    };
  }

  private async getLanguageStatistics(where: Prisma.ProjectWhereInput): Promise<any[]> {
    const languageStats = await this.prismaService.project.groupBy({
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
      take: 10, // Top 10 languages
    });

    const totalProjects = await this.prismaService.project.count({ where });

    return languageStats.map(stat => ({
      language: stat.language || 'Unknown',
      count: stat._count.language,
      percentage: totalProjects > 0 ? (stat._count.language / totalProjects) * 100 : 0,
      totalStars: stat._sum.starCount || 0,
      totalForks: stat._sum.forkCount || 0,
    }));
  }

  private async getCategoryStatistics(where: Prisma.ProjectWhereInput): Promise<any[]> {
    const categoryStats = await this.prismaService.project.groupBy({
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

    const totalProjects = await this.prismaService.project.count({ where });

    return categoryStats.map(stat => ({
      category: stat.category || 'Uncategorized',
      count: stat._count.category,
      percentage: totalProjects > 0 ? (stat._count.category / totalProjects) * 100 : 0,
    }));
  }

  private async getPlatformStatistics(userId: string): Promise<any[]> {
    const platformStatsRaw = await this.prismaService.$queryRaw<
      Array<{ platform: string; count: bigint }>
    >`
      SELECT platform, COUNT(*) as count
      FROM "Project"
      WHERE "ownerId" = ${userId}
        AND "deletedAt" IS NULL
        AND platform IS NOT NULL
      GROUP BY platform
      ORDER BY count DESC
    `;

    const totalProjects = await this.prismaService.project.count({
      where: { ownerId: userId, deletedAt: null },
    });

    return platformStatsRaw.map(stat => ({
      platform: stat.platform || 'Unknown',
      count: Number(stat.count),
      percentage: totalProjects > 0 ? (Number(stat.count) / totalProjects) * 100 : 0,
    }));
  }
}
