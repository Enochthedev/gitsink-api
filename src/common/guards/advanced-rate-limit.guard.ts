import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RateLimitResult, RateLimitingService } from '../services/rate-limiting.service';
import { RequestWithUser } from '@auth/request-with-user';

export interface AdvancedRateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  bypassPremium?: boolean;
  message?: string;
}

export const ADVANCED_RATE_LIMIT_KEY = 'advanced_rate_limit';

/**
 * Decorator to apply advanced rate limiting to endpoints
 */
export const AdvancedRateLimit = (options: AdvancedRateLimitOptions = {}) =>
  SetMetadata(ADVANCED_RATE_LIMIT_KEY, options);

@Injectable()
export class AdvancedRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdvancedRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitingService: RateLimitingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse();

    // Get rate limit options from decorator
    const options = this.reflector.get<AdvancedRateLimitOptions>(
      ADVANCED_RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no rate limit decorator, allow request
    if (!options) {
      return true;
    }

    // Generate identifier for rate limiting
    const identifier = this.generateIdentifier(request, options);

    // Get endpoint path
    const endpoint = this.getEndpointPath(request);

    // Get user tier
    const userTier = this.getUserTier(request);

    // Get user ID if available
    const userId = request.user?.id;

    // Check for premium bypass
    if (options.bypassPremium && userId) {
      const hasBypass = await this.rateLimitingService.hasPremiumBypass(userId);
      if (hasBypass) {
        this.logger.debug('Rate limit bypassed for premium user', {
          userId,
          endpoint,
          identifier,
        });
        return true;
      }
    }

    // Check rate limit
    const rateLimitResult = await this.rateLimitingService.checkRateLimit(
      identifier,
      endpoint,
      userTier,
      userId,
    );

    // Set rate limit headers
    this.setRateLimitHeaders(response, rateLimitResult);

    // If rate limit exceeded, throw exception
    if (!rateLimitResult.allowed) {
      const message = options.message || 'Too many requests. Please try again later.';

      this.logger.warn('Rate limit exceeded', {
        identifier,
        endpoint,
        userTier,
        userId,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime,
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message,
          error: 'Too Many Requests',
          retryAfter: rateLimitResult.retryAfter,
          resetTime: rateLimitResult.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Generate identifier for rate limiting
   */
  private generateIdentifier(request: RequestWithUser, options: AdvancedRateLimitOptions): string {
    if (options.keyGenerator) {
      return options.keyGenerator(request);
    }

    // Use user ID if authenticated, otherwise use IP
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    // Use IP address as fallback
    const ip =
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      (request.connection as any)?.socket?.remoteAddress ||
      'unknown';

    return `ip:${ip}`;
  }

  /**
   * Get endpoint path for rate limiting
   */
  private getEndpointPath(request: Request): string {
    // Use the route path if available, otherwise use the URL path
    const route = (request as any).route;
    if (route && route.path) {
      return `${request.method} ${route.path}`;
    }

    // Extract path from URL, removing query parameters
    const url = new URL(request.url, `http://${request.get('host')}`);
    return `${request.method} ${url.pathname}`;
  }

  /**
   * Get user tier from request
   */
  private getUserTier(request: RequestWithUser): string {
    return request.user?.tier || 'free';
  }

  /**
   * Set rate limit headers in response
   */
  private setRateLimitHeaders(response: any, rateLimitResult: RateLimitResult): void {
    response.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(rateLimitResult.resetTime.getTime() / 1000).toString(),
    );

    if (rateLimitResult.retryAfter) {
      response.setHeader('Retry-After', rateLimitResult.retryAfter.toString());
    }
  }
}
