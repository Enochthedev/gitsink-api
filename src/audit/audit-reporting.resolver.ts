import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuditReportingService } from './audit-reporting.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  ActivityReportEntity,
  ComplianceReportEntity,
  ExportAuditDataArgs,
  ExportResult,
  GenerateReportArgs,
  PerformanceReportEntity,
  SearchAuditLogsArgs,
  SearchResult,
  SecurityReportEntity,
} from './dto/audit-reporting.dto';

@Resolver()
@UseGuards(EnhancedJwtGuard)
export class AuditReportingResolver {
  constructor(private readonly auditReportingService: AuditReportingService) {}

  @Query(() => SecurityReportEntity)
  async securityReport(
    @Args() args: GenerateReportArgs,
    @Context() context: any,
  ): Promise<SecurityReportEntity> {
    const user = context.req.user;

    // Only admins can generate system-wide reports
    if (!user.isAdmin && args.userId && args.userId !== user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = user.isAdmin ? args.userId : user.id;

    const report = await this.auditReportingService.generateSecurityReport(
      new Date(args.startDate),
      new Date(args.endDate),
      targetUserId,
    );

    return {
      reportId: report.reportId,
      generatedAt: new Date(),
      startDate: report.timeRange.start,
      endDate: report.timeRange.end,
      summary: {
        totalSecurityEvents: report.summary.totalSecurityEvents,
        criticalEvents: report.summary.criticalEvents,
        highSeverityEvents: report.summary.highSeverityEvents,
        mediumSeverityEvents: report.summary.mediumSeverityEvents,
        lowSeverityEvents: report.summary.lowSeverityEvents,
        totalComplianceViolations: 0,
        totalUserActions: 0,
        reportGeneratedAt: new Date(),
        reportPeriod: `${new Date(args.startDate).toISOString()} - ${new Date(args.endDate).toISOString()}`,
      },
      failedLoginAttempts: {
        total: report.failedLoginAttempts.total,
        uniqueUsers: report.failedLoginAttempts.uniqueUsers,
        topFailedUsers: report.failedLoginAttempts.topFailedUsers.map(user => ({
          userId: user.userId,
          username: user.username,
          attempts: user.attempts,
        })),
      },
      rateLimitViolations: {
        total: report.rateLimitViolations.total,
        uniqueUsers: report.rateLimitViolations.uniqueUsers,
        topViolators: report.rateLimitViolations.topViolators.map(violator => ({
          userId: violator.userId,
          username: violator.username,
          violations: violator.violations,
        })),
      },
      recommendations: report.recommendations,
    };
  }

  @Query(() => ComplianceReportEntity)
  async complianceReport(
    @Args() args: GenerateReportArgs,
    @Context() context: any,
  ): Promise<ComplianceReportEntity> {
    const user = context.req.user;

    // Only admins can generate system-wide reports
    if (!user.isAdmin && args.userId && args.userId !== user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = user.isAdmin ? args.userId : user.id;

    const report = await this.auditReportingService.generateComplianceReport(
      new Date(args.startDate),
      new Date(args.endDate),
      targetUserId,
    );

    return {
      reportId: report.reportId,
      generatedAt: new Date(),
      startDate: report.timeRange.start,
      endDate: report.timeRange.end,
      summary: {
        totalSecurityEvents: 0,
        totalComplianceViolations: 0,
        totalUserActions: report.userActions.accountCreations + report.userActions.accountDeletions,
        reportGeneratedAt: new Date(),
        reportPeriod: `${new Date(args.startDate).toISOString()} - ${new Date(args.endDate).toISOString()}`,
        criticalEvents: 0,
        highSeverityEvents: 0,
        mediumSeverityEvents: 0,
        lowSeverityEvents: 0,
      },
      dataAccess: {
        totalAccesses: report.dataAccess.totalAccesses,
        userDataAccesses: report.dataAccess.userDataAccesses,
        adminDataAccesses: report.dataAccess.adminDataAccesses,
        exportOperations: report.dataAccess.exportOperations,
        unauthorizedAttempts: 0, // Default value since service doesn't provide this
        dataExports: 0, // Default value since service doesn't provide this
        sensitiveDataAccess: 0, // Default value since service doesn't provide this
      },
      userActions: {
        accountCreations: report.userActions.accountCreations,
        accountDeletions: report.userActions.accountDeletions,
        profileUpdates: report.userActions.profileUpdates,
        dataExports: report.userActions.dataExports,
        permissionChanges: 0, // Default value since service doesn't provide this
        passwordResets: 0, // Default value since service doesn't provide this
      },
      systemChanges: {
        configurationChanges: report.systemChanges.configurationChanges,
        securityPolicyChanges: report.systemChanges.securityPolicyChanges,
        userPermissionChanges: report.systemChanges.userPermissionChanges,
        securityPolicyUpdates: 0, // Default value since service doesn't provide this
        systemUpdates: 0, // Default value since service doesn't provide this
      },
      auditTrailIntegrity: {
        totalRecords: report.auditTrailIntegrity.totalRecords,
        integrityChecks: report.auditTrailIntegrity.integrityChecks,
        anomaliesDetected: report.auditTrailIntegrity.anomaliesDetected,
      },
    };
  }

  @Query(() => ActivityReportEntity)
  async activityReport(
    @Args() args: GenerateReportArgs,
    @Context() context: any,
  ): Promise<ActivityReportEntity> {
    const user = context.req.user;

    // Only admins can generate system-wide reports
    if (!user.isAdmin && args.userId && args.userId !== user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = user.isAdmin ? args.userId : user.id;

    const report = await this.auditReportingService.generateActivityReport(
      new Date(args.startDate),
      new Date(args.endDate),
      targetUserId,
    );

    return {
      reportId: report.reportId,
      generatedAt: new Date(),
      startDate: report.timeRange.start,
      endDate: report.timeRange.end,
      summary: {
        totalSecurityEvents: 0,
        totalComplianceViolations: 0,
        totalUserActions: report.userActivity.totalUsers,
        reportGeneratedAt: new Date(),
        reportPeriod: `${report.timeRange.start.toISOString()} - ${report.timeRange.end.toISOString()}`,
        criticalEvents: 0,
        highSeverityEvents: 0,
        mediumSeverityEvents: 0,
        lowSeverityEvents: 0,
      },
      userActivity: {
        totalUsers: report.userActivity.totalUsers,
        activeUsers: report.userActivity.activeUsers,
        newUsers: report.userActivity.newUsers,
        topActiveUsers: report.userActivity.topActiveUsers.map(user => ({
          userId: user.userId,
          username: user.username,
          actionCount: user.actionCount,
        })),
      },
      projectActivity: {
        totalProjects: report.projectActivity.totalProjects,
        newProjects: report.projectActivity.newProjects,
        syncedProjects: report.projectActivity.syncedProjects,
        activeProjects: 0, // Default value since service doesn't provide this
      },
      platformActivity: {
        totalConnections: report.platformActivity.totalConnections,
        newConnections: report.platformActivity.newConnections,
        uniquePlatforms: 0, // Default value since service doesn't provide this
      },
      apiUsage: {
        totalCalls: report.apiUsage.totalCalls,
        uniqueUsers: report.apiUsage.uniqueUsers,
        uniqueEndpoints: 0, // Default value since service doesn't provide this
      },
    };
  }

  @Query(() => PerformanceReportEntity)
  async performanceReport(
    @Args() args: GenerateReportArgs,
    @Context() context: any,
  ): Promise<PerformanceReportEntity> {
    const user = context.req.user;

    // Only admins can generate system-wide reports
    if (!user.isAdmin && args.userId && args.userId !== user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = user.isAdmin ? args.userId : user.id;

    const report = await this.auditReportingService.generatePerformanceReport(
      new Date(args.startDate),
      new Date(args.endDate),
      targetUserId,
    );

    return {
      reportId: report.reportId,
      generatedAt: new Date(),
      startDate: report.timeRange.start,
      endDate: report.timeRange.end,
      summary: {
        totalSecurityEvents: 0,
        totalComplianceViolations: 0,
        totalUserActions: 0,
        reportGeneratedAt: new Date(),
        reportPeriod: `${new Date(args.startDate).toISOString()} - ${new Date(args.endDate).toISOString()}`,
        criticalEvents: 0,
        highSeverityEvents: 0,
        mediumSeverityEvents: 0,
        lowSeverityEvents: 0,
      },
      syncPerformance: {
        totalOperations: report.syncPerformance.totalOperations,
        successRate: report.syncPerformance.successRate,
        averageDuration: report.syncPerformance.averageDuration,
        averageResponseTime: 0, // Default value since service doesn't provide this
      },
      apiPerformance: {
        totalRequests: report.apiPerformance.totalRequests,
        averageResponseTime: report.apiPerformance.averageResponseTime,
        errorRate: report.apiPerformance.errorRate,
      },
      systemHealth: {
        uptime: report.systemHealth.uptime,
        errorCount: report.systemHealth.errorCount,
        warningCount: report.systemHealth.warningCount,
        criticalIssues: report.systemHealth.criticalIssues,
        memoryUsage: 0, // Default value since service doesn't provide this
        cpuUsage: 0, // Default value since service doesn't provide this
        diskUsage: 0, // Default value since service doesn't provide this
        activeConnections: 0, // Default value since service doesn't provide this
      },
    };
  }

  @Query(() => SearchResult)
  async searchAuditLogs(
    @Args() args: SearchAuditLogsArgs,
    @Context() context: any,
  ): Promise<SearchResult> {
    const user = context.req.user;

    // Non-admin users can only search their own logs
    const targetUserId = user.isAdmin ? args.userId : user.id;

    const filters = {
      userId: targetUserId,
      startDate: args.startDate ? new Date(args.startDate) : undefined,
      endDate: args.endDate ? new Date(args.endDate) : undefined,
      limit: args.limit,
      offset: args.offset,
    };

    const result = await this.auditReportingService.searchAuditLogs(args.searchQuery, filters);

    return {
      searchTerms: result.searchTerms,
      totalCount: result.totalCount,
      matchingLogIds: result.logs.map(log => log.id),
      success: true,
      results: result.logs,
    };
  }

  @Query(() => String)
  async exportAuditDataUrl(
    @Args() args: ExportAuditDataArgs,
    @Context() context: any,
  ): Promise<string> {
    const user = context.req.user;

    // Non-admin users can only export their own data
    const targetUserId = user.isAdmin ? args.userId : user.id;

    // In a real implementation, this would generate a temporary download URL
    // For now, we'll return a placeholder URL that would trigger the export
    const params = new URLSearchParams({
      format: args.format || 'json',
      includeMetadata: String(args.includeMetadata || true),
      ...(targetUserId && { userId: targetUserId }),
      ...(args.startDate && { startDate: args.startDate }),
      ...(args.endDate && { endDate: args.endDate }),
      ...(args.actions && { actions: args.actions.join(',') }),
      ...(args.resources && { resources: args.resources.join(',') }),
    });

    return `/api/audit/reporting/export?${params.toString()}`;
  }
}
