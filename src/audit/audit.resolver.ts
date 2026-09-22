import { Args, Context, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  AuditLogConnection,
  AuditLogEntity,
  AuditSummaryEntity,
} from './entities/audit-log.entity';
import { AuditLogFiltersArgs, AuditSummaryArgs } from './dto/audit-log.dto';
import { AuditAction, AuditResource } from './interfaces/audit.interface';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => AuditLogEntity)
@UseGuards(EnhancedJwtGuard)
export class AuditResolver {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => AuditLogConnection)
  async auditLogs(
    @Args() filters: AuditLogFiltersArgs,
    @Context() context: any,
  ): Promise<AuditLogConnection> {
    const user = context.req.user;

    // Convert string dates to Date objects
    const processedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      action: filters.actions,
      resource: filters.resources,
    };

    // Non-admin users can only see their own audit logs
    if (!user.isAdmin) {
      processedFilters.userId = user.id;
    }

    const result = await this.auditService.getAuditLogs(processedFilters);

    return {
      nodes: result.logs,
      totalCount: result.totalCount,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };
  }

  @Query(() => [AuditLogEntity])
  async userAuditLogs(
    @Args('userId', { nullable: true }) userId: string,
    @Args('limit', { defaultValue: 50 }) limit: number,
    @Args('offset', { defaultValue: 0 }) offset: number,
    @Context() context: any,
  ): Promise<AuditLogEntity[]> {
    const user = context.req.user;

    // Users can only see their own audit logs unless they're admin
    const targetUserId = user.isAdmin ? userId || user.id : user.id;

    return this.auditService.getUserAuditLogs(targetUserId, limit, offset);
  }

  @Query(() => [AuditLogEntity])
  async resourceAuditLogs(
    @Args('resource', { type: () => AuditResource }) resource: AuditResource,
    @Args('resourceId') resourceId: string,
    @Args('limit', { defaultValue: 50 }) limit: number,
    @Args('offset', { defaultValue: 0 }) offset: number,
    @Context() context: any,
  ): Promise<AuditLogEntity[]> {
    // TODO: Add authorization check to ensure user can access this resource
    return this.auditService.getResourceAuditLogs(resource, resourceId, limit, offset);
  }

  @Query(() => AuditSummaryEntity)
  async auditSummary(
    @Args() args: AuditSummaryArgs,
    @Context() context: any,
  ): Promise<AuditSummaryEntity> {
    const user = context.req.user;

    // Non-admin users can only see their own summary
    const targetUserId = user.isAdmin ? args.userId : user.id;

    const summary = await this.auditService.getAuditSummary(
      args.startDate ? new Date(args.startDate) : undefined,
      args.endDate ? new Date(args.endDate) : undefined,
      targetUserId,
      args.topLimit,
    );

    return {
      totalLogs: summary.totalEvents,
      successfulActions: summary.successfulEvents,
      failedActions: summary.failedEvents || 0,
      uniqueUsers: summary.uniqueUsers,
      mostCommonAction: summary.topActions?.[0]?.action || 'N/A',
      timeRange: `${summary.timeRange.start.toISOString()} - ${summary.timeRange.end.toISOString()}`,
      totalEvents: summary.totalEvents,
      successfulEvents: summary.successfulEvents,
    };
  }

  @ResolveField(() => String, { nullable: true })
  async userName(@Parent() auditLog: AuditLogEntity): Promise<string | null> {
    if (!auditLog.userId) {
      return null;
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: auditLog.userId },
        select: { username: true, email: true },
      });

      return user?.username || user?.email || null;
    } catch (error) {
      return null;
    }
  }

  @ResolveField(() => String, { nullable: true })
  async resourceName(@Parent() auditLog: AuditLogEntity): Promise<string | null> {
    if (!auditLog.resource || !auditLog.resourceId) {
      return null;
    }

    try {
      switch (auditLog.resource) {
        case AuditResource.PROJECT:
          const project = await this.prisma.project.findUnique({
            where: { id: auditLog.resourceId },
            select: { title: true },
          });
          return project?.title || null;

        case AuditResource.USER:
          const user = await this.prisma.user.findUnique({
            where: { id: auditLog.resourceId },
            select: { username: true, email: true },
          });
          return user?.username || user?.email || null;

        case AuditResource.PROFILE:
          const profile = await this.prisma.publicProfile.findUnique({
            where: { id: auditLog.resourceId },
            select: { username: true },
          });
          return profile?.username || null;

        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }

  @ResolveField(() => String, { nullable: true })
  async detailsFormatted(@Parent() auditLog: AuditLogEntity): Promise<string | null> {
    if (!auditLog.details) {
      return null;
    }

    try {
      const details = JSON.parse(auditLog.details);
      return JSON.stringify(details, null, 2);
    } catch (error) {
      return auditLog.details;
    }
  }

  @ResolveField(() => String)
  async actionDescription(@Parent() auditLog: AuditLogEntity): Promise<string> {
    const actionDescriptions: Record<AuditAction, string> = {
      [AuditAction.LOGIN]: 'User logged in',
      [AuditAction.LOGOUT]: 'User logged out',
      [AuditAction.SIGNUP]: 'User signed up',
      [AuditAction.PASSWORD_RESET]: 'Password reset requested',
      [AuditAction.API_KEY_GENERATED]: 'API key generated',
      [AuditAction.API_KEY_REGENERATED]: 'API key regenerated',
      [AuditAction.API_KEY_REVOKED]: 'API key revoked',
      [AuditAction.MAGIC_LINK_SENT]: 'Magic link sent',
      [AuditAction.MAGIC_LINK_USED]: 'Magic link used',
      [AuditAction.PROJECT_CREATED]: 'Project created',
      [AuditAction.PROJECT_UPDATED]: 'Project updated',
      [AuditAction.PROJECT_DELETED]: 'Project deleted',
      [AuditAction.PROJECT_SYNCED]: 'Project synced',
      [AuditAction.PROJECT_PUBLISHED]: 'Project published',
      [AuditAction.PROJECT_UNPUBLISHED]: 'Project unpublished',
      [AuditAction.PROFILE_CREATED]: 'Profile created',
      [AuditAction.PROFILE_UPDATED]: 'Profile updated',
      [AuditAction.PROFILE_VIEWED]: 'Profile viewed',
      [AuditAction.PROFILE_MADE_PUBLIC]: 'Profile made public',
      [AuditAction.PROFILE_MADE_PRIVATE]: 'Profile made private',
      [AuditAction.PLATFORM_CONNECTED]: 'Platform connected',
      [AuditAction.PLATFORM_DISCONNECTED]: 'Platform disconnected',
      [AuditAction.PLATFORM_TOKEN_REFRESHED]: 'Platform token refreshed',
      [AuditAction.API_CALL]: 'API call made',
      [AuditAction.RATE_LIMIT_HIT]: 'Rate limit exceeded',
      [AuditAction.SYSTEM_ERROR]: 'System error occurred',
      [AuditAction.SECURITY_EVENT]: 'Security event detected',
      [AuditAction.DATA_EXPORT]: 'Data exported',
      [AuditAction.DATA_IMPORT]: 'Data imported',
    };

    return actionDescriptions[auditLog.action] || `Unknown action: ${auditLog.action}`;
  }

  @ResolveField(() => String, { nullable: true })
  async resourceDescription(@Parent() auditLog: AuditLogEntity): Promise<string | null> {
    if (!auditLog.resource) {
      return null;
    }

    const resourceDescriptions: Record<AuditResource, string> = {
      [AuditResource.USER]: 'User account',
      [AuditResource.PROJECT]: 'Project repository',
      [AuditResource.PROFILE]: 'Developer profile',
      [AuditResource.API_KEY]: 'API key',
      [AuditResource.PLATFORM_CONNECTION]: 'Platform connection',
      [AuditResource.SYNC_OPERATION]: 'Sync operation',
      [AuditResource.SYSTEM]: 'System component',
    };

    return resourceDescriptions[auditLog.resource] || `Unknown resource: ${auditLog.resource}`;
  }
}
