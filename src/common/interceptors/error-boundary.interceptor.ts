import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { catchError, delay, retry } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { ERROR_BOUNDARY_KEY, ErrorBoundaryOptions } from '../decorators/error-boundary.decorator';
import { ErrorHandlerService } from '../exceptions/error-handler.service';
import { AppError } from '../exceptions/app-error';

@Injectable()
export class ErrorBoundaryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorBoundaryInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly errorHandler: ErrorHandlerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const errorBoundaryOptions = this.reflector.get<ErrorBoundaryOptions>(
      ERROR_BOUNDARY_KEY,
      context.getHandler(),
    );

    if (!errorBoundaryOptions) {
      return next.handle();
    }

    const request = this.getRequest(context);
    const requestId = request?.requestId;
    const userId = request?.user?.id;

    let stream = next.handle();

    // Apply retry logic if configured
    if (errorBoundaryOptions.retry) {
      const { attempts, delay: retryDelay, exponentialBackoff } = errorBoundaryOptions.retry;

      stream = stream.pipe(
        retry({
          count: attempts - 1, // retry() counts retries, not total attempts
          delay: (error, retryCount) => {
            const appError = this.errorHandler.handleError(error, context, requestId, userId);

            // Only retry if the error is retryable
            if (!this.errorHandler.shouldRetry(appError, retryCount + 1, attempts)) {
              return throwError(() => appError);
            }

            const delayMs = exponentialBackoff
              ? this.errorHandler.getRetryDelay(retryCount + 1, retryDelay)
              : retryDelay;

            this.logger.warn(`Retrying operation (attempt ${retryCount + 2}/${attempts})`, {
              context: errorBoundaryOptions.context,
              error: appError.code,
              delay: delayMs,
              requestId,
              userId,
            });

            return of(null).pipe(delay(delayMs));
          },
        }),
      );
    }

    // Apply error handling
    return stream.pipe(
      catchError(error => {
        const appError = this.errorHandler.handleError(error, context, requestId, userId);

        // Check if this error category should be handled by this boundary
        if (
          errorBoundaryOptions.handleCategories &&
          !errorBoundaryOptions.handleCategories.includes(appError.category)
        ) {
          return throwError(() => appError);
        }

        // Log error if configured
        if (errorBoundaryOptions.logErrors !== false) {
          this.errorHandler.logError(appError, errorBoundaryOptions.context);
        }

        // Use custom message if provided
        if (errorBoundaryOptions.customMessage) {
          const errorData = appError.toJSON();
          const customError = new AppError({
            ...errorData,
            timestamp: new Date(errorData.timestamp),
            message: errorBoundaryOptions.customMessage,
          });

          if (errorBoundaryOptions.suppressError && errorBoundaryOptions.fallback) {
            return of(errorBoundaryOptions.fallback(error));
          }

          return throwError(() => customError);
        }

        // Execute fallback if configured and error should be suppressed
        if (errorBoundaryOptions.suppressError && errorBoundaryOptions.fallback) {
          this.logger.debug('Executing fallback for suppressed error', {
            context: errorBoundaryOptions.context,
            error: appError.code,
            requestId,
            userId,
          });

          try {
            const fallbackResult = errorBoundaryOptions.fallback(error);
            return of(fallbackResult);
          } catch (fallbackError) {
            this.logger.error('Fallback function threw an error', {
              context: errorBoundaryOptions.context,
              originalError: appError.code,
              fallbackError:
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              requestId,
              userId,
            });

            return throwError(() =>
              this.errorHandler.handleError(fallbackError as Error, context, requestId, userId),
            );
          }
        }

        // Re-throw the error if not suppressed
        return throwError(() => appError);
      }),
    );
  }

  private getRequest(context: ExecutionContext): any {
    const contextType = context.getType<'http' | 'graphql'>();

    if (contextType === 'http') {
      return context.switchToHttp().getRequest();
    } else if (contextType === 'graphql') {
      const gqlContext = context.getArgByIndex(2);
      return gqlContext?.req;
    }

    return null;
  }
}
