import { LOG_LEVELS } from '../constants';

/**
 * Logging utility functions for standardized logging patterns
 */

export interface LogContext {
  userId?: string;
  requestId?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface SecurityLogContext extends LogContext {
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
}

export interface DatabaseLogContext extends LogContext {
  query?: string;
  table?: string;
  operation?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  rowCount?: number;
}

export interface ExternalServiceLogContext extends LogContext {
  service?: string;
  endpoint?: string;
  statusCode?: number;
  responseTime?: number;
}

/**
 * Creates a standardized log message for authentication operations
 */
export function createAuthLogMessage(
  operation: string,
  status: 'success' | 'failure',
  context: SecurityLogContext,
): { message: string; context: Record<string, any> } {
  return {
    message: `Authentication ${operation} ${status}`,
    context: {
      operation,
      status,
      userId: context.userId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      duration: context.duration,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for API operations
 */
export function createApiLogMessage(
  method: string,
  endpoint: string,
  statusCode: number,
  context: LogContext,
): { message: string; context: Record<string, any> } {
  return {
    message: `API ${method} ${endpoint} - ${statusCode}`,
    context: {
      method,
      endpoint,
      statusCode,
      userId: context.userId,
      requestId: context.requestId,
      duration: context.duration,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for database operations
 */
export function createDatabaseLogMessage(
  operation: string,
  status: 'success' | 'failure',
  context: DatabaseLogContext,
): { message: string; context: Record<string, any> } {
  return {
    message: `Database ${operation} ${status}`,
    context: {
      operation,
      status,
      table: context.table,
      rowCount: context.rowCount,
      duration: context.duration,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for external service calls
 */
export function createExternalServiceLogMessage(
  service: string,
  operation: string,
  status: 'success' | 'failure',
  context: ExternalServiceLogContext,
): { message: string; context: Record<string, any> } {
  return {
    message: `External service ${service} ${operation} ${status}`,
    context: {
      service,
      operation,
      status,
      endpoint: context.endpoint,
      statusCode: context.statusCode,
      responseTime: context.responseTime,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for security events
 */
export function createSecurityLogMessage(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  context: SecurityLogContext,
): { message: string; context: Record<string, any> } {
  return {
    message: `Security event: ${event} (${severity})`,
    context: {
      event,
      severity,
      ip: context.ip,
      userAgent: context.userAgent,
      endpoint: context.endpoint,
      method: context.method,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for sync operations
 */
export function createSyncLogMessage(
  operation: string,
  status: 'started' | 'completed' | 'failed',
  context: LogContext & {
    platform?: string;
    repositoryUrl?: string;
    projectId?: string;
    changes?: number;
  },
): { message: string; context: Record<string, any> } {
  return {
    message: `Sync ${operation} ${status}`,
    context: {
      operation,
      status,
      platform: context.platform,
      repositoryUrl: context.repositoryUrl,
      projectId: context.projectId,
      changes: context.changes,
      duration: context.duration,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for queue operations
 */
export function createQueueLogMessage(
  jobType: string,
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying',
  context: LogContext & {
    jobId?: string;
    attempt?: number;
    maxAttempts?: number;
    delay?: number;
  },
): { message: string; context: Record<string, any> } {
  return {
    message: `Queue job ${jobType} ${status}`,
    context: {
      jobType,
      status,
      jobId: context.jobId,
      attempt: context.attempt,
      maxAttempts: context.maxAttempts,
      delay: context.delay,
      duration: context.duration,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Creates a standardized log message for cache operations
 */
export function createCacheLogMessage(
  operation: 'get' | 'set' | 'del' | 'clear',
  result: 'hit' | 'miss' | 'success' | 'failure',
  context: LogContext & {
    key?: string;
    ttl?: number;
    size?: number;
  },
): { message: string; context: Record<string, any> } {
  return {
    message: `Cache ${operation} ${result}`,
    context: {
      operation,
      result,
      key: context.key,
      ttl: context.ttl,
      size: context.size,
      duration: context.duration,
      userId: context.userId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      ...context.metadata,
    },
  };
}

/**
 * Sanitizes log data to remove sensitive information
 */
export function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'session',
  ];

  const sanitized = { ...data };

  for (const key in sanitized) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Determines log level based on status code
 */
export function getLogLevelFromStatusCode(statusCode: number): string {
  if (statusCode >= 500) return LOG_LEVELS.ERROR;
  if (statusCode >= 400) return LOG_LEVELS.WARN;
  if (statusCode >= 300) return LOG_LEVELS.INFO;
  return LOG_LEVELS.DEBUG;
}

/**
 * Formats duration for logging
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const seconds = milliseconds / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = seconds / 60;
  return `${minutes.toFixed(2)}m`;
}

/**
 * Creates a correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Truncates long strings for logging
 */
export function truncateForLogging(str: string, maxLength: number = 1000): string {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength) + '... [truncated]';
}
