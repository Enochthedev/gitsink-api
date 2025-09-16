import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { SandboxService } from './sandbox.service';
import { RequestWithUser } from '../auth/request-with-user';

export const SANDBOX_REQUIRED = 'sandbox_required';
export const SANDBOX_OPTIONAL = 'sandbox_optional';
export const SANDBOX_DISABLED = 'sandbox_disabled';

/**
 * Decorator to require sandbox mode for a route
 */
export const RequireSandbox = () => SetMetadata(SANDBOX_REQUIRED, true);

/**
 * Decorator to allow both sandbox and production mode
 */
export const AllowSandbox = () => SetMetadata(SANDBOX_OPTIONAL, true);

/**
 * Decorator to disable sandbox mode for a route (production only)
 */
export const DisableSandbox = () => SetMetadata(SANDBOX_DISABLED, true);

@Injectable()
export class SandboxGuard implements CanActivate {
  private readonly logger = new Logger(SandboxGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sandboxService: SandboxService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if sandbox mode is globally enabled
    if (!this.sandboxService.isSandboxEnabled()) {
      return true; // Allow all requests if sandbox is disabled
    }

    // Get metadata from route decorators
    const sandboxRequired =
      this.reflector.get<boolean>(SANDBOX_REQUIRED, context.getHandler()) ||
      this.reflector.get<boolean>(SANDBOX_REQUIRED, context.getClass());

    const sandboxOptional =
      this.reflector.get<boolean>(SANDBOX_OPTIONAL, context.getHandler()) ||
      this.reflector.get<boolean>(SANDBOX_OPTIONAL, context.getClass());

    const sandboxDisabled =
      this.reflector.get<boolean>(SANDBOX_DISABLED, context.getHandler()) ||
      this.reflector.get<boolean>(SANDBOX_DISABLED, context.getClass());

    // Get request object and user ID
    let req: RequestWithUser;
    let gqlCtx: GqlExecutionContext | null = null;

    try {
      req = context.switchToHttp().getRequest<RequestWithUser>();
    } catch {
      // Handle GraphQL context
      gqlCtx = GqlExecutionContext.create(context);
      req = gqlCtx.getContext<{ req: RequestWithUser }>().req;
    }

    const userId = req.userId;
    if (!userId) {
      // If no user ID, allow request to proceed (auth guard will handle authentication)
      return true;
    }

    // Check if user is in sandbox mode
    const isInSandbox = await this.sandboxService.isUserInSandboxMode(userId);

    // Apply sandbox rules based on decorators
    if (sandboxDisabled && isInSandbox) {
      throw new ForbiddenException(
        'This feature is not available in sandbox mode. Please upgrade to production to access this functionality.',
      );
    }

    if (sandboxRequired && !isInSandbox) {
      throw new ForbiddenException(
        'This endpoint requires sandbox mode. Please start a sandbox session first.',
      );
    }

    // If sandbox is optional or no specific requirements, allow the request
    if (sandboxOptional || (!sandboxRequired && !sandboxDisabled)) {
      // Add sandbox context to request for use in controllers/resolvers
      req.isSandboxMode = isInSandbox;
      if (gqlCtx) {
        gqlCtx.getContext().isSandboxMode = isInSandbox;
      }

      return true;
    }

    // Default: allow the request
    return true;
  }
}

/**
 * Interceptor to track sandbox usage and enforce limits
 */
@Injectable()
export class SandboxUsageInterceptor {
  private readonly logger = new Logger(SandboxUsageInterceptor.name);

  constructor(private readonly sandboxService: SandboxService) {}

  async intercept(context: ExecutionContext, next: any): Promise<any> {
    // Get request object and user ID
    let req: RequestWithUser;
    let gqlCtx: GqlExecutionContext | null = null;

    try {
      req = context.switchToHttp().getRequest<RequestWithUser>();
    } catch {
      gqlCtx = GqlExecutionContext.create(context);
      req = gqlCtx.getContext<{ req: RequestWithUser }>().req;
    }

    const userId = req.userId;
    if (!userId) {
      return next.handle();
    }

    // Check if user is in sandbox mode
    const isInSandbox = await this.sandboxService.isUserInSandboxMode(userId);
    if (!isInSandbox) {
      return next.handle();
    }

    // Increment API call count for sandbox users
    try {
      await this.sandboxService.incrementApiCallCount(userId);
    } catch (error) {
      // If limit is reached, the service will throw an exception
      throw error;
    }

    // Continue with the request
    return next.handle();
  }
}

/**
 * Utility function to check if a request is in sandbox mode
 */
export function isSandboxRequest(req: RequestWithUser): boolean {
  return req.isSandboxMode === true;
}

/**
 * Utility function to get sandbox usage from request context
 */
export async function getSandboxUsage(
  req: RequestWithUser,
  sandboxService: SandboxService,
): Promise<any> {
  if (!req.userId || !req.isSandboxMode) {
    return null;
  }

  return await sandboxService.getSandboxUsage(req.userId);
}
