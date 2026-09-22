import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  RATE_LIMIT = 'rate_limit',
  SYSTEM = 'system',
  BUSINESS_LOGIC = 'business_logic',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
}

export interface AppErrorDetails {
  code: string;
  category: ErrorCategory;
  message: string;
  details?: Record<string, any>;
  statusCode: HttpStatus;
  retryable: boolean;
  timestamp: Date;
  requestId?: string;
  userId?: string;
  correlationId?: string;
  stack?: string;
}

export class AppError extends HttpException {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly timestamp: Date;
  public readonly requestId?: string;
  public readonly userId?: string;
  public readonly correlationId?: string;
  public readonly details?: Record<string, any>;

  constructor(
    errorDetails: Partial<AppErrorDetails> & { message: string; statusCode: HttpStatus },
  ) {
    const {
      message,
      statusCode,
      code = 'UNKNOWN_ERROR',
      category = ErrorCategory.SYSTEM,
      retryable = false,
      details,
      requestId,
      userId,
      correlationId,
    } = errorDetails;

    super(
      {
        message,
        code,
        category,
        statusCode,
        timestamp: new Date().toISOString(),
        requestId,
        userId,
        correlationId,
        details,
      },
      statusCode,
    );

    this.code = code;
    this.category = category;
    this.retryable = retryable;
    this.timestamp = new Date();
    this.requestId = requestId;
    this.userId = userId;
    this.correlationId = correlationId;
    this.details = details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      statusCode: this.getStatus(),
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
      userId: this.userId,
      correlationId: this.correlationId,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

// Predefined error classes for common scenarios
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>, requestId?: string) {
    super({
      message,
      code: 'VALIDATION_ERROR',
      category: ErrorCategory.VALIDATION,
      statusCode: HttpStatus.BAD_REQUEST,
      retryable: false,
      details,
      requestId,
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: Record<string, any>, requestId?: string) {
    super({
      message,
      code: 'AUTHENTICATION_ERROR',
      category: ErrorCategory.AUTHENTICATION,
      statusCode: HttpStatus.UNAUTHORIZED,
      retryable: false,
      details,
      requestId,
    });
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, details?: Record<string, any>, requestId?: string) {
    super({
      message,
      code: 'AUTHORIZATION_ERROR',
      category: ErrorCategory.AUTHORIZATION,
      statusCode: HttpStatus.FORBIDDEN,
      retryable: false,
      details,
      requestId,
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    service: string,
    details?: Record<string, any>,
    requestId?: string,
    retryable = true,
  ) {
    super({
      message,
      code: 'EXTERNAL_SERVICE_ERROR',
      category: ErrorCategory.EXTERNAL_SERVICE,
      statusCode: HttpStatus.BAD_GATEWAY,
      retryable,
      details: { service, ...details },
      requestId,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(
    message: string,
    operation?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    super({
      message,
      code: 'DATABASE_ERROR',
      category: ErrorCategory.DATABASE,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      retryable: true,
      details: { operation, ...details },
      requestId,
    });
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, code: string, details?: Record<string, any>, requestId?: string) {
    super({
      message,
      code,
      category: ErrorCategory.BUSINESS_LOGIC,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      retryable: false,
      details,
      requestId,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, limit: number, windowMs: number, requestId?: string) {
    super({
      message,
      code: 'RATE_LIMIT_EXCEEDED',
      category: ErrorCategory.RATE_LIMIT,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      retryable: true,
      details: { limit, windowMs },
      requestId,
    });
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, configKey?: string, requestId?: string) {
    super({
      message,
      code: 'CONFIGURATION_ERROR',
      category: ErrorCategory.CONFIGURATION,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      retryable: false,
      details: { configKey },
      requestId,
    });
  }
}
