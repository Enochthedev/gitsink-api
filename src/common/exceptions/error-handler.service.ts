import { Injectable, Logger, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AxiosError } from 'axios';
import { ThrottlerException } from '@nestjs/throttler';
import {
    AppError,
    ErrorCategory,
    ValidationError,
    AuthenticationError,
    ExternalServiceError,
    DatabaseError,
    RateLimitError,
    BusinessLogicError,
    ConfigurationError
} from './app-error';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class ErrorHandlerService {
    private readonly logger = new Logger(ErrorHandlerService.name);

    /**
     * Convert any error to a standardized AppError
     */
    handleError(error: Error, context?: ExecutionContext, requestId?: string, userId?: string): AppError {
        // If it's already an AppError, just add context if missing
        if (error instanceof AppError) {
            const errorData = error.toJSON();
            return new AppError({
                message: errorData.message,
                code: errorData.code,
                category: errorData.category,
                statusCode: errorData.statusCode,
                retryable: errorData.retryable,
                details: errorData.details,
                requestId: error.requestId || requestId,
                userId: error.userId || userId,
                correlationId: error.correlationId || errorData.correlationId,
            });
        }

        // Handle specific error types
        if (error.name === 'PrismaClientKnownRequestError' || error instanceof Prisma.PrismaClientKnownRequestError) {
            return this.handlePrismaError(error as Prisma.PrismaClientKnownRequestError, requestId, userId);
        }

        if (error.name === 'PrismaClientUnknownRequestError' || error instanceof Prisma.PrismaClientUnknownRequestError) {
            return this.handlePrismaUnknownError(error as Prisma.PrismaClientUnknownRequestError, requestId, userId);
        }

        if (error.name === 'PrismaClientValidationError' || error instanceof Prisma.PrismaClientValidationError) {
            return this.handlePrismaValidationError(error as Prisma.PrismaClientValidationError, requestId, userId);
        }

        if (error.name === 'AxiosError' || (error as any).isAxiosError) {
            return this.handleAxiosError(error as AxiosError, requestId, userId);
        }

        if (error instanceof ThrottlerException) {
            return this.handleThrottlerError(error, requestId, userId);
        }

        // Handle validation errors from class-validator
        if (error.name === 'ValidationError' || error.message.includes('validation')) {
            return new ValidationError(
                error.message || 'Validation failed',
                { originalError: error.name },
                requestId
            );
        }

        // Handle authentication/authorization errors
        if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
            return new AuthenticationError(
                error.message || 'Authentication failed',
                { originalError: error.name },
                requestId
            );
        }

        // Handle configuration errors
        if (error.message.includes('config') || error.message.includes('environment')) {
            return new ConfigurationError(
                error.message || 'Configuration error',
                undefined,
                requestId
            );
        }

        // Default to system error
        this.logger.error('Unhandled error type:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            requestId,
            userId,
        });

        return new AppError({
            message: error.message || 'An unexpected error occurred',
            code: 'SYSTEM_ERROR',
            category: ErrorCategory.SYSTEM,
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: false,
            requestId,
            userId,
            details: {
                originalError: error.name,
                stack: error.stack,
            },
        });
    }

    /**
     * Handle Prisma known request errors
     */
    private handlePrismaError(error: Prisma.PrismaClientKnownRequestError, requestId?: string, userId?: string): AppError {
        const { code, message, meta } = error;

        switch (code) {
            case 'P2002': // Unique constraint violation
                return new ValidationError(
                    'A record with this information already exists',
                    {
                        prismaCode: code,
                        target: meta?.target,
                        constraint: 'unique_violation'
                    },
                    requestId
                );

            case 'P2025': // Record not found
                return new BusinessLogicError(
                    'The requested record was not found',
                    'RECORD_NOT_FOUND',
                    { prismaCode: code },
                    requestId
                );

            case 'P2003': // Foreign key constraint violation
                return new ValidationError(
                    'Invalid reference to related record',
                    {
                        prismaCode: code,
                        field: meta?.field_name,
                        constraint: 'foreign_key_violation'
                    },
                    requestId
                );

            case 'P2014': // Required relation violation
                return new ValidationError(
                    'Required relationship is missing',
                    {
                        prismaCode: code,
                        relation: meta?.relation_name,
                        constraint: 'required_relation_violation'
                    },
                    requestId
                );

            case 'P2034': // Transaction conflict
                return new DatabaseError(
                    'Database transaction conflict - please retry',
                    'transaction_conflict',
                    { prismaCode: code },
                    requestId
                );

            default:
                return new DatabaseError(
                    message || 'Database operation failed',
                    'prisma_error',
                    { prismaCode: code, meta },
                    requestId
                );
        }
    }

    /**
     * Handle Prisma unknown request errors
     */
    private handlePrismaUnknownError(error: Prisma.PrismaClientUnknownRequestError, requestId?: string, userId?: string): AppError {
        return new DatabaseError(
            'Database connection or query error',
            'prisma_unknown_error',
            { originalMessage: error.message },
            requestId
        );
    }

    /**
     * Handle Prisma validation errors
     */
    private handlePrismaValidationError(error: Prisma.PrismaClientValidationError, requestId?: string, userId?: string): AppError {
        return new ValidationError(
            'Invalid data provided to database operation',
            {
                originalMessage: error.message,
                type: 'prisma_validation_error'
            },
            requestId
        );
    }

    /**
     * Handle Axios HTTP errors
     */
    private handleAxiosError(error: AxiosError, requestId?: string, userId?: string): AppError {
        const { response, request, config } = error;
        const service = this.extractServiceName(config?.url);

        if (response) {
            // Server responded with error status
            const isRetryable = this.isRetryableHttpStatus(response.status);

            return new ExternalServiceError(
                `External service error: ${response.statusText || 'Unknown error'}`,
                service,
                {
                    status: response.status,
                    statusText: response.statusText,
                    url: config?.url,
                    method: config?.method?.toUpperCase(),
                    responseData: response.data,
                },
                requestId,
                isRetryable
            );
        } else if (request) {
            // Request was made but no response received
            return new ExternalServiceError(
                `Network error: Unable to reach ${service}`,
                service,
                {
                    url: config?.url,
                    method: config?.method?.toUpperCase(),
                    timeout: config?.timeout,
                },
                requestId,
                true // Network errors are usually retryable
            );
        } else {
            // Request setup error
            return new ExternalServiceError(
                `Request configuration error: ${error.message}`,
                service,
                {
                    url: config?.url,
                    method: config?.method?.toUpperCase(),
                },
                requestId,
                false
            );
        }
    }

    /**
     * Handle throttler/rate limit errors
     */
    private handleThrottlerError(error: ThrottlerException, requestId?: string, userId?: string): AppError {
        return new RateLimitError(
            'Rate limit exceeded - please slow down',
            0, // We don't have access to the actual limit from ThrottlerException
            0,  // We don't have access to the window from ThrottlerException
            requestId
        );
    }

    /**
     * Determine if an HTTP status code indicates a retryable error
     */
    private isRetryableHttpStatus(status: number): boolean {
        // 5xx server errors are generally retryable
        // Some 4xx errors like 429 (rate limit) and 408 (timeout) are retryable
        return status >= 500 || status === 429 || status === 408 || status === 503;
    }

    /**
     * Extract service name from URL for better error context
     */
    private extractServiceName(url?: string): string {
        if (!url) return 'unknown_service';

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Map known services
            if (hostname.includes('github.com') || hostname.includes('api.github.com')) {
                return 'github';
            } else if (hostname.includes('gitlab.com')) {
                return 'gitlab';
            } else if (hostname.includes('bitbucket.org')) {
                return 'bitbucket';
            } else if (hostname.includes('openai.com')) {
                return 'openai';
            } else {
                return hostname;
            }
        } catch {
            return 'unknown_service';
        }
    }

    /**
     * Determine if an error should be retried
     */
    shouldRetry(error: AppError, attempt: number, maxAttempts: number = 3): boolean {
        if (attempt >= maxAttempts) return false;
        if (!error.retryable) return false;

        // Don't retry validation or authentication errors
        if (error.category === ErrorCategory.VALIDATION ||
            error.category === ErrorCategory.AUTHENTICATION ||
            error.category === ErrorCategory.AUTHORIZATION) {
            return false;
        }

        return true;
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    getRetryDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        return Math.min(delay + jitter, maxDelay);
    }

    /**
     * Log error with appropriate level and context
     */
    logError(error: AppError, context?: string): void {
        const logContext = {
            code: error.code,
            category: error.category,
            statusCode: error.getStatus(),
            requestId: error.requestId,
            userId: error.userId,
            correlationId: error.correlationId,
            retryable: error.retryable,
            details: error.details,
            context,
        };

        // Log level based on error category and status
        if (error.getStatus() >= 500) {
            this.logger.error(error.message, logContext);
        } else if (error.getStatus() >= 400) {
            this.logger.warn(error.message, logContext);
        } else {
            this.logger.log(error.message, logContext);
        }
    }
}