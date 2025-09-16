import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ErrorCategory } from '../exceptions/app-error';

export const ERROR_BOUNDARY_KEY = 'error_boundary';

export interface ErrorBoundaryOptions {
    /**
     * Fallback function to execute when an error occurs
     */
    fallback?: (error: Error, ...args: any[]) => any;

    /**
     * Whether to retry the operation on failure
     */
    retry?: {
        attempts: number;
        delay: number;
        exponentialBackoff?: boolean;
    };

    /**
     * Error categories that should be handled by this boundary
     */
    handleCategories?: ErrorCategory[];

    /**
     * Whether to log errors caught by this boundary
     */
    logErrors?: boolean;

    /**
     * Custom error message to use instead of the original error message
     */
    customMessage?: string;

    /**
     * Context information to include in error logs
     */
    context?: string;

    /**
     * Whether to suppress the error (return fallback without throwing)
     */
    suppressError?: boolean;
}

/**
 * Decorator that provides error boundary functionality for methods
 */
export function ErrorBoundary(options: ErrorBoundaryOptions = {}) {
    return applyDecorators(
        SetMetadata(ERROR_BOUNDARY_KEY, options)
    );
}

/**
 * Decorator for database operations with specific error handling
 */
export function DatabaseErrorBoundary(fallbackValue?: any) {
    return ErrorBoundary({
        handleCategories: [ErrorCategory.DATABASE],
        fallback: () => fallbackValue,
        retry: {
            attempts: 3,
            delay: 1000,
            exponentialBackoff: true,
        },
        logErrors: true,
        context: 'database_operation',
    });
}

/**
 * Decorator for external service calls with retry logic
 */
export function ExternalServiceErrorBoundary(serviceName: string, fallbackValue?: any) {
    return ErrorBoundary({
        handleCategories: [ErrorCategory.EXTERNAL_SERVICE, ErrorCategory.NETWORK],
        fallback: () => fallbackValue,
        retry: {
            attempts: 3,
            delay: 2000,
            exponentialBackoff: true,
        },
        logErrors: true,
        context: `external_service:${serviceName}`,
    });
}

/**
 * Decorator for validation operations
 */
export function ValidationErrorBoundary(customMessage?: string) {
    return ErrorBoundary({
        handleCategories: [ErrorCategory.VALIDATION],
        customMessage,
        logErrors: true,
        context: 'validation',
        suppressError: false, // Always throw validation errors
    });
}

/**
 * Decorator for authentication operations
 */
export function AuthErrorBoundary() {
    return ErrorBoundary({
        handleCategories: [ErrorCategory.AUTHENTICATION, ErrorCategory.AUTHORIZATION],
        logErrors: true,
        context: 'authentication',
        suppressError: false, // Always throw auth errors
    });
}

/**
 * Decorator for business logic operations with graceful degradation
 */
export function BusinessLogicErrorBoundary(fallbackValue?: any) {
    return ErrorBoundary({
        handleCategories: [ErrorCategory.BUSINESS_LOGIC],
        fallback: () => fallbackValue,
        logErrors: true,
        context: 'business_logic',
        suppressError: true, // Return fallback for business logic errors
    });
}