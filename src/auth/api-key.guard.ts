import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestWithUser } from './request-with-user';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<'http' | 'graphql'>();
    let request: RequestWithUser | undefined;

    if (type === 'http') {
      request = context.switchToHttp().getRequest();
    } else {
      const gqlContext = GqlExecutionContext.create(context).getContext();
      request = gqlContext?.req as RequestWithUser | undefined;
    }

    // Check if request exists (may not exist for some GraphQL operations)
    if (!request) {
      throw new UnauthorizedException('Request context unavailable');
    }

    // Extract API key from headers
    const headerKey = request.headers?.['x-api-key'] as string | undefined;
    const authHeader = request.headers?.['authorization'];
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const apiKey = headerKey || bearerKey;

    if (!apiKey) {
      throw new UnauthorizedException('API key missing');
    }

    // Prepare usage information for tracking
    const usageInfo = {
      endpoint: request.url || request.route?.path || 'unknown',
      method: request.method || 'unknown',
      statusCode: 200, // Will be updated later by middleware
      duration: 0, // Will be updated later by middleware
      ipAddress: request.ip || request.connection?.remoteAddress || 'unknown',
      userAgent: request.headers?.['user-agent'],
      timestamp: new Date(),
    };

    // Validate API key with enhanced service
    const validationResult = await this.apiKeyService.validateApiKey(apiKey, usageInfo);

    if (!validationResult.isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (validationResult.rateLimitExceeded) {
      throw new ForbiddenException('Rate limit exceeded');
    }

    // DEV HACK: If using local bypass key, try to use the user from the Bearer token
    if (validationResult.isValid && validationResult.user.id === 'local-user') {
      const authHeader = request.headers?.['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const payloadPart = token.split('.')[1];
          if (payloadPart) {
            const payloadStr = Buffer.from(payloadPart, 'base64').toString();
            const payload = JSON.parse(payloadStr);

            if (payload.sub) {
              validationResult.user = {
                ...validationResult.user,
                id: payload.sub,
                email: payload.email || validationResult.user.email,
                username: payload.username || validationResult.user.username,
                // Keep tier as enterprise from bypass
              } as any;
            }
          }
        } catch (e) {
          // Ignore decode errors, fallback to local-user
        }
      }
    }

    // Attach user and usage info to request for later use
    request.user = validationResult.user;
    request.apiKeyUsage = {
      usageCount: validationResult.usageCount,
      startTime: Date.now(),
    };

    return true;
  }
}
