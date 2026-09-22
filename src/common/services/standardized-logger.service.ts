import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DatabaseLogContext,
  ExternalServiceLogContext,
  LogContext,
  SecurityLogContext,
  createApiLogMessage,
  createAuthLogMessage,
  createCacheLogMessage,
  createDatabaseLogMessage,
  createExternalServiceLogMessage,
  createQueueLogMessage,
  createSecurityLogMessage,
  createSyncLogMessage,
  formatDuration,
  sanitizeLogData,
} from '../utils/logging.utils';

/**
 * Standardized logging service that provides consistent logging patterns
 * across the entire application
 */
@Injectable()
export class StandardizedLoggerService {
  constructor(private readonly logger: PinoLogger) {}

  /**
   * Sets the context for the logger
   */
  setContext(context: string): void {
    this.logger.setContext(context);
  }

  /**
   * Logs authentication operations
   */
  logAuthOperation(
    operation: string,
    status: 'success' | 'failure',
    context: SecurityLogContext,
  ): void {
    const { message, context: logContext } = createAuthLogMessage(operation, status, context);

    if (status === 'success') {
      this.logger.info(message, sanitizeLogData(logContext));
    } else {
      this.logger.warn(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Logs API operations
   */
  logApiOperation(method: string, endpoint: string, statusCode: number, context: LogContext): void {
    const { message, context: logContext } = createApiLogMessage(
      method,
      endpoint,
      statusCode,
      context,
    );

    if (statusCode >= 500) {
      this.logger.error(message, sanitizeLogData(logContext));
    } else if (statusCode >= 400) {
      this.logger.warn(message, sanitizeLogData(logContext));
    } else {
      this.logger.info(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Logs database operations
   */
  logDatabaseOperation(
    operation: string,
    status: 'success' | 'failure',
    context: DatabaseLogContext,
  ): void {
    const { message, context: logContext } = createDatabaseLogMessage(operation, status, context);

    if (status === 'success') {
      this.logger.debug(message, sanitizeLogData(logContext));
    } else {
      this.logger.error(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Logs external service calls
   */
  logExternalService(
    service: string,
    operation: string,
    status: 'success' | 'failure',
    context: ExternalServiceLogContext,
  ): void {
    const { message, context: logContext } = createExternalServiceLogMessage(
      service,
      operation,
      status,
      context,
    );

    if (status === 'success') {
      this.logger.info(message, sanitizeLogData(logContext));
    } else {
      this.logger.error(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Logs security events
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: SecurityLogContext,
  ): void {
    const { message, context: logContext } = createSecurityLogMessage(event, severity, context);

    switch (severity) {
      case 'critical':
      case 'high':
        this.logger.error(message, sanitizeLogData(logContext));
        break;
      case 'medium':
        this.logger.warn(message, sanitizeLogData(logContext));
        break;
      case 'low':
        this.logger.info(message, sanitizeLogData(logContext));
        break;
    }
  }

  /**
   * Logs sync operations
   */
  logSyncOperation(
    operation: string,
    status: 'started' | 'completed' | 'failed',
    context: LogContext & {
      platform?: string;
      repositoryUrl?: string;
      projectId?: string;
      changes?: number;
    },
  ): void {
    const { message, context: logContext } = createSyncLogMessage(operation, status, context);

    switch (status) {
      case 'started':
        this.logger.info(message, sanitizeLogData(logContext));
        break;
      case 'completed':
        this.logger.info(message, sanitizeLogData(logContext));
        break;
      case 'failed':
        this.logger.error(message, sanitizeLogData(logContext));
        break;
    }
  }

  /**
   * Logs queue operations
   */
  logQueueOperation(
    jobType: string,
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying',
    context: LogContext & {
      jobId?: string;
      attempt?: number;
      maxAttempts?: number;
      delay?: number;
    },
  ): void {
    const { message, context: logContext } = createQueueLogMessage(jobType, status, context);

    switch (status) {
      case 'queued':
      case 'processing':
      case 'completed':
        this.logger.info(message, sanitizeLogData(logContext));
        break;
      case 'failed':
        this.logger.error(message, sanitizeLogData(logContext));
        break;
      case 'retrying':
        this.logger.warn(message, sanitizeLogData(logContext));
        break;
    }
  }

  /**
   * Logs cache operations
   */
  logCacheOperation(
    operation: 'get' | 'set' | 'del' | 'clear',
    result: 'hit' | 'miss' | 'success' | 'failure',
    context: LogContext & {
      key?: string;
      ttl?: number;
      size?: number;
    },
  ): void {
    const { message, context: logContext } = createCacheLogMessage(operation, result, context);

    if (result === 'failure') {
      this.logger.warn(message, sanitizeLogData(logContext));
    } else {
      this.logger.debug(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Logs performance metrics
   */
  logPerformance(operation: string, duration: number, context: LogContext): void {
    const formattedDuration = formatDuration(duration);
    const message = `Performance: ${operation} completed in ${formattedDuration}`;

    const logContext = {
      operation,
      duration,
      formattedDuration,
      ...context,
      timestamp: new Date().toISOString(),
    };

    // Log as warning if operation took too long
    if (duration > 5000) {
      // 5 seconds
      this.logger.warn(message, sanitizeLogData(logContext));
    } else if (duration > 1000) {
      // 1 second
      this.logger.info(message, sanitizeLogData(logContext));
    } else {
      this.logger.debug(message, sanitizeLogData(logContext));
    }
  }

  /**
   * Standard info logging
   */
  info(message: string, context?: Record<string, any>): void {
    this.logger.info(message, context ? sanitizeLogData(context) : undefined);
  }

  /**
   * Standard debug logging
   */
  debug(message: string, context?: Record<string, any>): void {
    this.logger.debug(message, context ? sanitizeLogData(context) : undefined);
  }

  /**
   * Standard warning logging
   */
  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn(message, context ? sanitizeLogData(context) : undefined);
  }

  /**
   * Standard error logging
   */
  error(message: string, error?: Error | any, context?: Record<string, any>): void {
    const logContext = {
      ...context,
      ...(error && {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    };

    this.logger.error(message, sanitizeLogData(logContext));
  }

  /**
   * Logs with custom level
   */
  log(
    level: 'info' | 'debug' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>,
  ): void {
    switch (level) {
      case 'info':
        this.info(message, context);
        break;
      case 'debug':
        this.debug(message, context);
        break;
      case 'warn':
        this.warn(message, context);
        break;
      case 'error':
        this.error(message, undefined, context);
        break;
    }
  }
}
