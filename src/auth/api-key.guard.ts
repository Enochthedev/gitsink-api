import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<'http' | 'graphql'>();
    const request =
      type === 'http'
        ? context.switchToHttp().getRequest()
        : GqlExecutionContext.create(context).getContext().req;
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) throw new UnauthorizedException('API key missing');
    const user = await this.prisma.user.findFirst({
      where: { apiKey: String(apiKey) },
    });
    if (!user) throw new UnauthorizedException('Invalid API key');
    request.user = user;
    return true;
  }
}
