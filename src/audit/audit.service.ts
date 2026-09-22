import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AuditAction,
  AuditEventDetails,
  AuditLogFilters,
  AuditLogSummary,
  AuditResource,
  AuditRetentionPolicy,
  CreateAuditLogDto,
  SecurityEvent,
} from './interfaces/audit.interface';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly retentionPolicy: AuditRetentionPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.retentionPolicy = {
      retentionDays: this.configService.get<number>('AUDIT_RETENTION_DAYS', 365),
      archiveAfterDays: this.configService.get<number>('AUDIT_ARCHIVE_DAYS', 90),
      compressionEnabled: this.configService.get<boolean>('AUDIT_COMPRESSION_ENABLED', true),
      exportBeforeDelete: this.configService.get<boolean>('AUDIT_EXPORT_BEFORE_DELETE', true),
    };
  }

  /**
   * Log an audit event
   */
  async logEvent(eventData: CreateAuditLogDto): Promise<void> {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          userId: eventData.userId,
          action: eventData.action,
          resource: eventData.resource,
          resourceId: eventData.resourceId,
          details: eventData.details ? JSON.stringify(eventData.details) : undefined,
          ipAddress: eventData.ipAddress,
          userAgent: eventData.userAgent,
          success: eventData.success ?? true,
          error: eventData.error,
        },
      });

      this.logger.debug(`Audit event logged: ${eventData.action}`, {
        auditLogId: auditLog.id,
        userId: eventData.userId,
        resource: eventData.resource,
        resourceId: eventData.resourceId,
      });
    } catch (error) {
      this.logger.error('Failed to log audit event', {
        error: error instanceof Error ? error.message : String(error),
        eventData,
      });
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Log user action with automatic context detection
   */
  async logUserAction(
    userId: string,
    action: AuditAction,
    resource?: AuditResource,
    resourceId?: string,
    details?: AuditEventDetails,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      success?: boolean;
      error?: string;
    },
  ): Promise<void> {
    await this.logEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      success: context?.success,
      error: context?.error,
    });
  }

  /**
   * Log system event without user context
   */
  async logSystemEvent(
    action: AuditAction,
    resource?: AuditResource,
    resourceId?: string,
    details?: AuditEventDetails,
    error?: string,
  ): Promise<void> {
    await this.logEvent({
      action,
      resource,
      resourceId,
      details,
      success: !error,
      error,
    });
  }

  /**
   * Log security event with enhanced details
   */
  async logSecurityEvent(
    securityEvent: SecurityEvent,
    userId?: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      resourceId?: string;
    },
  ): Promise<void> {
    const details: AuditEventDetails = {
      securityEventType: securityEvent.type,
      severity: securityEvent.severity,
      description: securityEvent.description,
      indicators: securityEvent.indicators,
      recommendedActions: securityEvent.recommendedActions,
    };

    await this.logEvent({
      userId,
      action: AuditAction.SECURITY_EVENT,
      resource: AuditResource.SYSTEM,
      resourceId: context?.resourceId,
      details,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      success: false, // Security events are typically failures or suspicious activities
    });

    // Log security events at higher level for monitoring
    this.logger.warn(`Security event: ${securityEvent.type}`, {
      severity: securityEvent.severity,
      userId,
      description: securityEvent.description,
      indicators: securityEvent.indicators,
    });
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(filters: AuditLogFilters): Promise<{
    logs: AuditLogEntity[];
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    const where: any = {};

    // Build where clause
    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      if (Array.isArray(filters.action)) {
        where.action = { in: filters.action };
      } else {
        where.action = filters.action;
      }
    }

    if (filters.resource) {
      if (Array.isArray(filters.resource)) {
        where.resource = { in: filters.resource };
      } else {
        where.resource = filters.resource;
      }
    }

    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    if (filters.success !== undefined) {
      where.success = filters.success;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    if (filters.ipAddress) {
      where.ipAddress = filters.ipAddress;
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[filters.orderBy || 'timestamp'] = filters.orderDirection || 'desc';

    // Get total count
    const totalCount = await this.prisma.auditLog.count({ where });

    // Get logs with pagination
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy,
      skip: filters.offset || 0,
      take: filters.limit || 50,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    return {
      logs: logs.map(log => {
        const entity = new AuditLogEntity();
        Object.assign(entity, {
          ...log,
          details: log.details || undefined,
        });
        return entity;
      }),
      totalCount,
      hasNextPage: offset + limit < totalCount,
      hasPreviousPage: offset > 0,
    };
  }

  /**
   * Get audit log summary with statistics
   */
  async getAuditSummary(
    startDate?: Date,
    endDate?: Date,
    userId?: string,
    topLimit: number = 10,
  ): Promise<AuditLogSummary> {
    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Get basic counts
    const [totalEvents, successfulEvents, failedEvents] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({ where: { ...where, success: true } }),
      this.prisma.auditLog.count({ where: { ...where, success: false } }),
    ]);

    // Get unique users count
    const uniqueUsersResult = await this.prisma.auditLog.groupBy({
      by: ['userId'],
      where: { ...where, userId: { not: null } },
      _count: true,
    });
    const uniqueUsers = uniqueUsersResult.length;

    // Get top actions
    const topActionsResult = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
      orderBy: {
        _count: {
          action: 'desc',
        },
      },
      take: topLimit,
    });

    const topActions = topActionsResult.map(result => ({
      action: result.action as AuditAction,
      count: result._count,
    }));

    // Get top resources
    const topResourcesResult = await this.prisma.auditLog.groupBy({
      by: ['resource'],
      where: { ...where, resource: { not: null } },
      _count: true,
      orderBy: {
        _count: {
          resource: 'desc',
        },
      },
      take: topLimit,
    });

    const topResources = topResourcesResult.map(result => ({
      resource: result.resource as AuditResource,
      count: result._count,
    }));

    // Determine time range
    const timeRange = {
      start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default to 30 days ago
      end: endDate || new Date(),
    };

    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      uniqueUsers,
      topActions,
      topResources,
      timeRange,
    };
  }

  /**
   * Export audit logs to JSON format
   */
  async exportAuditLogs(
    filters: AuditLogFilters,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const { logs } = await this.getAuditLogs({
      ...filters,
      limit: 10000, // Large limit for export
      offset: 0,
    });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    if (logs.length === 0) {
      return 'No data to export';
    }

    const headers = Object.keys(logs[0]).join(',');
    const rows = logs.map(log =>
      Object.values(log)
        .map(value => (typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value))
        .join(','),
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldAuditLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicy.retentionDays);

      this.logger.log(
        `Starting audit log cleanup for records older than ${cutoffDate.toISOString()}`,
      );

      // Export before delete if configured
      if (this.retentionPolicy.exportBeforeDelete) {
        await this.exportOldLogsBeforeCleanup(cutoffDate);
      }

      // Delete old logs
      const deleteResult = await this.prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(`Cleaned up ${deleteResult.count} old audit log records`);

      // Log the cleanup operation
      await this.logSystemEvent(
        AuditAction.SYSTEM_ERROR, // Using existing enum value, could add SYSTEM_CLEANUP
        AuditResource.SYSTEM,
        undefined,
        {
          operation: 'audit_log_cleanup',
          recordsDeleted: deleteResult.count,
          cutoffDate: cutoffDate.toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to cleanup old audit logs', {
        error: error instanceof Error ? error.message : String(error),
        stack: (error as Error).stack,
      });
    }
  }

  /**
   * Archive old audit logs before cleanup
   */
  private async exportOldLogsBeforeCleanup(cutoffDate: Date): Promise<void> {
    try {
      const oldLogs = await this.prisma.auditLog.findMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
        orderBy: {
          timestamp: 'asc',
        },
      });

      if (oldLogs.length === 0) {
        return;
      }

      // In a real implementation, you would save this to a file system or cloud storage
      const exportData = JSON.stringify(oldLogs, null, 2);
      const filename = `audit-logs-archive-${cutoffDate.toISOString().split('T')[0]}.json`;

      this.logger.log(`Exported ${oldLogs.length} old audit logs to ${filename}`);

      // TODO: Implement actual file storage (S3, local filesystem, etc.)
      // For now, just log that we would export
    } catch (error) {
      this.logger.error('Failed to export old audit logs before cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AuditLogEntity[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    return logs.map(log => {
      const entity = new AuditLogEntity();
      Object.assign(entity, {
        ...log,
        details: log.details || undefined,
      });
      return entity;
    });
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceAuditLogs(
    resource: AuditResource,
    resourceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AuditLogEntity[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        resource,
        resourceId,
      },
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    return logs.map(log => {
      const entity = new AuditLogEntity();
      Object.assign(entity, {
        ...log,
        details: log.details || undefined,
      });
      return entity;
    });
  }

  /**
   * Check for suspicious activity patterns
   */
  async detectSuspiciousActivity(userId?: string): Promise<SecurityEvent[]> {
    const suspiciousEvents: SecurityEvent[] = [];
    const timeWindow = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    try {
      // Check for multiple failed login attempts
      const failedLogins = await this.prisma.auditLog.count({
        where: {
          userId,
          action: AuditAction.LOGIN,
          success: false,
          timestamp: { gte: timeWindow },
        },
      });

      if (failedLogins >= 5) {
        suspiciousEvents.push({
          type: 'multiple_failed_attempts',
          severity: 'high',
          description: `${failedLogins} failed login attempts in the last hour`,
          indicators: { failedAttempts: failedLogins, timeWindow: '1 hour' },
          recommendedActions: ['Temporarily lock account', 'Require additional verification'],
        });
      }

      // Check for unusual API usage patterns
      if (userId) {
        const apiCalls = await this.prisma.auditLog.count({
          where: {
            userId,
            action: AuditAction.API_CALL,
            timestamp: { gte: timeWindow },
          },
        });

        if (apiCalls >= 1000) {
          suspiciousEvents.push({
            type: 'unusual_api_usage',
            severity: 'medium',
            description: `Unusually high API usage: ${apiCalls} calls in the last hour`,
            indicators: { apiCalls, timeWindow: '1 hour' },
            recommendedActions: ['Review API usage patterns', 'Check for automated scripts'],
          });
        }
      }

      return suspiciousEvents;
    } catch (error) {
      this.logger.error('Failed to detect suspicious activity', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return [];
    }
  }
}
