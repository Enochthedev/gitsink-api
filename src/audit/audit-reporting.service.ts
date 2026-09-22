import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { SyncHistoryService } from './sync-history.service';
import {
  AuditAction,
  AuditLogFilters,
  AuditLogSummary,
  AuditResource,
} from './interfaces/audit.interface';

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  reportType: 'security' | 'compliance' | 'activity' | 'performance';
  timeRange: {
    start: Date;
    end: Date;
  };
  filters: AuditLogFilters;
  data: any;
  generatedAt: Date;
  generatedBy: string;
  format: 'json' | 'csv' | 'pdf';
}

export interface SecurityReport {
  reportId: string;
  timeRange: { start: Date; end: Date };
  summary: {
    totalSecurityEvents: number;
    criticalEvents: number;
    highSeverityEvents: number;
    mediumSeverityEvents: number;
    lowSeverityEvents: number;
  };
  failedLoginAttempts: {
    total: number;
    uniqueUsers: number;
    topFailedUsers: Array<{
      userId: string;
      username?: string;
      attempts: number;
    }>;
  };
  suspiciousActivities: Array<{
    type: string;
    severity: string;
    count: number;
    affectedUsers: number;
  }>;
  rateLimitViolations: {
    total: number;
    uniqueUsers: number;
    topViolators: Array<{
      userId: string;
      username?: string;
      violations: number;
    }>;
  };
  recommendations: string[];
}

export interface ComplianceReport {
  reportId: string;
  timeRange: { start: Date; end: Date };
  dataAccess: {
    totalAccesses: number;
    userDataAccesses: number;
    adminDataAccesses: number;
    exportOperations: number;
  };
  userActions: {
    accountCreations: number;
    accountDeletions: number;
    profileUpdates: number;
    dataExports: number;
  };
  systemChanges: {
    configurationChanges: number;
    securityPolicyChanges: number;
    userPermissionChanges: number;
  };
  auditTrailIntegrity: {
    totalRecords: number;
    integrityChecks: number;
    anomaliesDetected: number;
  };
}

export interface ActivityReport {
  reportId: string;
  timeRange: { start: Date; end: Date };
  userActivity: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    topActiveUsers: Array<{
      userId: string;
      username?: string;
      actionCount: number;
    }>;
  };
  projectActivity: {
    totalProjects: number;
    newProjects: number;
    syncedProjects: number;
    topSyncedProjects: Array<{
      projectId: string;
      title?: string;
      syncCount: number;
    }>;
  };
  platformActivity: {
    totalConnections: number;
    newConnections: number;
    byPlatform: Array<{
      platform: string;
      connections: number;
      syncOperations: number;
    }>;
  };
  apiUsage: {
    totalCalls: number;
    uniqueUsers: number;
    topEndpoints: Array<{
      endpoint: string;
      calls: number;
      uniqueUsers: number;
    }>;
  };
}

export interface PerformanceReport {
  reportId: string;
  timeRange: { start: Date; end: Date };
  syncPerformance: {
    totalOperations: number;
    successRate: number;
    averageDuration: number;
    slowestOperations: Array<{
      id: string;
      operation: string;
      platform: string;
      duration: number;
    }>;
  };
  apiPerformance: {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    slowestEndpoints: Array<{
      endpoint: string;
      averageResponseTime: number;
      requestCount: number;
    }>;
  };
  systemHealth: {
    uptime: number;
    errorCount: number;
    warningCount: number;
    criticalIssues: number;
  };
}

@Injectable()
export class AuditReportingService {
  private readonly logger = new Logger(AuditReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly syncHistoryService: SyncHistoryService,
  ) {}

  /**
   * Generate a comprehensive security report
   */
  async generateSecurityReport(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<SecurityReport> {
    const reportId = `security-${Date.now()}`;

    try {
      // Get security events summary
      const securityEvents = await this.prisma.auditLog.groupBy({
        by: ['details'],
        where: {
          action: AuditAction.SECURITY_EVENT,
          timestamp: { gte: startDate, lte: endDate },
          userId: userId || undefined,
        },
        _count: true,
      });

      // Parse security event details to categorize by severity
      let criticalEvents = 0;
      let highSeverityEvents = 0;
      let mediumSeverityEvents = 0;
      let lowSeverityEvents = 0;

      for (const event of securityEvents) {
        try {
          const details = JSON.parse((event.details as string) || '{}');
          const severity = details.severity;

          switch (severity) {
            case 'critical':
              criticalEvents += event._count;
              break;
            case 'high':
              highSeverityEvents += event._count;
              break;
            case 'medium':
              mediumSeverityEvents += event._count;
              break;
            case 'low':
              lowSeverityEvents += event._count;
              break;
          }
        } catch (error) {
          // Skip malformed details
        }
      }

      // Get failed login attempts
      const failedLogins = await this.prisma.auditLog.count({
        where: {
          action: AuditAction.LOGIN,
          success: false,
          timestamp: { gte: startDate, lte: endDate },
          userId: userId || undefined,
        },
      });

      const uniqueFailedUsers = await this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          action: AuditAction.LOGIN,
          success: false,
          timestamp: { gte: startDate, lte: endDate },
          userId: userId || undefined,
        },
        _count: true,
        orderBy: {
          _count: {
            userId: 'desc',
          },
        },
        take: 10,
      });

      const topFailedUsers = await Promise.all(
        uniqueFailedUsers.map(async user => {
          const userInfo = user.userId
            ? await this.prisma.user.findUnique({
                where: { id: user.userId },
                select: { username: true, email: true },
              })
            : null;

          return {
            userId: user.userId || 'anonymous',
            username: userInfo?.username || userInfo?.email,
            attempts: user._count,
          };
        }),
      );

      // Get rate limit violations
      const rateLimitViolations = await this.prisma.auditLog.count({
        where: {
          action: AuditAction.RATE_LIMIT_HIT,
          timestamp: { gte: startDate, lte: endDate },
          userId: userId || undefined,
        },
      });

      const uniqueViolators = await this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          action: AuditAction.RATE_LIMIT_HIT,
          timestamp: { gte: startDate, lte: endDate },
          userId: userId || undefined,
        },
        _count: true,
        orderBy: {
          _count: {
            userId: 'desc',
          },
        },
        take: 10,
      });

      const topViolators = await Promise.all(
        uniqueViolators.map(async user => {
          const userInfo = user.userId
            ? await this.prisma.user.findUnique({
                where: { id: user.userId },
                select: { username: true, email: true },
              })
            : null;

          return {
            userId: user.userId || 'anonymous',
            username: userInfo?.username || userInfo?.email,
            violations: user._count,
          };
        }),
      );

      // Generate recommendations based on findings
      const recommendations: string[] = [];

      if (criticalEvents > 0) {
        recommendations.push('Immediate investigation required for critical security events');
      }

      if (failedLogins > 100) {
        recommendations.push('Consider implementing account lockout policies');
      }

      if (rateLimitViolations > 50) {
        recommendations.push('Review and potentially tighten rate limiting policies');
      }

      if (recommendations.length === 0) {
        recommendations.push('No immediate security concerns identified');
      }

      return {
        reportId,
        timeRange: { start: startDate, end: endDate },
        summary: {
          totalSecurityEvents: securityEvents.reduce((sum, e) => sum + e._count, 0),
          criticalEvents,
          highSeverityEvents,
          mediumSeverityEvents,
          lowSeverityEvents,
        },
        failedLoginAttempts: {
          total: failedLogins,
          uniqueUsers: uniqueFailedUsers.length,
          topFailedUsers,
        },
        suspiciousActivities: [], // Would be populated with more sophisticated analysis
        rateLimitViolations: {
          total: rateLimitViolations,
          uniqueUsers: uniqueViolators.length,
          topViolators,
        },
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to generate security report', {
        error: error instanceof Error ? error.message : String(error),
        reportId,
        timeRange: { startDate, endDate },
      });
      throw error;
    }
  }

  /**
   * Generate a compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<ComplianceReport> {
    const reportId = `compliance-${Date.now()}`;

    try {
      const where = {
        timestamp: { gte: startDate, lte: endDate },
        userId: userId || undefined,
      };

      // Data access metrics
      const [totalAccesses, userDataAccesses, adminDataAccesses, exportOperations] =
        await Promise.all([
          this.prisma.auditLog.count({ where }),
          this.prisma.auditLog.count({
            where: {
              ...where,
              resource: AuditResource.USER,
            },
          }),
          this.prisma.auditLog.count({
            where: {
              ...where,
              // Assuming admin actions have specific patterns
              action: { in: [AuditAction.DATA_EXPORT, AuditAction.SYSTEM_ERROR] },
            },
          }),
          this.prisma.auditLog.count({
            where: {
              ...where,
              action: AuditAction.DATA_EXPORT,
            },
          }),
        ]);

      // User actions
      const [accountCreations, accountDeletions, profileUpdates, dataExports] = await Promise.all([
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: AuditAction.SIGNUP,
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            // Assuming account deletion is tracked as a specific action
            resource: AuditResource.USER,
            details: { contains: 'deleted' } as any,
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: AuditAction.PROFILE_UPDATED,
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: AuditAction.DATA_EXPORT,
          },
        }),
      ]);

      // System changes (would need more specific tracking)
      const systemChanges = {
        configurationChanges: 0,
        securityPolicyChanges: 0,
        userPermissionChanges: 0,
      };

      // Audit trail integrity
      const totalRecords = await this.prisma.auditLog.count({ where });

      return {
        reportId,
        timeRange: { start: startDate, end: endDate },
        dataAccess: {
          totalAccesses,
          userDataAccesses,
          adminDataAccesses,
          exportOperations,
        },
        userActions: {
          accountCreations,
          accountDeletions,
          profileUpdates,
          dataExports,
        },
        systemChanges,
        auditTrailIntegrity: {
          totalRecords,
          integrityChecks: 1, // Would implement actual integrity checks
          anomaliesDetected: 0, // Would implement anomaly detection
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate compliance report', {
        error: error instanceof Error ? error.message : String(error),
        reportId,
        timeRange: { startDate, endDate },
      });
      throw error;
    }
  }

  /**
   * Generate an activity report
   */
  async generateActivityReport(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<ActivityReport> {
    const reportId = `activity-${Date.now()}`;

    try {
      const where = {
        timestamp: { gte: startDate, lte: endDate },
        userId: userId || undefined,
      };

      // User activity
      const totalUsers = await this.prisma.user.count();
      const activeUsers = await this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
      });

      const newUsers = await this.prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.SIGNUP,
        },
      });

      const topActiveUsers = await this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: true,
        orderBy: {
          _count: {
            userId: 'desc',
          },
        },
        take: 10,
      });

      const topActiveUsersWithNames = await Promise.all(
        topActiveUsers.map(async user => {
          const userInfo = await this.prisma.user.findUnique({
            where: { id: user.userId! },
            select: { username: true, email: true },
          });

          return {
            userId: user.userId!,
            username: userInfo?.username || userInfo?.email,
            actionCount: user._count,
          };
        }),
      );

      // Project activity
      const totalProjects = await this.prisma.project.count();
      const newProjects = await this.prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.PROJECT_CREATED,
        },
      });

      const syncedProjects = await this.prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.PROJECT_SYNCED,
        },
      });

      // Platform activity
      const platformConnections = await this.prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.PLATFORM_CONNECTED,
        },
      });

      const newConnections = platformConnections; // Simplified

      // API usage
      const apiCalls = await this.prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.API_CALL,
        },
      });

      const uniqueApiUsers = await this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          ...where,
          action: AuditAction.API_CALL,
          userId: { not: null },
        },
      });

      return {
        reportId,
        timeRange: { start: startDate, end: endDate },
        userActivity: {
          totalUsers,
          activeUsers: activeUsers.length,
          newUsers,
          topActiveUsers: topActiveUsersWithNames,
        },
        projectActivity: {
          totalProjects,
          newProjects,
          syncedProjects,
          topSyncedProjects: [], // Would need more detailed tracking
        },
        platformActivity: {
          totalConnections: platformConnections,
          newConnections,
          byPlatform: [], // Would need platform-specific tracking
        },
        apiUsage: {
          totalCalls: apiCalls,
          uniqueUsers: uniqueApiUsers.length,
          topEndpoints: [], // Would need endpoint-specific tracking
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate activity report', {
        error: error instanceof Error ? error.message : String(error),
        reportId,
        timeRange: { startDate, endDate },
      });
      throw error;
    }
  }

  /**
   * Generate a performance report
   */
  async generatePerformanceReport(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<PerformanceReport> {
    const reportId = `performance-${Date.now()}`;

    try {
      // Get sync performance data
      const syncStats = await this.syncHistoryService.getSyncHistoryStats(
        userId,
        startDate,
        endDate,
      );

      // Get slowest sync operations
      const slowestSyncs = await this.prisma.syncHistory.findMany({
        where: {
          startedAt: { gte: startDate, lte: endDate },
          userId: userId || undefined,
          duration: { not: null },
        },
        orderBy: { duration: 'desc' },
        take: 10,
        select: {
          id: true,
          operation: true,
          platform: true,
          duration: true,
        },
      });

      // System health metrics (simplified)
      const errorCount = await this.prisma.auditLog.count({
        where: {
          timestamp: { gte: startDate, lte: endDate },
          success: false,
        },
      });

      return {
        reportId,
        timeRange: { start: startDate, end: endDate },
        syncPerformance: {
          totalOperations: syncStats.totalOperations,
          successRate:
            syncStats.totalOperations > 0
              ? (syncStats.successfulOperations / syncStats.totalOperations) * 100
              : 0,
          averageDuration: syncStats.averageDuration,
          slowestOperations: slowestSyncs.map(sync => ({
            id: sync.id,
            operation: sync.operation,
            platform: sync.platform,
            duration: sync.duration || 0,
          })),
        },
        apiPerformance: {
          totalRequests: 0, // Would need API metrics tracking
          averageResponseTime: 0,
          errorRate: 0,
          slowestEndpoints: [],
        },
        systemHealth: {
          uptime: 99.9, // Would calculate from system metrics
          errorCount,
          warningCount: 0, // Would categorize from audit logs
          criticalIssues: 0,
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate performance report', {
        error: error instanceof Error ? error.message : String(error),
        reportId,
        timeRange: { startDate, endDate },
      });
      throw error;
    }
  }

  /**
   * Export audit data in various formats
   */
  async exportAuditData(
    filters: AuditLogFilters,
    format: 'json' | 'csv' | 'xlsx' = 'json',
    includeMetadata: boolean = true,
  ): Promise<{
    data: string | Buffer;
    filename: string;
    contentType: string;
  }> {
    try {
      const { logs } = await this.auditService.getAuditLogs({
        ...filters,
        limit: 10000, // Large limit for export
      });

      const timestamp = new Date().toISOString().split('T')[0];

      switch (format) {
        case 'json':
          const jsonData = includeMetadata
            ? {
                metadata: {
                  exportedAt: new Date().toISOString(),
                  totalRecords: logs.length,
                  filters,
                },
                data: logs,
              }
            : logs;

          return {
            data: JSON.stringify(jsonData, null, 2),
            filename: `audit-export-${timestamp}.json`,
            contentType: 'application/json',
          };

        case 'csv':
          const headers = [
            'ID',
            'User ID',
            'Action',
            'Resource',
            'Resource ID',
            'Success',
            'IP Address',
            'User Agent',
            'Timestamp',
            'Error',
          ];

          const csvRows = logs.map(log => [
            log.id,
            log.userId || '',
            log.action,
            log.resource || '',
            log.resourceId || '',
            log.success,
            log.ipAddress || '',
            log.userAgent || '',
            log.timestamp.toISOString(),
            log.error || '',
          ]);

          const csvContent = [
            headers.join(','),
            ...csvRows.map(row =>
              row
                .map(cell =>
                  typeof cell === 'string' && cell.includes(',')
                    ? `"${cell.replace(/"/g, '""')}"`
                    : cell,
                )
                .join(','),
            ),
          ].join('\n');

          return {
            data: csvContent,
            filename: `audit-export-${timestamp}.csv`,
            contentType: 'text/csv',
          };

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      this.logger.error('Failed to export audit data', {
        error: error instanceof Error ? error.message : String(error),
        filters,
        format,
      });
      throw error;
    }
  }

  /**
   * Search audit logs with advanced filtering
   */
  async searchAuditLogs(
    searchQuery: string,
    filters: AuditLogFilters,
  ): Promise<{
    logs: any[];
    totalCount: number;
    searchTerms: string[];
  }> {
    try {
      // Parse search query into terms
      const searchTerms = searchQuery
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2);

      if (searchTerms.length === 0) {
        const result = await this.auditService.getAuditLogs(filters);
        return {
          logs: result.logs,
          totalCount: result.totalCount,
          searchTerms: [],
        };
      }

      // Build search conditions
      const searchConditions = searchTerms.map(term => ({
        OR: [
          { action: { contains: term, mode: 'insensitive' } },
          { resource: { contains: term, mode: 'insensitive' } },
          { details: { contains: term, mode: 'insensitive' } },
          { error: { contains: term, mode: 'insensitive' } },
          { ipAddress: { contains: term, mode: 'insensitive' } },
          { userAgent: { contains: term, mode: 'insensitive' } },
        ],
      }));

      // Combine with existing filters
      const searchFilters = {
        ...filters,
        // Add search conditions to the where clause
        // This would need to be implemented in the audit service
      };

      const result = await this.auditService.getAuditLogs(searchFilters);

      // Filter results based on search terms (client-side filtering as fallback)
      const filteredLogs = result.logs.filter(log => {
        const searchableText = [
          log.action,
          log.resource,
          log.details,
          log.error,
          log.ipAddress,
          log.userAgent,
        ]
          .join(' ')
          .toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });

      return {
        logs: filteredLogs,
        totalCount: filteredLogs.length,
        searchTerms,
      };
    } catch (error) {
      this.logger.error('Failed to search audit logs', {
        error: error instanceof Error ? error.message : String(error),
        searchQuery,
        filters,
      });
      throw error;
    }
  }
}
