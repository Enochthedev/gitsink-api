import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, HTTP_STATUS } from '../constants';

/**
 * Error utility functions and classes
 */

export interface AppErrorDetails {
  code: string;
  message: string;
  details?: Record<string, any>;
  statusCode: number;
  retryable: boolean;
  timestamp: Date;
  requestId?: string;
  userId?: string;
}

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  RATE_LIMIT = 'rate_limit',
  SYSTEM = 'system',
}

/**
 * Custom application error class
 */
export class AppError extends HttpException {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly timestamp: Date;
  public readonly requestId?: string;
  public readonly userId?: string;

  constructor(
    code: string,
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    category: ErrorCategory = ErrorCategory.SYSTEM,
    retryable: boolean = false,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      {
        code,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        ...(details && { details }),
        ...(requestId && { requestId }),
        ...(userId && { userId }),
      },
      statusCode,
    );

    this.code = code;
    this.category = category;
    this.retryable = retryable;
    this.timestamp = new Date();
    this.requestId = requestId;
    this.userId = userId;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = 'Authentication failed',
    code: string = ERROR_CODES.INVALID_CREDENTIALS,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.UNAUTHORIZED,
      ErrorCategory.AUTHENTICATION,
      false,
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string = 'Access denied',
    code: string = ERROR_CODES.RESOURCE_FORBIDDEN,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.FORBIDDEN,
      ErrorCategory.AUTHORIZATION,
      false,
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    code: string = ERROR_CODES.INVALID_INPUT,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCategory.VALIDATION,
      false,
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(
    message: string = 'Resource not found',
    code: string = ERROR_CODES.RESOURCE_NOT_FOUND,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.NOT_FOUND,
      ErrorCategory.SYSTEM,
      false,
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Conflict error
 */
export class ConflictError extends AppError {
  constructor(
    message: string = 'Resource conflict',
    code: string = ERROR_CODES.RESOURCE_CONFLICT,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.CONFLICT,
      ErrorCategory.SYSTEM,
      false,
      details,
      requestId,
      userId,
    );
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends AppError {
  constructor(
    message: string = 'External service error',
    code: string = ERROR_CODES.GITHUB_API_ERROR,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.BAD_GATEWAY,
      ErrorCategory.EXTERNAL_SERVICE,
      true, // External service errors are typically retryable
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Database error
 */
export class DatabaseError extends AppError {
  constructor(
    message: string = 'Database error',
    code: string = ERROR_CODES.DATABASE_ERROR,
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ErrorCategory.DATABASE,
      true, // Database errors might be retryable
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Rate limit exceeded',
    code: string = 'RATE_LIMIT_EXCEEDED',
    details?: Record<string, any>,
    requestId?: string,
    userId?: string,
  ) {
    super(
      code,
      message,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ErrorCategory.RATE_LIMIT,
      true, // Rate limit errors are retryable after delay
      details,
      requestId,
      userId,
    );
  }
}

/**
 * Formats error for logging
 */
export function formatErrorForLogging(
  error: Error | AppError,
  context?: Record<string, any>,
): Record<string, any> {
  const baseLog = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (error instanceof AppError) {
    return {
      ...baseLog,
      code: error.code,
      category: error.category,
      statusCode: error.getStatus(),
      retryable: error.retryable,
      requestId: error.requestId,
      userId: error.userId,
    };
  }

  return baseLog;
}

/**
 * Determines if an error should be retried
 */
export function shouldRetryError(error: Error | AppError): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  // Check for specific error types that are typically retryable
  const retryablePatterns = [
    /timeout/i,
    /connection/i,
    /network/i,
    /ECONNRESET/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
  ];

  return retryablePatterns.some(pattern => pattern.test(error.message));
}

/**
 * Calculates retry delay with exponential backoff
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
}

/**
 * Sanitizes error message for user-facing responses
 */
export function sanitizeErrorMessage(error: Error | AppError): string {
  if (error instanceof AppError) {
    return error.message;
  }

  // Don't expose internal error details to users
  const sensitivePatterns = [/password/i, /token/i, /key/i, /secret/i, /database/i, /connection/i];

  if (sensitivePatterns.some(pattern => pattern.test(error.message))) {
    return 'An internal error occurred. Please try again later.';
  }

  return error.message;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: Error | AppError,
  requestId?: string,
): {
  error: {
    code: string;
    message: string;
    timestamp: string;
    requestId?: string;
  };
} {
  const sanitizedMessage = sanitizeErrorMessage(error);

  return {
    error: {
      code: error instanceof AppError ? error.code : ERROR_CODES.INTERNAL_ERROR,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };
}
