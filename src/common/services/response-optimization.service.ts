import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const brotliCompress = promisify(zlib.brotliCompress);

export interface CompressionOptions {
  threshold?: number; // Minimum size in bytes to compress
  level?: number; // Compression level (1-9)
  algorithms?: ('gzip' | 'deflate' | 'br')[];
}

export interface CacheHeaders {
  maxAge?: number; // Cache max age in seconds
  sMaxAge?: number; // Shared cache max age
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  private?: boolean;
  public?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
}

export interface ResponseMetrics {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  algorithm: string;
}

@Injectable()
export class ResponseOptimizationService {
  private readonly logger = new Logger(ResponseOptimizationService.name);
  private readonly defaultCompressionThreshold: number;
  private readonly defaultCompressionLevel: number;
  private readonly enableCompression: boolean;
  private readonly enableCaching: boolean;

  constructor(private readonly configService: ConfigService) {
    this.defaultCompressionThreshold = this.configService.get<number>(
      'COMPRESSION_THRESHOLD',
      1024,
    ); // 1KB
    this.defaultCompressionLevel = this.configService.get<number>('COMPRESSION_LEVEL', 6);
    this.enableCompression = this.configService.get<boolean>('ENABLE_COMPRESSION', true);
    this.enableCaching = this.configService.get<boolean>('ENABLE_RESPONSE_CACHING', true);
  }

  /**
   * Compress response data based on client capabilities
   */
  async compressResponse(
    data: any,
    acceptEncoding: string = '',
    options: CompressionOptions = {},
  ): Promise<{
    data: Buffer | string;
    encoding?: string;
    metrics: ResponseMetrics;
  }> {
    const startTime = Date.now();
    const {
      threshold = this.defaultCompressionThreshold,
      level = this.defaultCompressionLevel,
      algorithms = ['br', 'gzip', 'deflate'],
    } = options;

    // Convert data to string if it's an object
    const stringData = typeof data === 'string' ? data : JSON.stringify(data);
    const originalSize = Buffer.byteLength(stringData, 'utf8');

    // Don't compress if below threshold
    if (!this.enableCompression || originalSize < threshold) {
      return {
        data: stringData,
        metrics: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          compressionTime: Date.now() - startTime,
          algorithm: 'none',
        },
      };
    }

    // Determine best compression algorithm based on client support
    const supportedAlgorithms = this.parseAcceptEncoding(acceptEncoding);
    const algorithm = this.selectBestAlgorithm(algorithms, supportedAlgorithms);

    if (!algorithm) {
      return {
        data: stringData,
        metrics: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          compressionTime: Date.now() - startTime,
          algorithm: 'none',
        },
      };
    }

    try {
      let compressedData: Buffer;

      switch (algorithm) {
        case 'br':
          compressedData = await brotliCompress(stringData, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: level,
            },
          });
          break;
        case 'gzip':
          compressedData = await gzip(stringData, { level });
          break;
        case 'deflate':
          compressedData = await deflate(stringData, { level });
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${algorithm}`);
      }

      const compressedSize = compressedData.length;
      const compressionRatio = originalSize / compressedSize;
      const compressionTime = Date.now() - startTime;

      this.logger.debug(
        `Compressed response: ${originalSize} -> ${compressedSize} bytes ` +
          `(${compressionRatio.toFixed(2)}x) using ${algorithm} in ${compressionTime}ms`,
      );

      return {
        data: compressedData,
        encoding: algorithm,
        metrics: {
          originalSize,
          compressedSize,
          compressionRatio,
          compressionTime,
          algorithm,
        },
      };
    } catch (error) {
      this.logger.error(`Compression failed with ${algorithm}:`, error);

      return {
        data: stringData,
        metrics: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          compressionTime: Date.now() - startTime,
          algorithm: 'none',
        },
      };
    }
  }

  /**
   * Set appropriate cache headers based on content type and caching strategy
   */
  setCacheHeaders(response: Response, options: CacheHeaders = {}, contentType?: string): void {
    if (!this.enableCaching) {
      response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }

    const {
      maxAge,
      sMaxAge,
      mustRevalidate = false,
      noCache = false,
      noStore = false,
      private: isPrivate = false,
      public: isPublic = false,
      immutable = false,
      staleWhileRevalidate,
      staleIfError,
    } = options;

    const cacheDirectives: string[] = [];

    if (noStore) {
      cacheDirectives.push('no-store');
    } else if (noCache) {
      cacheDirectives.push('no-cache');
    } else {
      if (isPrivate) {
        cacheDirectives.push('private');
      } else if (isPublic) {
        cacheDirectives.push('public');
      }

      if (maxAge !== undefined) {
        cacheDirectives.push(`max-age=${maxAge}`);
      }

      if (sMaxAge !== undefined) {
        cacheDirectives.push(`s-maxage=${sMaxAge}`);
      }

      if (mustRevalidate) {
        cacheDirectives.push('must-revalidate');
      }

      if (immutable) {
        cacheDirectives.push('immutable');
      }

      if (staleWhileRevalidate !== undefined) {
        cacheDirectives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
      }

      if (staleIfError !== undefined) {
        cacheDirectives.push(`stale-if-error=${staleIfError}`);
      }
    }

    if (cacheDirectives.length > 0) {
      response.set('Cache-Control', cacheDirectives.join(', '));
    }

    // Set ETag for conditional requests
    if (!noCache && !noStore) {
      this.setETag(response, contentType);
    }

    // Set Vary header for content negotiation
    response.set('Vary', 'Accept-Encoding, Accept');
  }

  /**
   * Generate and set ETag header
   */
  setETag(response: Response, content?: string): void {
    if (!content) return;

    const hash = createHash('md5').update(content).digest('hex');
    const etag = `"${hash}"`;
    response.set('ETag', etag);
  }

  /**
   * Check if response should be cached based on status code and headers
   */
  shouldCache(statusCode: number, headers: Record<string, any> = {}): boolean {
    // Don't cache error responses
    if (statusCode >= 400) {
      return false;
    }

    // Don't cache if explicitly disabled
    const cacheControl = headers['cache-control'];
    if (cacheControl && (cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
      return false;
    }

    // Cache successful responses
    return statusCode >= 200 && statusCode < 300;
  }

  /**
   * Get cache headers for different content types
   */
  getDefaultCacheHeaders(contentType: string): CacheHeaders {
    const type = contentType.toLowerCase();

    if (type.includes('application/json')) {
      return {
        maxAge: 300, // 5 minutes
        mustRevalidate: true,
        staleWhileRevalidate: 60,
      };
    }

    if (type.includes('text/html')) {
      return {
        maxAge: 60, // 1 minute
        mustRevalidate: true,
      };
    }

    if (
      type.includes('image/') ||
      type.includes('font/') ||
      type.includes('application/javascript')
    ) {
      return {
        maxAge: 86400, // 1 day
        public: true,
        immutable: true,
      };
    }

    // Default for other content types
    return {
      maxAge: 300, // 5 minutes
      mustRevalidate: true,
    };
  }

  /**
   * Optimize response for pagination
   */
  optimizePaginatedResponse<T>(
    data: T[],
    totalCount: number,
    page: number,
    limit: number,
    baseUrl: string,
  ): {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      nextPage?: string;
      previousPage?: string;
      firstPage: string;
      lastPage: string;
    };
  } {
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const pagination = {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      firstPage: `${baseUrl}?page=1&limit=${limit}`,
      lastPage: `${baseUrl}?page=${totalPages}&limit=${limit}`,
      ...(hasNextPage && {
        nextPage: `${baseUrl}?page=${page + 1}&limit=${limit}`,
      }),
      ...(hasPreviousPage && {
        previousPage: `${baseUrl}?page=${page - 1}&limit=${limit}`,
      }),
    };

    return {
      data,
      pagination,
    };
  }

  /**
   * Create cursor-based pagination response
   */
  optimizeCursorPaginatedResponse<T extends { id: string }>(
    data: T[],
    limit: number,
    baseUrl: string,
    hasNextPage: boolean = false,
  ): {
    data: T[];
    pagination: {
      limit: number;
      hasNextPage: boolean;
      nextCursor?: string;
      nextPage?: string;
    };
  } {
    const nextCursor = data.length > 0 ? data[data.length - 1].id : undefined;

    return {
      data,
      pagination: {
        limit,
        hasNextPage,
        ...(hasNextPage &&
          nextCursor && {
            nextCursor,
            nextPage: `${baseUrl}?cursor=${nextCursor}&limit=${limit}`,
          }),
      },
    };
  }

  /**
   * Apply lazy loading optimization to response
   */
  applyLazyLoading<T>(data: T, lazyFields: string[] = [], request: Request): T {
    if (!lazyFields.length || !data || typeof data !== 'object') {
      return data;
    }

    // Check if client requested specific fields
    const fields = request.query.fields as string;
    const include = request.query.include as string;

    if (fields) {
      // Only include requested fields
      const requestedFields = fields.split(',').map(f => f.trim());
      return this.pickFields(data, requestedFields) as T;
    }

    if (include) {
      // Include specific lazy fields
      const includedFields = include.split(',').map(f => f.trim());
      return this.omitFields(
        data,
        lazyFields.filter(f => !includedFields.includes(f)),
      ) as T;
    }

    // Default: omit lazy fields
    return this.omitFields(data, lazyFields) as T;
  }

  private parseAcceptEncoding(acceptEncoding: string): string[] {
    if (!acceptEncoding) return [];

    return acceptEncoding
      .split(',')
      .map(encoding => encoding.trim().split(';')[0])
      .filter(encoding => encoding && encoding !== '*');
  }

  private selectBestAlgorithm(preferred: string[], supported: string[]): string | null {
    for (const algorithm of preferred) {
      if (supported.includes(algorithm)) {
        return algorithm;
      }
    }
    return null;
  }

  private pickFields<T>(obj: T, fields: string[]): Partial<T> {
    const result: any = {};

    for (const field of fields) {
      if (field in (obj as any)) {
        result[field] = (obj as any)[field];
      }
    }

    return result;
  }

  private omitFields<T>(obj: T, fields: string[]): Partial<T> {
    const result: any = { ...obj };

    for (const field of fields) {
      delete result[field];
    }

    return result;
  }
}
