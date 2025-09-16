import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '@metrics/metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Track active connections
    this.metricsService.incrementActiveConnections();

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      const route = (req.route as { path: string })?.path || req.path;

      this.metricsService.incrementHttpRequests(req.method, route, res.statusCode);

      this.metricsService.recordHttpRequestDuration(req.method, route, duration);

      this.metricsService.decrementActiveConnections();
    });

    res.on('close', () => {
      this.metricsService.decrementActiveConnections();
    });

    next();
  }
}
