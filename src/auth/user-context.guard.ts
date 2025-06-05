import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from './auth.service';

@Injectable()
export class UserContextGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Determine request object for REST or GraphQL
    let req: any = context.switchToHttp().getRequest();
    let gqlCtx: any = null;
    if (!req) {
      gqlCtx = GqlExecutionContext.create(context);
      req = gqlCtx.getContext().req;
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
