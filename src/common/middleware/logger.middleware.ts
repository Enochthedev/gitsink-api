import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const ip = String(
      req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    );
    console.log(
      `[REQ] ${req.method} ${req.originalUrl} from ${ip} at ${new Date().toISOString()}`,
    );
    next();
  }
}
