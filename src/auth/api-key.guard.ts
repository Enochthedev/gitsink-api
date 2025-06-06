import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestWithUser } from './request-with-user';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<'http' | 'graphql'>();
    const request: RequestWithUser =
      type === 'http'
        ? context.switchToHttp().getRequest()
        : (GqlExecutionContext.create(context).getContext()
            .req as RequestWithUser);
    const headerKey = request.headers['x-api-key'] as string | undefined;
    const authHeader = request.headers['authorization'];
    const bearerKey = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const apiKey = headerKey || bearerKey;
    if (!apiKey) throw new UnauthorizedException('API key missing');

    const bypass = this.config.get<string>('LOCAL_API_KEY');
    if (bypass && apiKey === bypass) {
      // local development bypass - skip database lookup
      request.user = { id: 'local-user' } as any;
      return true;
    }

    const user = await this.authService.validateApiKey(apiKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    request.user = user;
    return true;
  }
}
