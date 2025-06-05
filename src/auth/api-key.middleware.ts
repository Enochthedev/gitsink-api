import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from './request-with-user';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const apiKey = req.header('x-api-key');
    if (!apiKey) {
      res.status(401).json({ message: 'API key missing' });
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { apiKey } });
    if (!user) {
      res.status(401).json({ message: 'Invalid API key' });
      return;
    }

    req.user = user;
    next();
  }
}
