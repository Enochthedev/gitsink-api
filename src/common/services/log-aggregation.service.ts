import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingService } from './logging.service';

export interface LogQuery {
  category?: 'application' | 'security' | 'business' | 'performance' | 'http' | 'audit';
  level?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  requestId?: string;
  endpoint?: string;
  eventType?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  category: string;
  service: string;
  version: string;
  environment: string;
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
  metadata?: Record<string, any>;
}

export interface LogMetrics {
  totalLogs: number;
  errorRate: number;
  avgResponseTime: number;
  requestsPerMinute: number;
  topEndpoints: Array<{ endpoint: string; count: number; avgDuration: number }>;
  topErrors: Array<{ message: string; count: number; lastOccurrence: Date }>;
  securityEvents: number;
  userActivity: Array<{
    userId: string;
    requestCount: number;
    lastActivity: Date;
  }>;
  performanceMetrics: {
    slowestEndpoints: Array<{ endpoint: string; avgDuration: number }>;
    databaseQueries: { total: number; avgDuration: number };
    cacheHitRate: number;
    queueMetrics: {
      processed: number;
      failed: number;
      avgProcessingTime: number;
    };
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: {
    category?: string;
    level?: string;
    eventType?: string;
    severity?: string;
    threshold?: number;
    timeWindow?: number; // minutes
  };
  actions: Array<{
    type: 'email' | 'webhook' | 'slack';
    target: string;
    template?: string;
  }>;
  enabled: boolean;
  lastTriggered?: Date;
}

@Injectable()
export class LogAggregationService {
  private readonly logger = new Logger(LogAggregationService.name);
  private alertRules: Map<string, AlertRule> = new Map();
  private logBuffer: LogEntry[] = [];
  private readonly bufferSize: number;
  private readonly flushInterval: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.bufferSize = this.configService.get('LOG_BUFFER_SIZE', 1000);
    this.flushInterval = this.configService.get('LOG_FLUSH_INTERVAL', 30000); // 30 seconds

    this.initializeDefaultAlertRules();
    this.startLogProcessing();
  }

  // Log search and retrieval
  async searchLogs(query: LogQuery): Promise<{ logs: LogEntry[]; total: number }> {
    try {
      // In a real implementation, this would query a log aggregation system like Elasticsearch
      // For now, we'll return filtered results from the buffer
      let filteredLogs = this.logBuffer;

      if (query.category) {
        filteredLogs = filteredLogs.filter(log => log.category === query.category);
      }

      if (query.level) {
        filteredLogs = filteredLogs.filter(log => log.level === query.level);
      }

      if (query.startDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= query.startDate!);
      }

      if (query.endDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= query.endDate!);
      }

      if (query.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === query.userId);
      }

      if (query.requestId) {
        filteredLogs = filteredLogs.filter(log => log.requestId === query.requestId);
      }

      if (query.endpoint) {
        filteredLogs = filteredLogs.filter(log => log.endpoint?.includes(query.endpoint!));
      }

      if (query.search) {
        const searchTerm = query.search.toLowerCase();
        filteredLogs = filteredLogs.filter(
          log =>
            log.message.toLowerCase().includes(searchTerm) ||
            JSON.stringify(log.metadata || {})
              .toLowerCase()
              .includes(searchTerm),
        );
      }

      // Sort by timestamp (newest first)
      filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const total = filteredLogs.length;
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      const logs = filteredLogs.slice(offset, offset + limit);

      return { logs, total };
    } catch (error) {
      this.logger.error('Failed to search logs', error);
      return { logs: [], total: 0 };
    }
  }

  // Log metrics and analytics
  async getLogMetrics(timeRange: { start: Date; end: Date }): Promise<LogMetrics> {
    try {
      const logs = this.logBuffer.filter(
        log => log.timestamp >= timeRange.start && log.timestamp <= timeRange.end,
      );

      const totalLogs = logs.length;
      const errorLogs = logs.filter(log => log.level === 'error').length;
      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0;

      const httpLogs = logs.filter(log => log.category === 'http' && log.duration);
      const avgResponseTime =
        httpLogs.length > 0
          ? httpLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / httpLogs.length
          : 0;

      const timeRangeMinutes = (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60);
      const requestsPerMinute = timeRangeMinutes > 0 ? totalLogs / timeRangeMinutes : 0;

      // Top endpoints
      const endpointCounts = new Map<string, { count: number; totalDuration: number }>();
      httpLogs.forEach(log => {
        if (log.endpoint) {
          const current = endpointCounts.get(log.endpoint) || {
            count: 0,
            totalDuration: 0,
          };
          endpointCounts.set(log.endpoint, {
            count: current.count + 1,
            totalDuration: current.totalDuration + (log.duration || 0),
          });
        }
      });

      const topEndpoints = Array.from(endpointCounts.entries())
        .map(([endpoint, data]) => ({
          endpoint,
          count: data.count,
          avgDuration: data.totalDuration / data.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top errors
      const errorCounts = new Map<string, { count: number; lastOccurrence: Date }>();
      logs
        .filter(log => log.level === 'error')
        .forEach(log => {
          const errorMessage = log.error?.message || log.message;
          const current = errorCounts.get(errorMessage) || {
            count: 0,
            lastOccurrence: new Date(0),
          };
          errorCounts.set(errorMessage, {
            count: current.count + 1,
            lastOccurrence:
              log.timestamp > current.lastOccurrence ? log.timestamp : current.lastOccurrence,
          });
        });

      const topErrors = Array.from(errorCounts.entries())
        .map(([message, data]) => ({
          message,
          count: data.count,
          lastOccurrence: data.lastOccurrence,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const securityEvents = logs.filter(log => log.category === 'security').length;

      // User activity
      const userActivity = new Map<string, { requestCount: number; lastActivity: Date }>();
      logs
        .filter(log => log.userId)
        .forEach(log => {
          const current = userActivity.get(log.userId!) || {
            requestCount: 0,
            lastActivity: new Date(0),
          };
          userActivity.set(log.userId!, {
            requestCount: current.requestCount + 1,
            lastActivity:
              log.timestamp > current.lastActivity ? log.timestamp : current.lastActivity,
          });
        });

      const topUsers = Array.from(userActivity.entries())
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.requestCount - a.requestCount)
        .slice(0, 20);

      // Performance metrics
      const performanceLogs = logs.filter(log => log.category === 'performance');
      const dbQueries = performanceLogs.filter(log =>
        log.metadata?.operation?.includes('database'),
      );
      const cacheOps = performanceLogs.filter(log => log.metadata?.operation?.includes('cache'));
      const queueJobs = logs.filter(log => log.category === 'queue');

      const slowestEndpoints = Array.from(endpointCounts.entries())
        .map(([endpoint, data]) => ({
          endpoint,
          avgDuration: data.totalDuration / data.count,
        }))
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 10);

      const cacheHits = cacheOps.filter(log => log.metadata?.cacheHit === true).length;
      const cacheHitRate = cacheOps.length > 0 ? (cacheHits / cacheOps.length) * 100 : 0;

      const queueProcessed = queueJobs.filter(log => log.metadata?.status === 'completed').length;
      const queueFailed = queueJobs.filter(log => log.metadata?.status === 'failed').length;
      const avgQueueProcessingTime =
        queueJobs.length > 0
          ? queueJobs.reduce((sum, log) => sum + (log.duration || 0), 0) / queueJobs.length
          : 0;

      return {
        totalLogs,
        errorRate,
        avgResponseTime,
        requestsPerMinute,
        topEndpoints,
        topErrors,
        securityEvents,
        userActivity: topUsers,
        performanceMetrics: {
          slowestEndpoints,
          databaseQueries: {
            total: dbQueries.length,
            avgDuration:
              dbQueries.length > 0
                ? dbQueries.reduce((sum, log) => sum + (log.duration || 0), 0) / dbQueries.length
                : 0,
          },
          cacheHitRate,
          queueMetrics: {
            processed: queueProcessed,
            failed: queueFailed,
            avgProcessingTime: avgQueueProcessingTime,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to get log metrics', error);
      throw error;
    }
  }

  // Alert management
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.logger.log(`Alert rule added: ${rule.name}`);
  }

  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    this.logger.log(`Alert rule removed: ${ruleId}`);
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  // Log retention and archival
  async archiveLogs(olderThan: Date): Promise<number> {
    try {
      const logsToArchive = this.logBuffer.filter(log => log.timestamp < olderThan);

      // In a real implementation, this would move logs to long-term storage
      // For now, we'll just remove them from the buffer
      this.logBuffer = this.logBuffer.filter(log => log.timestamp >= olderThan);

      this.logger.log(
        `Archived ${logsToArchive.length} log entries older than ${olderThan.toISOString()}`,
      );
      return logsToArchive.length;
    } catch (error) {
      this.logger.error('Failed to archive logs', error);
      return 0;
    }
  }

  // Export logs
  async exportLogs(query: LogQuery, format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const { logs } = await this.searchLogs(query);

      if (format === 'csv') {
        return this.convertLogsToCSV(logs);
      }

      return JSON.stringify(logs, null, 2);
    } catch (error) {
      this.logger.error('Failed to export logs', error);
      throw error;
    }
  }

  // Private methods
  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds 5% in 5 minutes',
        condition: {
          level: 'error',
          threshold: 5,
          timeWindow: 5,
        },
        actions: [
          {
            type: 'email',
            target: 'admin@gitsink.com',
            template: 'high-error-rate',
          },
        ],
        enabled: true,
      },
      {
        id: 'critical-security-event',
        name: 'Critical Security Event',
        description: 'Alert on critical security events',
        condition: {
          category: 'security',
          severity: 'critical',
          threshold: 1,
          timeWindow: 1,
        },
        actions: [
          {
            type: 'email',
            target: 'security@gitsink.com',
            template: 'security-alert',
          },
        ],
        enabled: true,
      },
      {
        id: 'slow-response-time',
        name: 'Slow Response Time',
        description: 'Alert when average response time exceeds 2 seconds',
        condition: {
          category: 'http',
          threshold: 2000,
          timeWindow: 10,
        },
        actions: [
          {
            type: 'email',
            target: 'ops@gitsink.com',
            template: 'performance-alert',
          },
        ],
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => this.addAlertRule(rule));
  }

  private startLogProcessing(): void {
    // Process logs periodically
    setInterval(() => {
      this.processLogBuffer();
      this.checkAlertRules();
    }, this.flushInterval);

    // Archive old logs daily
    setInterval(
      () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        this.archiveLogs(thirtyDaysAgo);
      },
      24 * 60 * 60 * 1000,
    ); // Daily
  }

  private processLogBuffer(): void {
    // In a real implementation, this would send logs to an aggregation system
    // For now, we'll just maintain the buffer size
    if (this.logBuffer.length > this.bufferSize) {
      const excess = this.logBuffer.length - this.bufferSize;
      this.logBuffer.splice(0, excess);
    }
  }

  private async checkAlertRules(): Promise<void> {
    const now = new Date();

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldTrigger = await this.evaluateAlertRule(rule, now);
        if (shouldTrigger) {
          await this.triggerAlert(rule);
          rule.lastTriggered = now;
        }
      } catch (error) {
        this.logger.error(`Failed to evaluate alert rule ${rule.id}`, error);
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule, now: Date): Promise<boolean> {
    const timeWindow = rule.condition.timeWindow || 5; // Default 5 minutes
    const startTime = new Date(now.getTime() - timeWindow * 60 * 1000);

    const query: LogQuery = {
      startDate: startTime,
      endDate: now,
      category: rule.condition.category as any,
      level: rule.condition.level as any,
    };

    const { logs } = await this.searchLogs(query);

    if (rule.condition.threshold) {
      return logs.length >= rule.condition.threshold;
    }

    return logs.length > 0;
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    this.logger.warn(`Alert triggered: ${rule.name}`);

    for (const action of rule.actions) {
      try {
        await this.executeAlertAction(action, rule);
      } catch (error) {
        this.logger.error(`Failed to execute alert action ${action.type}`, error);
      }
    }
  }

  private async executeAlertAction(action: any, rule: AlertRule): Promise<void> {
    switch (action.type) {
      case 'email':
        // In a real implementation, this would send an email
        this.logger.warn(`EMAIL ALERT: ${rule.name} to ${action.target}`);
        break;
      case 'webhook':
        // In a real implementation, this would call a webhook
        this.logger.warn(`WEBHOOK ALERT: ${rule.name} to ${action.target}`);
        break;
      case 'slack':
        // In a real implementation, this would send a Slack message
        this.logger.warn(`SLACK ALERT: ${rule.name} to ${action.target}`);
        break;
    }
  }

  private convertLogsToCSV(logs: LogEntry[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'timestamp',
      'level',
      'message',
      'category',
      'service',
      'requestId',
      'userId',
      'endpoint',
      'method',
      'statusCode',
      'duration',
      'ip',
    ];

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = headers.map(header => {
        const value = log[header as keyof LogEntry];
        if (value === undefined || value === null) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Add log entry to buffer (called by LoggingService)
  addLogEntry(entry: LogEntry): void {
    this.logBuffer.push(entry);
  }
}
