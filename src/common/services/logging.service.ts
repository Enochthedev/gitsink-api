import { Injectable, LogLevel, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
// // const DailyRotateFile = require('winston-daily-rotate-file');

export interface LogContext {
  userId?: string;
  requestId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface SecurityLogContext extends LogContext {
  eventType:
    | 'auth_attempt'
    | 'rate_limit'
    | 'suspicious_activity'
    | 'data_access'
    | 'permission_denied';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source?: string;
  target?: string;
  action?: string;
  result?: 'success' | 'failure' | 'blocked';
}

export interface BusinessLogContext extends LogContext {
  eventType: 'user_signup' | 'project_sync' | 'profile_view' | 'api_call' | 'enrichment_job';
  businessMetrics?: Record<string, number>;
  userTier?: string;
  platform?: string;
}

export interface PerformanceLogContext extends LogContext {
  operation: string;
  duration: number;
  resourceUsage?: {
    memory?: number;
    cpu?: number;
    database?: number;
  };
  cacheHit?: boolean;
  queryCount?: number;
}

@Injectable()
export class LoggingService implements LoggerService {
  private readonly logger: winston.Logger;
  private readonly environment: string;
  private readonly serviceName: string;
  private readonly version: string;

  constructor(private readonly configService: ConfigService) {
    this.environment = this.configService.get('NODE_ENV', 'development');
    this.serviceName = this.configService.get('SERVICE_NAME', 'gitsink-api');
    this.version = this.configService.get('APP_VERSION', '1.0.0');

    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const logLevel = this.configService.get('LOG_LEVEL', 'info');
    const logDir = this.configService.get('LOG_DIR', './logs');

    const formats = [
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ];

    // Add colorization for development
    if (this.environment === 'development') {
      formats.push(winston.format.colorize({ all: true }));
      formats.push(winston.format.simple());
    }

    const transports: winston.transport[] = [];

    // Console transport
    transports.push(
      new winston.transports.Console({
        level: logLevel,
        format: winston.format.combine(...formats),
      }),
    );

    // File transports for production
    if (this.environment === 'production') {
      // General application logs
      // transports.push(
      //     new DailyRotateFile({
      //         filename: `${logDir}/application-%DATE%.log`,
      //         datePattern: 'YYYY-MM-DD',
      //         maxSize: '100m',
      //         maxFiles: '30d',
      //         level: 'info',
      //         format: winston.format.combine(
      //             winston.format.timestamp(),
      //             winston.format.json()
      //         ),
      //     })
      // );
      // Error logs
      // transports.push(
      //     new DailyRotateFile({
      //         filename: `${logDir}/error-%DATE%.log`,
      //         datePattern: 'YYYY-MM-DD',
      //         maxSize: '100m',
      //         maxFiles: '90d',
      //         level: 'error',
      //         format: winston.format.combine(
      //             winston.format.timestamp(),
      //             winston.format.json()
      //         ),
      //     })
      // );
      // Security logs
      // transports.push(
      //     new DailyRotateFile({
      //         filename: `${logDir}/security-%DATE%.log`,
      //         datePattern: 'YYYY-MM-DD',
      //         maxSize: '100m',
      //         maxFiles: '365d',
      //         level: 'warn',
      //         format: winston.format.combine(
      //             winston.format.timestamp(),
      //             winston.format.json(),
      //             winston.format((info) => {
      //                 return info.category === 'security' ? info : false;
      //             })()
      //         ),
      //     })
      // );
      // Audit logs
      // transports.push(
      //     new DailyRotateFile({
      //         filename: `${logDir}/audit-%DATE%.log`,
      //         datePattern: 'YYYY-MM-DD',
      //         maxSize: '100m',
      //         maxFiles: '2555d', // 7 years retention for audit logs
      //         level: 'info',
      //         format: winston.format.combine(
      //             winston.format.timestamp(),
      //             winston.format.json(),
      //             winston.format((info) => {
      //                 return info.category === 'audit' ? info : false;
      //             })()
      //         ),
      //     })
      // );
    }

    return winston.createLogger({
      level: logLevel,
      format: winston.format.combine(...formats),
      defaultMeta: {
        service: this.serviceName,
        version: this.version,
        environment: this.environment,
        hostname: process.env.HOSTNAME || 'unknown',
        pid: process.pid,
      },
      transports,
      exceptionHandlers: [new winston.transports.File({ filename: `${logDir}/exceptions.log` })],
      rejectionHandlers: [new winston.transports.File({ filename: `${logDir}/rejections.log` })],
    });
  }

  // Standard logging methods
  log(message: any, context?: LogContext) {
    this.info(message, context);
  }

  error(message: any, trace?: string, context?: LogContext) {
    this.logger.error({
      message: this.formatMessage(message),
      stack: trace,
      category: 'application',
      ...this.formatContext(context),
    });
  }

  warn(message: any, context?: LogContext) {
    this.logger.warn({
      message: this.formatMessage(message),
      category: 'application',
      ...this.formatContext(context),
    });
  }

  debug(message: any, context?: LogContext) {
    this.logger.debug({
      message: this.formatMessage(message),
      category: 'application',
      ...this.formatContext(context),
    });
  }

  verbose(message: any, context?: LogContext) {
    this.logger.verbose({
      message: this.formatMessage(message),
      category: 'application',
      ...this.formatContext(context),
    });
  }

  info(message: any, context?: LogContext) {
    this.logger.info({
      message: this.formatMessage(message),
      category: 'application',
      ...this.formatContext(context),
    });
  }

  // Specialized logging methods
  logSecurity(message: string, context: SecurityLogContext) {
    const logLevel = this.getSecurityLogLevel(context.severity);

    this.logger.log(logLevel, {
      message,
      category: 'security',
      eventType: context.eventType,
      severity: context.severity,
      source: context.source,
      target: context.target,
      action: context.action,
      result: context.result,
      ...this.formatContext(context),
    });

    // Alert on critical security events
    if (context.severity === 'critical') {
      this.alertCriticalSecurity(message, context);
    }
  }

  logBusiness(message: string, context: BusinessLogContext) {
    this.logger.info({
      message,
      category: 'business',
      eventType: context.eventType,
      businessMetrics: context.businessMetrics,
      userTier: context.userTier,
      platform: context.platform,
      ...this.formatContext(context),
    });
  }

  logPerformance(message: string, context: PerformanceLogContext) {
    const logLevel = context.duration > 5000 ? 'warn' : 'info';

    this.logger.log(logLevel, {
      message,
      category: 'performance',
      operation: context.operation,
      duration: context.duration,
      resourceUsage: context.resourceUsage,
      cacheHit: context.cacheHit,
      queryCount: context.queryCount,
      ...this.formatContext(context),
    });
  }

  logAudit(
    message: string,
    context: LogContext & {
      action: string;
      resource: string;
      result: 'success' | 'failure';
    },
  ) {
    this.logger.info({
      message,
      category: 'audit',
      action: context.action,
      resource: context.resource,
      result: context.result,
      ...this.formatContext(context),
    });
  }

  logHTTPRequest(req: any, res: any, duration: number) {
    const context: LogContext = {
      requestId: req.id,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
    };

    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

    this.logger.log(logLevel, {
      message,
      category: 'http',
      ...this.formatContext(context),
    });
  }

  logDatabaseQuery(query: string, duration: number, context?: LogContext) {
    this.logPerformance('Database query executed', {
      operation: 'database_query',
      duration,
      metadata: { query: this.sanitizeQuery(query) },
      ...context,
    });
  }

  logCacheOperation(
    operation: 'get' | 'set' | 'delete',
    key: string,
    hit?: boolean,
    duration?: number,
    context?: LogContext,
  ) {
    this.logPerformance(`Cache ${operation} operation`, {
      operation: `cache_${operation}`,
      duration: duration || 0,
      cacheHit: hit,
      metadata: { key: this.sanitizeKey(key) },
      ...context,
    });
  }

  logQueueJob(
    jobType: string,
    status: 'started' | 'completed' | 'failed',
    duration?: number,
    context?: LogContext,
  ) {
    const message = `Queue job ${jobType} ${status}`;
    const logLevel = status === 'failed' ? 'error' : 'info';

    this.logger.log(logLevel, {
      message,
      category: 'queue',
      jobType,
      status,
      duration,
      ...this.formatContext(context),
    });
  }

  logExternalAPICall(
    service: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    context?: LogContext,
  ) {
    const message = `External API call to ${service}${endpoint}`;
    const logLevel = statusCode >= 400 ? 'warn' : 'info';

    this.logger.log(logLevel, {
      message,
      category: 'external_api',
      service,
      endpoint,
      statusCode,
      duration,
      ...this.formatContext(context),
    });
  }

  // Structured search and aggregation
  async searchLogs(query: {
    category?: string;
    level?: LogLevel;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    requestId?: string;
    limit?: number;
  }): Promise<any[]> {
    // This would integrate with a log aggregation service like ELK stack
    // For now, return empty array as placeholder
    return [];
  }

  async getLogMetrics(timeRange: { start: Date; end: Date }): Promise<{
    totalLogs: number;
    errorRate: number;
    avgResponseTime: number;
    topErrors: Array<{ message: string; count: number }>;
    securityEvents: number;
  }> {
    // This would integrate with a log aggregation service
    // For now, return placeholder data
    return {
      totalLogs: 0,
      errorRate: 0,
      avgResponseTime: 0,
      topErrors: [],
      securityEvents: 0,
    };
  }

  // Alert methods
  private alertCriticalSecurity(message: string, context: SecurityLogContext) {
    // This would integrate with alerting systems like PagerDuty, Slack, etc.
    console.error(`🚨 CRITICAL SECURITY ALERT: ${message}`, context);
  }

  // Utility methods
  private formatMessage(message: any): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    return JSON.stringify(message);
  }

  private formatContext(context?: LogContext): Record<string, any> {
    if (!context) return {};

    const formatted: Record<string, any> = {};

    // Copy all context properties except error
    Object.keys(context).forEach(key => {
      if (key !== 'error') {
        formatted[key] = context[key as keyof LogContext];
      }
    });

    // Handle error separately
    if (context.error) {
      formatted.error = {
        name: context.error.name,
        message: context.error instanceof Error ? context.error.message : String(context.error),
        stack: context.error.stack,
      };
    }

    return formatted;
  }

  private getSecurityLogLevel(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
      default:
        return 'debug';
    }
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from SQL queries
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/api_key\s*=\s*'[^']*'/gi, "api_key='***'");
  }

  private sanitizeKey(key: string): string {
    // Remove sensitive data from cache keys
    if (key.includes('token') || key.includes('password') || key.includes('secret')) {
      return key.replace(/[a-zA-Z0-9+/=]{20,}/g, '***');
    }
    return key;
  }

  // Graceful shutdown
  async close(): Promise<void> {
    return new Promise(resolve => {
      this.logger.end(() => {
        resolve();
      });
    });
  }
}
