import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LoggingService } from '../services/logging.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private readonly loggingService: LoggingService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Add request ID for tracing
    if (!req.id) {
      req.id = uuidv4();
    }

    const startTime = Date.now();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress);

    // Log incoming request
    this.loggingService.debug(`Incoming request: ${req.method} ${req.originalUrl}`, {
      requestId: String(req.id),
      method: req.method,
      endpoint: req.originalUrl,
      ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
    });

    // Override res.end to capture response details
    const originalEnd = res.end;
    const loggingService = this.loggingService; // Capture reference to avoid context issues

    res.end = function (chunk?: any, encoding?: any): any {
      const duration = Date.now() - startTime;

      // Log request completion
      const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

      if (res.statusCode >= 400) {
        loggingService.warn(message, {
          requestId: String(req.id),
          method: req.method,
          endpoint: req.originalUrl,
          statusCode: res.statusCode,
          duration,
          ip,
          userAgent: req.get('User-Agent'),
          userId: (req as any).user?.id,
        });
      } else {
        loggingService.info(message, {
          requestId: String(req.id),
          method: req.method,
          endpoint: req.originalUrl,
          statusCode: res.statusCode,
          duration,
          ip,
          userAgent: req.get('User-Agent'),
          userId: (req as any).user?.id,
        });
      }

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  }
}
