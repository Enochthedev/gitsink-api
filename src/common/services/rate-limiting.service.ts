import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Counter, Histogram } from 'prom-client';
import { MetricsService } from '@metrics/metrics.service';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (req: any) => void;
}

export interface UserTierLimits {
  free: RateLimitConfig;
  premium: RateLimitConfig;
  enterprise: RateLimitConfig;
}

export interface EndpointLimits {
  [endpoint: string]: UserTierLimits;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

@Injectable()
export class RateLimitingService {
  private readonly logger = new Logger(RateLimitingService.name);
  private readonly rateLimitCounter: Counter<string>;
  private readonly rateLimitHistogram: Histogram<string>;

  // Default rate limits by user tier
  private readonly defaultLimits: UserTierLimits = {
    free: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60,
    },
    premium: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 300,
    },
    enterprise: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 1000,
    },
  };

  // Endpoint-specific rate limits
  private readonly endpointLimits: EndpointLimits = {
    '/auth/signup': {
      free: { windowMs: 60 * 1000, maxRequests: 5 },
      premium: { windowMs: 60 * 1000, maxRequests: 10 },
      enterprise: { windowMs: 60 * 1000, maxRequests: 20 },
    },
    '/auth/signin': {
      free: { windowMs: 60 * 1000, maxRequests: 10 },
      premium: { windowMs: 60 * 1000, maxRequests: 30 },
      enterprise: { windowMs: 60 * 1000, maxRequests: 100 },
    },
    '/auth/magic-link/send': {
      free: { windowMs: 5 * 60 * 1000, maxRequests: 3 },
      premium: { windowMs: 5 * 60 * 1000, maxRequests: 10 },
      enterprise: { windowMs: 5 * 60 * 1000, maxRequests: 30 },
    },
    '/auth/password-reset': {
      free: { windowMs: 5 * 60 * 1000, maxRequests: 3 },
      premium: { windowMs: 5 * 60 * 1000, maxRequests: 5 },
      enterprise: { windowMs: 5 * 60 * 1000, maxRequests: 10 },
    },
    '/projects/sync': {
      free: { windowMs: 60 * 1000, maxRequests: 10 },
      premium: { windowMs: 60 * 1000, maxRequests: 50 },
      enterprise: { windowMs: 60 * 1000, maxRequests: 200 },
    },
    '/projects': {
      free: { windowMs: 60 * 1000, maxRequests: 100 },
      premium: { windowMs: 60 * 1000, maxRequests: 500 },
      enterprise: { windowMs: 60 * 1000, maxRequests: 2000 },
    },
    '/graphql': {
      free: { windowMs: 60 * 1000, maxRequests: 100 },
      premium: { windowMs: 60 * 1000, maxRequests: 500 },
      enterprise: { windowMs: 60 * 1000, maxRequests: 2000 },
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly metricsService: MetricsService,
  ) {
    this.rateLimitCounter = this.metricsService.createCustomCounter(
      'rate_limit_hits_total',
      'Total number of rate limit hits',
      ['endpoint', 'user_tier', 'result'],
    );

    this.rateLimitHistogram = this.metricsService.createCustomHistogram(
      'rate_limit_check_duration_seconds',
      'Duration of rate limit checks',
      ['endpoint', 'user_tier'],
    );
  }

  /**
   * Check if a request should be rate limited
   */
  async checkRateLimit(
    identifier: string,
    endpoint: string,
    userTier: string = 'free',
    userId?: string,
  ): Promise<RateLimitResult> {
    const startTime = Date.now();

    try {
      // Get rate limit configuration for this endpoint and user tier
      const config = this.getRateLimitConfig(endpoint, userTier);

      // Generate cache key
      const cacheKey = this.generateCacheKey(identifier, endpoint, userTier);

      // Check current usage
      const currentUsage = await this.getCurrentUsage(cacheKey, config.windowMs);

      // Determine if request should be allowed
      const allowed = currentUsage.count < config.maxRequests;
      const remaining = Math.max(0, config.maxRequests - currentUsage.count - 1);
      const resetTime = new Date(currentUsage.windowStart + config.windowMs);

      // If allowed, increment counter
      if (allowed) {
        await this.incrementUsage(cacheKey, config.windowMs);
      }

      // Record metrics
      this.rateLimitCounter.inc({
        endpoint,
        user_tier: userTier,
        result: allowed ? 'allowed' : 'blocked',
      });

      // Log rate limit events
      if (!allowed) {
        this.logger.warn('Rate limit exceeded', {
          identifier,
          endpoint,
          userTier,
          userId,
          currentUsage: currentUsage.count,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
        });
      }

      const result: RateLimitResult = {
        allowed,
        remaining,
        resetTime,
        retryAfter: allowed ? undefined : Math.ceil((resetTime.getTime() - Date.now()) / 1000),
      };

      return result;
    } finally {
      // Record timing metrics
      const duration = (Date.now() - startTime) / 1000;
      this.rateLimitHistogram.observe({ endpoint, user_tier: userTier }, duration);
    }
  }

  /**
   * Check if user has premium bypass for rate limiting
   */
  async hasPremiumBypass(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: { tier: true },
      });

      return user?.tier === 'premium' || user?.tier === 'enterprise';
    } catch (error) {
      this.logger.error('Error checking premium bypass', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get rate limit configuration for endpoint and user tier
   */
  private getRateLimitConfig(endpoint: string, userTier: string): RateLimitConfig {
    // Check for endpoint-specific limits
    const endpointConfig = this.endpointLimits[endpoint];
    if (endpointConfig && endpointConfig[userTier]) {
      return endpointConfig[userTier];
    }

    // Check for wildcard endpoint matches
    for (const [pattern, config] of Object.entries(this.endpointLimits)) {
      if (this.matchesPattern(endpoint, pattern) && config[userTier]) {
        return config[userTier];
      }
    }

    // Fall back to default limits
    return this.defaultLimits[userTier] || this.defaultLimits.free;
  }

  /**
   * Check if endpoint matches a pattern (supports wildcards)
   */
  private matchesPattern(endpoint: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(endpoint);
    }
    return endpoint.startsWith(pattern);
  }

  /**
   * Generate cache key for rate limiting
   */
  private generateCacheKey(identifier: string, endpoint: string, userTier: string): string {
    return `rate_limit:${identifier}:${endpoint}:${userTier}`;
  }

  /**
   * Get current usage from cache
   */
  private async getCurrentUsage(
    cacheKey: string,
    windowMs: number,
  ): Promise<{
    count: number;
    windowStart: number;
  }> {
    try {
      const cached = await this.cacheManager.get<{
        count: number;
        windowStart: number;
      }>(cacheKey);

      if (cached) {
        const now = Date.now();
        // Check if window has expired
        if (now - cached.windowStart < windowMs) {
          return cached;
        }
      }

      // Return fresh window
      return {
        count: 0,
        windowStart: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error getting current usage from cache', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        count: 0,
        windowStart: Date.now(),
      };
    }
  }

  /**
   * Increment usage counter in cache
   */
  private async incrementUsage(cacheKey: string, windowMs: number): Promise<void> {
    try {
      const current = await this.getCurrentUsage(cacheKey, windowMs);
      const updated = {
        count: current.count + 1,
        windowStart: current.windowStart,
      };

      // Set with TTL slightly longer than window to handle clock skew
      const ttlSeconds = Math.ceil(windowMs / 1000) + 10;
      await this.cacheManager.set(cacheKey, updated, ttlSeconds * 1000);
    } catch (error) {
      this.logger.error('Error incrementing usage in cache', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getRateLimitStats(timeRange?: { from: Date; to: Date }): Promise<{
    totalRequests: number;
    blockedRequests: number;
    blockRate: number;
    topBlockedEndpoints: Array<{ endpoint: string; count: number }>;
    tierBreakdown: Record<string, { allowed: number; blocked: number }>;
  }> {
    // This would typically query metrics or a dedicated rate limit log table
    // For now, return mock data structure
    return {
      totalRequests: 0,
      blockedRequests: 0,
      blockRate: 0,
      topBlockedEndpoints: [],
      tierBreakdown: {
        free: { allowed: 0, blocked: 0 },
        premium: { allowed: 0, blocked: 0 },
        enterprise: { allowed: 0, blocked: 0 },
      },
    };
  }

  /**
   * Clear rate limit for a specific identifier (admin function)
   */
  async clearRateLimit(identifier: string, endpoint?: string): Promise<void> {
    try {
      if (endpoint) {
        // Clear specific endpoint
        for (const tier of ['free', 'premium', 'enterprise']) {
          const cacheKey = this.generateCacheKey(identifier, endpoint, tier);
          await this.cacheManager.del(cacheKey);
        }
      } else {
        // This would require a more sophisticated cache key pattern matching
        // For now, log the request
        this.logger.log('Rate limit clear requested', {
          identifier,
          endpoint: endpoint || 'all',
        });
      }
    } catch (error) {
      this.logger.error('Error clearing rate limit', {
        identifier,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update rate limit configuration (admin function)
   */
  updateEndpointLimits(endpoint: string, limits: UserTierLimits): void {
    this.endpointLimits[endpoint] = limits;
    this.logger.log('Rate limit configuration updated', {
      endpoint,
      limits,
    });
  }
}
