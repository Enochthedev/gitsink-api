import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth) throw new UnauthorizedException('Missing Authorization header');

    const [type, token] = auth.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Invalid Authorization header');

    const users = await this.prisma.user.findMany({ where: { apiKey: { not: null } } });
    for (const user of users) {
      if (user.apiKey && (await bcrypt.compare(token, user.apiKey))) {
        req.user = user;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
