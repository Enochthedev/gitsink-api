import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GqlArgumentsHost, GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AppError, ErrorCategory } from '../exceptions/app-error';
import { ErrorHandlerService } from '../exceptions/error-handler.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly errorHandler: ErrorHandlerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const contextType = host.getType<'http' | 'graphql'>();

    if (contextType === 'graphql') {
      return this.handleGraphQLException(exception, host);
    } else {
      return this.handleHttpException(exception, host);
    }
  }

  private handleHttpException(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate request ID if not present
    const requestId = (request as any).requestId || uuidv4();
    const userId = (request as any).user?.id;

    // Convert to standardized error
    const appError = this.errorHandler.handleError(
      exception as Error,
      host as any,
      requestId,
      userId,
    );

    // Log the error
    this.errorHandler.logError(appError, 'HTTP');

    // Prepare response
    const errorResponse = this.buildErrorResponse(appError, request);

    // Set appropriate headers
    this.setErrorHeaders(response, appError);

    response.status(appError.getStatus()).json(errorResponse);
  }

  private handleGraphQLException(exception: unknown, host: ArgumentsHost): never {
    const gqlHost = GqlArgumentsHost.create(host);
    const context = gqlHost.getContext();
    const info = gqlHost.getInfo();

    const requestId = context?.req?.requestId || uuidv4();
    const userId = context?.req?.user?.id;

    // Convert to standardized error
    const appError = this.errorHandler.handleError(
      exception as Error,
      host as any,
      requestId,
      userId,
    );

    // Log the error with GraphQL context
    this.errorHandler.logError(appError, `GraphQL:${info?.fieldName}`);

    // Throw a proper GraphQL error
    const errorDetails = this.buildGraphQLError(appError);
    throw new GraphQLError(errorDetails.message, {
      extensions: errorDetails.extensions,
    });
  }

  private buildErrorResponse(error: AppError, request: Request) {
    const isProduction = process.env.NODE_ENV === 'production';

    const baseResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
        timestamp: error.timestamp.toISOString(),
        path: request.url,
        method: request.method,
        requestId: error.requestId,
      },
    };

    // Add additional details in non-production environments
    if (!isProduction) {
      return {
        ...baseResponse,
        error: {
          ...baseResponse.error,
          details: error.details,
          stack: error.stack,
          userId: error.userId,
          correlationId: error.correlationId,
        },
      };
    }

    // In production, only include safe details
    if (error.details && this.isSafeToExpose(error)) {
      return {
        ...baseResponse,
        error: {
          ...baseResponse.error,
          details: this.sanitizeDetails(error.details),
        },
      };
    }

    return baseResponse;
  }

  private buildGraphQLError(error: AppError) {
    const isProduction = process.env.NODE_ENV === 'production';

    const extensions: any = {
      code: error.code,
      category: error.category,
      timestamp: error.timestamp.toISOString(),
      requestId: error.requestId,
    };

    if (!isProduction) {
      extensions.details = error.details;
      extensions.userId = error.userId;
      extensions.correlationId = error.correlationId;
    } else if (error.details && this.isSafeToExpose(error)) {
      extensions.details = this.sanitizeDetails(error.details);
    }

    return {
      message: error.message,
      extensions,
    };
  }

  private setErrorHeaders(response: Response, error: AppError) {
    // Set standard error headers
    response.setHeader('X-Error-Code', error.code);
    response.setHeader('X-Error-Category', error.category);
    response.setHeader('X-Request-ID', error.requestId || '');

    // Set retry headers for retryable errors
    if (error.retryable) {
      response.setHeader('Retry-After', '60'); // Suggest retry after 60 seconds
    }

    // Set rate limit headers for rate limit errors
    if (error.category === ErrorCategory.RATE_LIMIT) {
      response.setHeader('X-RateLimit-Limit', error.details?.limit || 'unknown');
      response.setHeader('X-RateLimit-Window', error.details?.windowMs || 'unknown');
      response.setHeader('Retry-After', Math.ceil((error.details?.windowMs || 60000) / 1000));
    }
  }

  private isSafeToExpose(error: AppError): boolean {
    // Only expose details for certain error categories
    const safeCategories = [
      ErrorCategory.VALIDATION,
      ErrorCategory.BUSINESS_LOGIC,
      ErrorCategory.RATE_LIMIT,
    ];

    return safeCategories.includes(error.category);
  }

  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    // List of safe keys that can be exposed to clients
    const safeKeys = [
      'field',
      'constraint',
      'limit',
      'windowMs',
      'target',
      'relation',
      'validation',
      'expected',
      'received',
      'path',
      'property',
    ];

    for (const [key, value] of Object.entries(details)) {
      if (safeKeys.includes(key)) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
