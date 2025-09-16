import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ResponseOptimizationService } from '../services/response-optimization.service';
import { ApiMonitoringService } from '../services/api-monitoring.service';
import { Reflector } from '@nestjs/core';

export const CACHE_OPTIONS_KEY = 'cache_options';
export const COMPRESSION_OPTIONS_KEY = 'compression_options';
export const LAZY_LOADING_KEY = 'lazy_loading';

export interface ResponseOptimizationOptions {
  cache?: {
    maxAge?: number;
    private?: boolean;
    mustRevalidate?: boolean;
    staleWhileRevalidate?: number;
  };
  compression?: {
    threshold?: number;
    level?: number;
    algorithms?: ('gzip' | 'deflate' | 'br')[];
  };
  lazyLoading?: {
    fields?: string[];
    enabled?: boolean;
  };
  pagination?: {
    enabled?: boolean;
    defaultLimit?: number;
    maxLimit?: number;
  };
}

@Injectable()
export class ResponseOptimizationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseOptimizationInterceptor.name);

  constructor(
    private readonly responseOptimizationService: ResponseOptimizationService,
    private readonly apiMonitoringService: ApiMonitoringService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    // Get optimization options from decorators
    const cacheOptions = this.reflector.get(CACHE_OPTIONS_KEY, context.getHandler());
    const compressionOptions = this.reflector.get(COMPRESSION_OPTIONS_KEY, context.getHandler());
    const lazyLoadingOptions = this.reflector.get(LAZY_LOADING_KEY, context.getHandler());

    return next.handle().pipe(
      map(data => {
        // Apply lazy loading if configured
        if (lazyLoadingOptions?.enabled && lazyLoadingOptions.fields) {
          data = this.responseOptimizationService.applyLazyLoading(
            data,
            lazyLoadingOptions.fields,
            request,
          );
        }

        // Apply pagination optimization if needed
        data = this.optimizePagination(data, request);

        return data;
      }),
      tap(async data => {
        const responseTime = Date.now() - startTime;
        const contentType = response.get('Content-Type') || 'application/json';

        try {
          // Set cache headers
          if (cacheOptions) {
            this.responseOptimizationService.setCacheHeaders(response, cacheOptions, contentType);
          } else {
            // Use default cache headers based on content type
            const defaultCacheOptions =
              this.responseOptimizationService.getDefaultCacheHeaders(contentType);
            this.responseOptimizationService.setCacheHeaders(
              response,
              defaultCacheOptions,
              contentType,
            );
          }

          // Apply compression if configured
          if (data && (compressionOptions || this.shouldCompress(request, response))) {
            const acceptEncoding = request.get('Accept-Encoding') || '';
            const compressionResult = await this.responseOptimizationService.compressResponse(
              data,
              acceptEncoding,
              compressionOptions,
            );

            if (compressionResult.encoding) {
              response.set('Content-Encoding', compressionResult.encoding);
              response.set('Content-Length', compressionResult.data.length.toString());

              // Log compression metrics
              this.logger.debug(
                `Response compressed: ${compressionResult.metrics.originalSize} -> ` +
                  `${compressionResult.metrics.compressedSize} bytes ` +
                  `(${compressionResult.metrics.compressionRatio.toFixed(2)}x) ` +
                  `using ${compressionResult.metrics.algorithm}`,
              );
            }
          }

          // Record API metrics
          const requestSize = this.getRequestSize(request);
          const responseSize = this.getResponseSize(data);

          this.apiMonitoringService.recordApiRequest(
            request,
            response,
            responseTime,
            requestSize,
            responseSize,
          );

          // Set performance headers
          response.set('X-Response-Time', `${responseTime}ms`);
          response.set('X-Request-ID', this.getRequestId(request));
        } catch (error) {
          this.logger.error('Response optimization failed:', error);
          // Don't throw - let the response continue without optimization
        }
      }),
    );
  }

  private shouldCompress(request: Request, response: Response): boolean {
    const contentType = response.get('Content-Type') || '';
    const acceptEncoding = request.get('Accept-Encoding') || '';

    // Only compress if client supports it
    if (
      !acceptEncoding.includes('gzip') &&
      !acceptEncoding.includes('deflate') &&
      !acceptEncoding.includes('br')
    ) {
      return false;
    }

    // Compress JSON and text responses
    return (
      contentType.includes('application/json') ||
      contentType.includes('text/') ||
      contentType.includes('application/javascript') ||
      contentType.includes('application/xml')
    );
  }

  private optimizePagination(data: any, request: Request): any {
    // Check if response has pagination structure
    if (data && typeof data === 'object' && 'data' in data && 'totalCount' in data) {
      const page = parseInt(request.query.page as string) || 1;
      const limit = parseInt(request.query.limit as string) || 20;
      const baseUrl = `${request.protocol}://${request.get('host')}${request.path}`;

      // Apply pagination optimization
      return this.responseOptimizationService.optimizePaginatedResponse(
        data.data,
        data.totalCount,
        page,
        limit,
        baseUrl,
      );
    }

    // Check for cursor-based pagination
    if (data && typeof data === 'object' && 'edges' in data && 'pageInfo' in data) {
      const limit = parseInt(request.query.limit as string) || 20;
      const baseUrl = `${request.protocol}://${request.get('host')}${request.path}`;

      return this.responseOptimizationService.optimizeCursorPaginatedResponse(
        data.edges.map((edge: any) => edge.node),
        limit,
        baseUrl,
        data.pageInfo.hasNextPage,
      );
    }

    return data;
  }

  private getRequestSize(request: Request): number {
    const contentLength = request.get('Content-Length');
    return contentLength ? parseInt(contentLength) : 0;
  }

  private getResponseSize(data: any): number {
    if (!data) return 0;

    try {
      const serialized = typeof data === 'string' ? data : JSON.stringify(data);
      return Buffer.byteLength(serialized, 'utf8');
    } catch {
      return 0;
    }
  }

  private getRequestId(request: Request): string {
    return (
      request.get('X-Request-ID') ||
      request.get('X-Correlation-ID') ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    );
  }
}

// Decorators for configuring response optimization
export const CacheResponse = (options: ResponseOptimizationOptions['cache'] = {}) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(CACHE_OPTIONS_KEY, options, descriptor.value);
    return descriptor;
  };
};

export const CompressResponse = (options: ResponseOptimizationOptions['compression'] = {}) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(COMPRESSION_OPTIONS_KEY, options, descriptor.value);
    return descriptor;
  };
};

export const LazyLoad = (fields: string[] = []) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(LAZY_LOADING_KEY, { enabled: true, fields }, descriptor.value);
    return descriptor;
  };
};
