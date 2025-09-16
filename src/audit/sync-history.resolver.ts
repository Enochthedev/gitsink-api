import { Resolver, Query, Mutation, Args, Context, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SyncHistoryService } from './sync-history.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  SyncOperationEntity,
  SyncHistoryConnection,
  SyncHistoryStatsEntity,
  FailureAnalysis,
  SyncHistoryFiltersArgs,
  SyncHistoryStatsArgs,
  StartSyncOperationInput,
  CompleteSyncOperationInput,
  FailSyncOperationInput,
  SyncOperationType,
  SyncStatus,
} from './dto/sync-history.dto';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => SyncOperationEntity)
@UseGuards(EnhancedJwtGuard)
export class SyncHistoryResolver {
  constructor(
    private readonly syncHistoryService: SyncHistoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => SyncHistoryConnection)
  async syncHistory(
    @Args() filters: SyncHistoryFiltersArgs,
    @Context() context: any,
  ): Promise<SyncHistoryConnection> {
    const user = context.req.user;

    // Convert string dates to Date objects and arrays
    const processedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      operation: filters.operations,
      platform: filters.platforms,
      status: filters.statuses,
    };

    // Non-admin users can only see their own sync history
    if (!user.isAdmin) {
      processedFilters.userId = user.id;
    }

    const result = await this.syncHistoryService.getSyncHistory(processedFilters);

    return {
      nodes: result.history.map(h => ({
        id: h.id!,
        userId: h.userId,
        projectId: h.projectId,
        operation: h.operation as SyncOperationType,
        platform: h.platform,
        repositoryUrl: h.repositoryUrl,
        status: h.status as SyncStatus,
        changes:
          h.changes?.map(c => ({
            field: c.field,
            oldValue: c.oldValue ? JSON.stringify(c.oldValue) : undefined,
            newValue: c.newValue ? JSON.stringify(c.newValue) : undefined,
            changeType: c.changeType,
          })) || [],
        metadata: h.metadata ? JSON.stringify(h.metadata) : undefined,
        error: h.error,
        startedAt: h.startedAt!,
        completedAt: h.completedAt,
        duration: h.duration,
      })),
      totalCount: result.totalCount,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };
  }

  @Query(() => [SyncOperationEntity])
  async projectSyncHistory(
    @Args('projectId') projectId: string,
    @Args('limit', { defaultValue: 50 }) limit: number,
    @Args('offset', { defaultValue: 0 }) offset: number,
    @Context() context: any,
  ): Promise<SyncOperationEntity[]> {
    // TODO: Add authorization check to ensure user owns this project

    const history = await this.syncHistoryService.getProjectSyncHistory(projectId, limit, offset);

    return history.map(h => ({
      id: h.id!,
      userId: h.userId,
      projectId: h.projectId,
      operation: h.operation as SyncOperationType,
      platform: h.platform,
      repositoryUrl: h.repositoryUrl,
      status: h.status as SyncStatus,
      changes:
        h.changes?.map(c => ({
          field: c.field,
          oldValue: c.oldValue ? JSON.stringify(c.oldValue) : undefined,
          newValue: c.newValue ? JSON.stringify(c.newValue) : undefined,
          changeType: c.changeType,
        })) || [],
      metadata: h.metadata ? JSON.stringify(h.metadata) : undefined,
      error: h.error,
      startedAt: h.startedAt!,
      completedAt: h.completedAt,
      duration: h.duration,
    }));
  }

  @Query(() => SyncHistoryStatsEntity)
  async syncHistoryStats(
    @Args() args: SyncHistoryStatsArgs,
    @Context() context: any,
  ): Promise<SyncHistoryStatsEntity> {
    const user = context.req.user;

    // Non-admin users can only see their own stats
    const targetUserId = user.isAdmin ? args.userId : user.id;

    const stats = await this.syncHistoryService.getSyncHistoryStats(
      targetUserId,
      args.startDate ? new Date(args.startDate) : undefined,
      args.endDate ? new Date(args.endDate) : undefined,
    );

    return {
      totalOperations: stats.totalOperations,
      successfulOperations: stats.successfulOperations,
      failedOperations: stats.failedOperations,
      successRate:
        stats.totalOperations > 0 ? (stats.successfulOperations / stats.totalOperations) * 100 : 0,
      averageDuration: stats.averageDuration,
      operationsByPlatform: stats.operationsByPlatform.map(p => ({
        platform: p.platform,
        count: p.count,
        successRate: p.successRate,
      })),
      operationsByType: stats.operationsByType.map(o => ({
        operation: o.operation,
        count: o.count,
        successRate: o.successRate,
      })),
      recentFailures: stats.recentFailures.map(f => ({
        id: f.id,
        operation: f.operation,
        platform: f.platform,
        error: f.error,
        startedAt: f.startedAt,
      })),
    };
  }

  @Query(() => FailureAnalysis)
  async syncFailureAnalysis(
    @Args('userId', { nullable: true }) userId?: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
    @Context() context?: any,
  ): Promise<FailureAnalysis> {
    const user = context.req.user;

    // Non-admin users can only analyze their own failures
    const targetUserId = user.isAdmin ? userId : user.id;

    const analysis = await this.syncHistoryService.analyzeSyncFailures(
      targetUserId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      totalFailures: analysis.totalFailures,
      failuresByPlatform: analysis.failuresByPlatform.map(f => ({
        platform: f.platform,
        count: f.count,
        successRate: 100 - f.percentage, // Convert failure percentage to success rate
      })),
      failuresByOperation: analysis.failuresByOperation.map(f => ({
        operation: f.operation,
        count: f.count,
        successRate: 100 - f.percentage, // Convert failure percentage to success rate
      })),
      commonErrors: analysis.commonErrors,
      failureTrends: analysis.failureTrends,
    };
  }

  @Mutation(() => String)
  async startSyncOperation(
    @Args('input') input: StartSyncOperationInput,
    @Context() context: any,
  ): Promise<string> {
    const user = context.req.user;

    // Ensure user can only start sync operations for themselves unless admin
    if (!user.isAdmin && input.userId !== user.id) {
      throw new Error('Unauthorized: Can only start sync operations for yourself');
    }

    return this.syncHistoryService.startSyncOperation({
      userId: input.userId,
      projectId: input.projectId,
      operation: input.operation,
      platform: input.platform,
      repositoryUrl: input.repositoryUrl,
      metadata: input.metadata ? JSON.parse(input.metadata) : undefined,
    });
  }

  @Mutation(() => Boolean)
  async completeSyncOperation(
    @Args('input') input: CompleteSyncOperationInput,
    @Context() context: any,
  ): Promise<boolean> {
    // TODO: Add authorization check to ensure user owns this sync operation

    await this.syncHistoryService.completeSyncOperation(
      input.syncId,
      input.changes ? JSON.parse(input.changes) : undefined,
      input.metadata ? JSON.parse(input.metadata) : undefined,
    );

    return true;
  }

  @Mutation(() => Boolean)
  async failSyncOperation(
    @Args('input') input: FailSyncOperationInput,
    @Context() context: any,
  ): Promise<boolean> {
    // TODO: Add authorization check to ensure user owns this sync operation

    await this.syncHistoryService.failSyncOperation(
      input.syncId,
      input.error,
      input.metadata ? JSON.parse(input.metadata) : undefined,
    );

    return true;
  }

  @ResolveField(() => String, { nullable: true })
  async userName(@Parent() syncOperation: SyncOperationEntity): Promise<string | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: syncOperation.userId },
        select: { username: true, email: true },
      });

      return user?.username || user?.email || null;
    } catch (error) {
      return null;
    }
  }

  @ResolveField(() => String, { nullable: true })
  async projectTitle(@Parent() syncOperation: SyncOperationEntity): Promise<string | null> {
    if (!syncOperation.projectId) {
      return null;
    }

    try {
      const project = await this.prisma.project.findUnique({
        where: { id: syncOperation.projectId },
        select: { title: true },
      });

      return project?.title || null;
    } catch (error) {
      return null;
    }
  }

  @ResolveField(() => String)
  async operationDescription(@Parent() syncOperation: SyncOperationEntity): Promise<string> {
    const descriptions = {
      sync: 'Synchronized repository data',
      create: 'Created new project',
      update: 'Updated project information',
      delete: 'Deleted project',
    };

    return descriptions[syncOperation.operation] || `Unknown operation: ${syncOperation.operation}`;
  }

  @ResolveField(() => String)
  async statusDescription(@Parent() syncOperation: SyncOperationEntity): Promise<string> {
    const descriptions = {
      started: 'Operation in progress',
      completed: 'Operation completed successfully',
      failed: 'Operation failed',
    };

    return descriptions[syncOperation.status] || `Unknown status: ${syncOperation.status}`;
  }

  @ResolveField(() => String, { nullable: true })
  async durationFormatted(@Parent() syncOperation: SyncOperationEntity): Promise<string | null> {
    if (!syncOperation.duration) {
      return null;
    }

    const seconds = Math.floor(syncOperation.duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
