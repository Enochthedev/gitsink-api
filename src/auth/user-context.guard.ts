import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { RequestWithUser } from '@auth/request-with-user';

@Injectable()
export class UserContextGuard implements CanActivate {
  constructor(private readonly authService: AuthService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<'http' | 'graphql'>();
    let req: RequestWithUser | undefined;
    let gqlCtx: GqlExecutionContext | null = null;

    if (type === 'http') {
      req = context.switchToHttp().getRequest<RequestWithUser>();
    } else if (type === 'graphql' || (type as string) === 'graphql') {
      gqlCtx = GqlExecutionContext.create(context);
      const gqlContextData = gqlCtx.getContext<{ req?: RequestWithUser }>();
      req = gqlContextData?.req;
    }

    // If no request is available, allow the request to continue
    // (auth will be handled by specific guards like ApiKeyGuard)
    if (!req) {
      return true;
    }

    let userId: string | undefined;
    const apiKey = req.headers?.['x-api-key'] as string | undefined;

    if (apiKey) {
      const user = await this.authService.validateApiKey(apiKey);
      if (user) {
        userId = user.id;
      }
    } else if (req.session?.userId) {
      userId = req.session.userId;
    }

    if (userId) {
      req.userId = userId;
      if (gqlCtx) {
        gqlCtx.getContext().userId = userId;
      }
    }

    return true;
  }
}
