import { Injectable, Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError, ErrorCategory } from '../exceptions/app-error';

export interface LogContext {
    requestId?: string;
    userId?: string;
    correlationId?: string;
    operation?: string;
    duration?: number;
    metadata?: Record<string, any>;
    timestamp?: string;
}

export interface ErrorLogContext extends LogContext {
    errorCode?: string;
    errorCategory?: ErrorCategory;
    stackTrace?: string;
    retryable?: boolean;
    attempt?: number;
}

export interface PerformanceLogContext extends LogContext {
    startTime?: number;
    endTime?: number;
    memoryUsage?: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
}

export interface SecurityLogContext extends LogContext {
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    threat?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
}

@Injectable()
export class EnhancedLoggerService {
    private readonly logger = new Logger(EnhancedLoggerService.name);
    private readonly logLevel: LogLevel;
    private readonly enableStructuredLogging: boolean;
    private readonly enablePerformanceLogging: boolean;
    private readonly enableSecurityLogging: boolean;

    constructor(private readonly configService: ConfigService) {
        this.logLevel = (this.configService.get('LOG_LEVEL') as LogLevel) || 'info';
        this.enableStructuredLogging = this.configService.get<boolean>('ENABLE_STRUCTURED_LOGGING', true);
        this.enablePerformanceLogging = this.configService.get<boolean>('ENABLE_PERFORMANCE_LOGGING', true);
        this.enableSecurityLogging = this.configService.get<boolean>('ENABLE_SECURITY_LOGGING', true);
    }

    /**
     * Log application errors with enhanced context
     */
    logError(error: AppError | Error, context?: ErrorLogContext): void {
        const errorContext: ErrorLogContext = {
            ...context,
            timestamp: new Date().toISOString(),
        };

        if (error instanceof AppError) {
            errorContext.errorCode = error.code;
            errorContext.errorCategory = error.category;
            errorContext.retryable = error.retryable;
            errorContext.requestId = error.requestId || context?.requestId;
            errorContext.userId = error.userId || context?.userId;
            errorContext.correlationId = error.correlationId || context?.correlationId;
            errorContext.stackTrace = error.stack;
        } else {
            errorContext.errorCode = error.name;
            errorContext.stackTrace = error.stack;
        }

        if (this.enableStructuredLogging) {
            this.logger.error(error.message, errorContext);
        } else {
            this.logger.error(`${error.message} | Context: ${JSON.stringify(errorContext)}`);
        }
    }

    /**
     * Log performance metrics
     */
    logPerformance(operation: string, context: PerformanceLogContext): void {
        if (!this.enablePerformanceLogging) return;

        const performanceContext: PerformanceLogContext = {
            ...context,
            operation,
            timestamp: new Date().toISOString(),
        };

        if (context.startTime && context.endTime) {
            performanceContext.duration = context.endTime - context.startTime;
        }

        if (this.enableStructuredLogging) {
            this.logger.log(`Performance: ${operation}`, performanceContext);
        } else {
            this.logger.log(`Performance: ${operation} | ${JSON.stringify(performanceContext)}`);
        }
    }

    /**
     * Log security events
     */
    logSecurity(event: string, context: SecurityLogContext): void {
        if (!this.enableSecurityLogging) return;

        const securityContext: SecurityLogContext = {
            ...context,
            timestamp: new Date().toISOString(),
        };

        const logLevel = this.getSecurityLogLevel(context.severity);
        const message = `Security Event: ${event}`;

        if (this.enableStructuredLogging) {
            this.logger[logLevel](message, securityContext);
        } else {
            this.logger[logLevel](`${message} | ${JSON.stringify(securityContext)}`);
        }
    }

    /**
     * Log API requests and responses
     */
    logApiRequest(
        method: string,
        url: string,
        statusCode: number,
        duration: number,
        context?: LogContext
    ): void {
        const apiContext: LogContext = {
            ...context,
            operation: 'api_request',
            duration,
            metadata: {
                method,
                url,
                statusCode,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `${method} ${url} - ${statusCode} (${duration}ms)`;

        if (statusCode >= 500) {
            this.logger.error(message, apiContext);
        } else if (statusCode >= 400) {
            this.logger.warn(message, apiContext);
        } else {
            this.logger.log(message, apiContext);
        }
    }

    /**
     * Log database operations
     */
    logDatabaseOperation(
        operation: string,
        table: string,
        duration: number,
        context?: LogContext
    ): void {
        const dbContext: LogContext = {
            ...context,
            operation: 'database_operation',
            duration,
            metadata: {
                operation,
                table,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `DB ${operation} on ${table} (${duration}ms)`;

        if (duration > 1000) {
            this.logger.warn(`Slow ${message}`, dbContext);
        } else {
            this.logger.debug(message, dbContext);
        }
    }

    /**
     * Log external service calls
     */
    logExternalService(
        service: string,
        operation: string,
        success: boolean,
        duration: number,
        context?: LogContext
    ): void {
        const serviceContext: LogContext = {
            ...context,
            operation: 'external_service_call',
            duration,
            metadata: {
                service,
                operation,
                success,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `External Service: ${service}.${operation} - ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`;

        if (!success) {
            this.logger.error(message, serviceContext);
        } else if (duration > 5000) {
            this.logger.warn(`Slow ${message}`, serviceContext);
        } else {
            this.logger.log(message, serviceContext);
        }
    }

    /**
     * Log authentication events
     */
    logAuthentication(
        event: string,
        success: boolean,
        method: string,
        context?: LogContext
    ): void {
        const authContext: LogContext = {
            ...context,
            operation: 'authentication',
            metadata: {
                event,
                success,
                method,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `Auth ${event} via ${method} - ${success ? 'SUCCESS' : 'FAILED'}`;

        if (!success) {
            this.logSecurity(message, {
                ...authContext,
                severity: 'medium',
                threat: 'authentication_failure',
            } as SecurityLogContext);
        } else {
            this.logger.log(message, authContext);
        }
    }

    /**
     * Log business events
     */
    logBusinessEvent(
        event: string,
        entityType: string,
        entityId: string,
        context?: LogContext
    ): void {
        const businessContext: LogContext = {
            ...context,
            operation: 'business_event',
            metadata: {
                event,
                entityType,
                entityId,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `Business Event: ${event} for ${entityType}:${entityId}`;
        this.logger.log(message, businessContext);
    }

    /**
     * Log queue operations
     */
    logQueueOperation(
        queue: string,
        operation: string,
        jobId: string,
        success: boolean,
        duration?: number,
        context?: LogContext
    ): void {
        const queueContext: LogContext = {
            ...context,
            operation: 'queue_operation',
            duration,
            metadata: {
                queue,
                operation,
                jobId,
                success,
                timestamp: new Date().toISOString(),
            },
        };

        const message = `Queue ${operation} on ${queue}:${jobId} - ${success ? 'SUCCESS' : 'FAILED'}`;

        if (!success) {
            this.logger.error(message, queueContext);
        } else {
            this.logger.log(message, queueContext);
        }
    }

    /**
     * Create a child logger with persistent context
     */
    createChildLogger(context: LogContext): ChildLogger {
        return new ChildLogger(this, context);
    }

    private getSecurityLogLevel(severity?: string): LogLevel {
        switch (severity) {
            case 'critical':
                return 'fatal' as LogLevel;
            case 'high':
                return 'error';
            case 'medium':
                return 'warn';
            case 'low':
            default:
                return 'log';
        }
    }
}

/**
 * Child logger that maintains persistent context
 */
export class ChildLogger {
    constructor(
        private readonly parent: EnhancedLoggerService,
        private readonly persistentContext: LogContext
    ) { }

    logError(error: AppError | Error, additionalContext?: ErrorLogContext): void {
        this.parent.logError(error, { ...this.persistentContext, ...additionalContext });
    }

    logPerformance(operation: string, additionalContext?: PerformanceLogContext): void {
        this.parent.logPerformance(operation, { ...this.persistentContext, ...additionalContext });
    }

    logSecurity(event: string, additionalContext?: SecurityLogContext): void {
        this.parent.logSecurity(event, { ...this.persistentContext, ...additionalContext });
    }

    logApiRequest(method: string, url: string, statusCode: number, duration: number): void {
        this.parent.logApiRequest(method, url, statusCode, duration, this.persistentContext);
    }

    logDatabaseOperation(operation: string, table: string, duration: number): void {
        this.parent.logDatabaseOperation(operation, table, duration, this.persistentContext);
    }

    logExternalService(service: string, operation: string, success: boolean, duration: number): void {
        this.parent.logExternalService(service, operation, success, duration, this.persistentContext);
    }

    logAuthentication(event: string, success: boolean, method: string): void {
        this.parent.logAuthentication(event, success, method, this.persistentContext);
    }

    logBusinessEvent(event: string, entityType: string, entityId: string): void {
        this.parent.logBusinessEvent(event, entityType, entityId, this.persistentContext);
    }

    logQueueOperation(queue: string, operation: string, jobId: string, success: boolean, duration?: number): void {
        this.parent.logQueueOperation(queue, operation, jobId, success, duration, this.persistentContext);
    }
}