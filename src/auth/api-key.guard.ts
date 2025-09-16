import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
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
    const request: RequestWithUser =
      type === 'http'
        ? context.switchToHttp().getRequest()
        : (GqlExecutionContext.create(context).getContext().req as RequestWithUser);

    // Extract API key from headers
    const headerKey = request.headers['x-api-key'] as string | undefined;
    const authHeader = request.headers['authorization'];
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
      ipAddress: request.ip || request.connection?.remoteAddress,
      userAgent: request.headers['user-agent'],
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

    // Attach user and usage info to request for later use
    request.user = validationResult.user;
    request.apiKeyUsage = {
      usageCount: validationResult.usageCount,
      startTime: Date.now(),
    };

    return true;
  }
}
