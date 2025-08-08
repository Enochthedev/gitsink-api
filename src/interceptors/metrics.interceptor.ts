import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';
import {
  METRICS_KEY,
  MetricsOptions,
} from '../metrics/decorators/metrics.decorator';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const metricsOptions = this.reflector.get<MetricsOptions>(
      METRICS_KEY,
      context.getHandler(),
    );

    if (!metricsOptions?.track) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const method = request.method;
    const route = metricsOptions.route || request.route?.path || request.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          const statusCode = response.statusCode;

          this.metricsService.incrementHttpRequests(method, route, statusCode);
          this.metricsService.recordHttpRequestDuration(
            method,
            route,
            duration,
          );
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          const statusCode = error.status || 500;

          this.metricsService.incrementHttpRequests(method, route, statusCode);
          this.metricsService.recordHttpRequestDuration(
            method,
            route,
            duration,
          );
        },
      }),
    );
  }
}
