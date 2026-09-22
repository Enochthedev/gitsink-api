import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OptimizedProjectsService } from './optimized-projects.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';
import {
  CacheResponse,
  CompressResponse,
  LazyLoad,
  ResponseOptimizationInterceptor,
} from '../common/interceptors/response-optimization.interceptor';
import { Project } from './entities/project.entity';

export class ProjectFilterDto {
  @ApiProperty({ required: false, description: 'Search query' })
  search?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by categories',
    type: [String],
  })
  categories?: string[];

  @ApiProperty({
    required: false,
    description: 'Filter by programming languages',
    type: [String],
  })
  languages?: string[];

  @ApiProperty({
    required: false,
    description: 'Filter by platforms',
    type: [String],
  })
  platforms?: string[];

  @ApiProperty({
    required: false,
    description: 'Filter by tags',
    type: [String],
  })
  tags?: string[];

  @ApiProperty({ required: false, description: 'Filter by featured status' })
  featured?: boolean;

  @ApiProperty({ required: false, description: 'Filter by published status' })
  published?: boolean;

  @ApiProperty({ required: false, description: 'Filter by private status' })
  isPrivate?: boolean;

  @ApiProperty({ required: false, description: 'Filter by archived status' })
  isArchived?: boolean;

  @ApiProperty({ required: false, description: 'Minimum star count' })
  minStars?: number;

  @ApiProperty({ required: false, description: 'Maximum star count' })
  maxStars?: number;

  @ApiProperty({ required: false, description: 'Minimum fork count' })
  minForks?: number;

  @ApiProperty({ required: false, description: 'Maximum fork count' })
  maxForks?: number;

  @ApiProperty({
    required: false,
    description: 'Created after date (ISO string)',
  })
  createdAfter?: string;

  @ApiProperty({
    required: false,
    description: 'Created before date (ISO string)',
  })
  createdBefore?: string;

  @ApiProperty({
    required: false,
    description: 'Updated after date (ISO string)',
  })
  updatedAfter?: string;

  @ApiProperty({
    required: false,
    description: 'Updated before date (ISO string)',
  })
  updatedBefore?: string;
}

export class ProjectSortDto {
  @ApiProperty({
    required: false,
    enum: ['title', 'created_at', 'updated_at', 'stars', 'forks', 'last_commit', 'popularity'],
    description: 'Sort field',
  })
  sortBy?: 'title' | 'created_at' | 'updated_at' | 'stars' | 'forks' | 'last_commit' | 'popularity';

  @ApiProperty({
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  sortOrder?: 'asc' | 'desc';
}

@UseGuards(ApiKeyGuard)
@UseInterceptors(ResponseOptimizationInterceptor)
@ApiTags('projects-optimized')
@ApiSecurity('x-api-key')
@Controller('v2/projects')
export class OptimizedProjectsController {
  constructor(private readonly optimizedProjectsService: OptimizedProjectsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get projects with advanced filtering and optimization',
    description:
      'Retrieve projects with comprehensive filtering, sorting, pagination, caching, and compression',
  })
  @ApiOkResponse({
    description: 'Paginated list of projects with performance metrics',
    schema: {
      type: 'object',
      properties: {
        projects: {
          type: 'array',
          items: { $ref: '#/components/schemas/Project' },
        },
        totalCount: { type: 'number' },
        hasNextPage: { type: 'boolean' },
        hasPreviousPage: { type: 'boolean' },
        performance: {
          type: 'object',
          properties: {
            queryTime: { type: 'number' },
            cacheHit: { type: 'boolean' },
          },
        },
      },
    },
  })
  @CacheResponse({
    maxAge: 300,
    mustRevalidate: true,
    staleWhileRevalidate: 60,
  })
  @CompressResponse({ threshold: 1024, level: 6 })
  @LazyLoad(['githubMetadata', 'customMetadata', 'aiAnalysis'])
  async getProjects(
    @Req() req: RequestWithUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categories') categories?: string,
    @Query('languages') languages?: string,
    @Query('platforms') platforms?: string,
    @Query('tags') tags?: string,
    @Query('featured') featured?: boolean,
    @Query('published') published?: boolean,
    @Query('isPrivate') isPrivate?: boolean,
    @Query('isArchived') isArchived?: boolean,
    @Query('minStars', new DefaultValuePipe(0), ParseIntPipe) minStars?: number,
    @Query('maxStars') maxStars?: number,
    @Query('minForks', new DefaultValuePipe(0), ParseIntPipe) minForks?: number,
    @Query('maxForks') maxForks?: number,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    @Query('updatedAfter') updatedAfter?: string,
    @Query('updatedBefore') updatedBefore?: string,
    @Query('sortBy', new DefaultValuePipe('updated_at')) sortBy?: string,
    @Query('sortOrder', new DefaultValuePipe('desc')) sortOrder?: string,
    @Query('useCache', new DefaultValuePipe(true)) useCache?: boolean,
  ) {
    // Build filter object
    const filter: any = {};

    if (search) filter.search = search;
    if (categories) filter.categories = categories.split(',');
    if (languages) filter.languages = languages.split(',');
    if (platforms) filter.platforms = platforms.split(',');
    if (tags) filter.tags = tags.split(',');
    if (featured !== undefined) filter.featured = featured;
    if (published !== undefined) filter.published = published;
    if (isPrivate !== undefined) filter.isPrivate = isPrivate;
    if (isArchived !== undefined) filter.isArchived = isArchived;

    if (minStars !== undefined || maxStars !== undefined) {
      filter.starCount = {};
      if (minStars !== undefined) filter.starCount.min = minStars;
      if (maxStars !== undefined) filter.starCount.max = maxStars;
    }

    if (minForks !== undefined || maxForks !== undefined) {
      filter.forkCount = {};
      if (minForks !== undefined) filter.forkCount.min = minForks;
      if (maxForks !== undefined) filter.forkCount.max = maxForks;
    }

    if (createdAfter || createdBefore) {
      filter.createdAt = {};
      if (createdAfter) filter.createdAt.from = new Date(createdAfter);
      if (createdBefore) filter.createdAt.to = new Date(createdBefore);
    }

    if (updatedAfter || updatedBefore) {
      filter.updatedAt = {};
      if (updatedAfter) filter.updatedAt.from = new Date(updatedAfter);
      if (updatedBefore) filter.updatedAt.to = new Date(updatedBefore);
    }

    // Build sort object
    const sort =
      sortBy && sortOrder
        ? {
            field: sortBy as any,
            order: sortOrder as 'asc' | 'desc',
          }
        : undefined;

    // Build pagination
    const offset = (page - 1) * limit;
    const pagination = { offset, limit };

    // Build options
    const options = {
      useCache,
      cacheTtl: 300, // 5 minutes
      cacheTags: ['projects', `user:${req.user.id}`],
    };

    return this.optimizedProjectsService.getProjectsOptimized(
      req.user.id,
      filter,
      sort,
      pagination,
      options,
    );
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search projects with full-text search',
    description: 'Search projects using PostgreSQL full-text search with ranking',
  })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiOkResponse({
    description: 'Search results with performance metrics',
    schema: {
      type: 'object',
      properties: {
        projects: {
          type: 'array',
          items: { $ref: '#/components/schemas/Project' },
        },
        totalCount: { type: 'number' },
        searchTime: { type: 'number' },
        cacheHit: { type: 'boolean' },
      },
    },
  })
  @CacheResponse({ maxAge: 180, mustRevalidate: true }) // Shorter cache for search
  @CompressResponse({ threshold: 512 })
  async searchProjects(
    @Req() req: RequestWithUser,
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('categories') categories?: string,
    @Query('languages') languages?: string,
    @Query('platforms') platforms?: string,
    @Query('featured') featured?: boolean,
    @Query('published') published?: boolean,
    @Query('useCache', new DefaultValuePipe(true)) useCache?: boolean,
  ) {
    const filter: any = {};

    if (categories) filter.categories = categories.split(',');
    if (languages) filter.languages = languages.split(',');
    if (platforms) filter.platforms = platforms.split(',');
    if (featured !== undefined) filter.featured = featured;
    if (published !== undefined) filter.published = published;

    const offset = (page - 1) * limit;
    const pagination = { offset, limit };

    const options = {
      useCache,
      cacheTtl: 180, // 3 minutes for search results
      cacheTags: ['projects', 'search', `user:${req.user.id}`],
    };

    return this.optimizedProjectsService.searchProjectsOptimized(
      req.user.id,
      query,
      filter,
      pagination,
      options,
    );
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Get project statistics',
    description: 'Get comprehensive statistics about user projects with caching',
  })
  @ApiOkResponse({
    description: 'Project statistics',
    schema: {
      type: 'object',
      properties: {
        totalProjects: { type: 'number' },
        publicProjects: { type: 'number' },
        privateProjects: { type: 'number' },
        featuredProjects: { type: 'number' },
        totalStars: { type: 'number' },
        totalForks: { type: 'number' },
        averageStars: { type: 'number' },
        averageForks: { type: 'number' },
        languageStats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              count: { type: 'number' },
              percentage: { type: 'number' },
              totalStars: { type: 'number' },
              totalForks: { type: 'number' },
            },
          },
        },
        categoryStats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              count: { type: 'number' },
              percentage: { type: 'number' },
            },
          },
        },
        platformStats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              count: { type: 'number' },
              percentage: { type: 'number' },
            },
          },
        },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @CacheResponse({
    maxAge: 600,
    mustRevalidate: true,
    staleWhileRevalidate: 300,
  }) // 10 minutes cache
  @CompressResponse({ threshold: 512 })
  async getStatistics(
    @Req() req: RequestWithUser,
    @Query('categories') categories?: string,
    @Query('languages') languages?: string,
    @Query('platforms') platforms?: string,
    @Query('useCache', new DefaultValuePipe(true)) useCache?: boolean,
  ) {
    const filter: any = {};

    if (categories) filter.categories = categories.split(',');
    if (languages) filter.languages = languages.split(',');
    if (platforms) filter.platforms = platforms.split(',');

    const options = {
      useCache,
      cacheTtl: 600, // 10 minutes for statistics
      cacheTags: ['projects', 'statistics', `user:${req.user.id}`],
    };

    return this.optimizedProjectsService.getProjectStatisticsOptimized(
      req.user.id,
      filter,
      options,
    );
  }

  @Post('cache/warm')
  @ApiOperation({
    summary: 'Warm cache for user projects',
    description: 'Pre-populate cache with frequently accessed project data',
  })
  @ApiOkResponse({
    description: 'Cache warming status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async warmCache(@Req() req: RequestWithUser) {
    await this.optimizedProjectsService.warmCache(req.user.id);
    return {
      success: true,
      message: 'Cache warmed successfully',
    };
  }

  @Post('cache/invalidate')
  @ApiOperation({
    summary: 'Invalidate user project cache',
    description: 'Clear cached project data for the authenticated user',
  })
  @ApiOkResponse({
    description: 'Cache invalidation status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async invalidateCache(@Req() req: RequestWithUser) {
    await this.optimizedProjectsService.invalidateUserCache(req.user.id);
    return {
      success: true,
      message: 'Cache invalidated successfully',
    };
  }

  @Get('performance/metrics')
  @ApiOperation({
    summary: 'Get API performance metrics',
    description: 'Get performance metrics for project-related endpoints',
  })
  @ApiOkResponse({
    description: 'Performance metrics',
    schema: {
      type: 'object',
      properties: {
        endpoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              endpoint: { type: 'string' },
              method: { type: 'string' },
              totalRequests: { type: 'number' },
              averageResponseTime: { type: 'number' },
              errorRate: { type: 'number' },
              throughput: { type: 'number' },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalRequests: { type: 'number' },
            averageResponseTime: { type: 'number' },
            errorRate: { type: 'number' },
            throughput: { type: 'number' },
          },
        },
      },
    },
  })
  @CacheResponse({ maxAge: 60, mustRevalidate: true }) // 1 minute cache for metrics
  async getPerformanceMetrics() {
    // This would typically require admin access or be limited to the user's own metrics
    // For now, we'll return a placeholder response
    return {
      endpoints: [],
      summary: {
        totalRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      },
    };
  }
}
