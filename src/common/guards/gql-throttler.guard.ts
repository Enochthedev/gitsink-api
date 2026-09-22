import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Custom Throttler Guard that properly handles both HTTP and GraphQL contexts.
 * The default ThrottlerGuard tries to access request.ip on HTTP requests,
 * which fails for GraphQL contexts where the request structure is different.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * Override the getRequestResponse method to properly extract request/response
   * for both HTTP and GraphQL contexts.
   */
  protected override getRequestResponse(context: ExecutionContext) {
    const contextType = context.getType<'http' | 'graphql'>();

    if (contextType === 'graphql' || (contextType as string) === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      const ctx = gqlContext.getContext();
      return { req: ctx.req, res: ctx.res };
    }

    // Default HTTP handling
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    return { req: request, res: response };
  }

  /**
   * Override to properly extract the tracker (typically IP address) for rate limiting.
   * Provides fallback for when request is undefined or ip is not available.
   */
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    if (!req) {
      return 'unknown';
    }
    return req.ip || req.ips?.[0] || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * Override canActivate to add safety checks for GraphQL contexts
   */
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextType = context.getType<'http' | 'graphql'>();

    // For GraphQL, check if we have a valid request context
    if (contextType === 'graphql' || (contextType as string) === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      const ctx = gqlContext.getContext();

      // If no request in GraphQL context, skip throttling
      if (!ctx?.req) {
        return true;
      }
    }

    try {
      return await super.canActivate(context);
    } catch (error) {
      // If throttler fails due to missing request context, allow the request
      // and let other guards handle authentication/authorization
      if (error instanceof TypeError && error.message.includes('ip')) {
        return true;
      }
      throw error;
    }
  }
}
