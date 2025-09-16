import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditAction, AuditResource } from './interfaces/audit.interface';

export interface SyncOperation {
  id?: string;
  userId: string;
  projectId?: string;
  operation: 'sync' | 'create' | 'update' | 'delete';
  platform: string;
  repositoryUrl: string;
  status: 'started' | 'completed' | 'failed';
  changes?: ChangeRecord[];
  metadata?: Record<string, any>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface ChangeRecord {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'created' | 'updated' | 'deleted';
}

export interface SyncHistoryFilters {
  userId?: string;
  projectId?: string;
  operation?: string | string[];
  platform?: string | string[];
  status?: string | string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'startedAt' | 'completedAt' | 'duration';
  orderDirection?: 'asc' | 'desc';
}

export interface SyncHistoryStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  operationsByPlatform: Array<{
    platform: string;
    count: number;
    successRate: number;
  }>;
  operationsByType: Array<{
    operation: string;
    count: number;
    successRate: number;
  }>;
  recentFailures: Array<{
    id: string;
    operation: string;
    platform: string;
    error: string;
    startedAt: Date;
  }>;
}

@Injectable()
export class SyncHistoryService {
  private readonly logger = new Logger(SyncHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) { }

  /**
   * Start tracking a sync operation
   */
  async startSyncOperation(
    operation: Omit<SyncOperation, 'id' | 'status' | 'startedAt'>,
  ): Promise<string> {
    try {
      const syncHistory = await this.prisma.syncHistory.create({
        data: {
          userId: operation.userId,
          projectId: operation.projectId,
          operation: operation.operation,
          platform: operation.platform,
          repositoryUrl: operation.repositoryUrl,
          status: 'started',
          changes: JSON.stringify(operation.changes || []),
          metadata: JSON.stringify(operation.metadata || {}),
          startedAt: new Date(),
        },
      });

      // Log audit event
      await this.auditService.logUserAction(
        operation.userId,
        this.getAuditActionForOperation(operation.operation),
        AuditResource.SYNC_OPERATION,
        syncHistory.id,
        {
          operation: operation.operation,
          platform: operation.platform,
          repositoryUrl: operation.repositoryUrl,
          projectId: operation.projectId,
        },
      );

      this.logger.debug(`Started sync operation: ${syncHistory.id}`, {
        operation: operation.operation,
        platform: operation.platform,
        userId: operation.userId,
      });

      return syncHistory.id;
    } catch (error) {
      this.logger.error('Failed to start sync operation tracking', {
        error: error instanceof Error ? error.message : String(error),
        operation,
      });
      throw error;
    }
  }

  /**
   * Complete a sync operation successfully
   */
  async completeSyncOperation(
    syncId: string,
    changes?: ChangeRecord[],
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Get the original sync record to calculate duration
      const originalSync = await this.prisma.syncHistory.findUnique({
        where: { id: syncId },
      });

      if (!originalSync) {
        throw new Error(`Sync operation not found: ${syncId}`);
      }

      const duration = completedAt.getTime() - originalSync.startedAt.getTime();

      await this.prisma.syncHistory.update({
        where: { id: syncId },
        data: {
          status: 'completed',
          changes: JSON.stringify(changes || []),
          metadata: JSON.stringify({
            ...(originalSync.metadata ? JSON.parse(originalSync.metadata as string) : {}),
            ...metadata,
          }),
          completedAt,
          duration,
        },
      });

      // Log audit event
      await this.auditService.logUserAction(
        originalSync.userId,
        this.getAuditActionForOperation(originalSync.operation),
        AuditResource.SYNC_OPERATION,
        syncId,
        {
          operation: originalSync.operation,
          platform: originalSync.platform,
          repositoryUrl: originalSync.repositoryUrl,
          projectId: originalSync.projectId,
          duration,
          changesCount: changes?.length || 0,
          status: 'completed',
        },
        { success: true },
      );

      this.logger.debug(`Completed sync operation: ${syncId}`, {
        duration,
        changesCount: changes?.length || 0,
      });
    } catch (error) {
      this.logger.error('Failed to complete sync operation', {
        error: error instanceof Error ? error.message : String(error),
        syncId,
      });
      throw error;
    }
  }

  /**
   * Mark a sync operation as failed
   */
  async failSyncOperation(
    syncId: string,
    error: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Get the original sync record to calculate duration
      const originalSync = await this.prisma.syncHistory.findUnique({
        where: { id: syncId },
      });

      if (!originalSync) {
        throw new Error(`Sync operation not found: ${syncId}`);
      }

      const duration = completedAt.getTime() - originalSync.startedAt.getTime();

      await this.prisma.syncHistory.update({
        where: { id: syncId },
        data: {
          status: 'failed',
          error,
          metadata: JSON.stringify({
            ...(originalSync.metadata ? JSON.parse(originalSync.metadata as string) : {}),
            ...metadata,
          }),
          completedAt,
          duration,
        },
      });

      // Log audit event
      await this.auditService.logUserAction(
        originalSync.userId,
        this.getAuditActionForOperation(originalSync.operation),
        AuditResource.SYNC_OPERATION,
        syncId,
        {
          operation: originalSync.operation,
          platform: originalSync.platform,
          repositoryUrl: originalSync.repositoryUrl,
          projectId: originalSync.projectId,
          duration,
          status: 'failed',
          error,
        },
        { success: false, error },
      );

      this.logger.warn(`Failed sync operation: ${syncId}`, {
        error,
        duration,
        operation: originalSync.operation,
        platform: originalSync.platform,
      });
    } catch (err) {
      this.logger.error('Failed to mark sync operation as failed', {
        error: err instanceof Error ? err.message : String(err),
        syncId,
        originalError: error,
      });
      throw err;
    }
  }

  /**
   * Get sync history with filtering and pagination
   */
  async getSyncHistory(filters: SyncHistoryFilters): Promise<{
    history: SyncOperation[];
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    const where: any = {};

    // Build where clause
    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.operation) {
      if (Array.isArray(filters.operation)) {
        where.operation = { in: filters.operation };
      } else {
        where.operation = filters.operation;
      }
    }

    if (filters.platform) {
      if (Array.isArray(filters.platform)) {
        where.platform = { in: filters.platform };
      } else {
        where.platform = filters.platform;
      }
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        where.status = { in: filters.status };
      } else {
        where.status = filters.status;
      }
    }

    if (filters.startDate || filters.endDate) {
      where.startedAt = {};
      if (filters.startDate) {
        where.startedAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startedAt.lte = filters.endDate;
      }
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[filters.orderBy || 'startedAt'] = filters.orderDirection || 'desc';

    // Get total count
    const totalCount = await this.prisma.syncHistory.count({ where });

    // Get history with pagination
    const history = await this.prisma.syncHistory.findMany({
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
        project: {
          select: {
            id: true,
            title: true,
            repoUrl: true,
          },
        },
      },
    });

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    return {
      history: history.map(h => ({
        id: h.id,
        userId: h.userId,
        projectId: h.projectId || undefined,
        operation: h.operation as any,
        platform: h.platform,
        repositoryUrl: h.repositoryUrl,
        status: h.status as any,
        changes: h.changes ? JSON.parse(h.changes as string) : [],
        metadata: h.metadata ? JSON.parse(h.metadata as string) : {},
        error: h.error || undefined,
        startedAt: h.startedAt,
        completedAt: h.completedAt || undefined,
        duration: h.duration || undefined,
      })),
      totalCount,
      hasNextPage: offset + limit < totalCount,
      hasPreviousPage: offset > 0,
    };
  }

  /**
   * Get sync history statistics
   */
  async getSyncHistoryStats(
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SyncHistoryStats> {
    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        where.startedAt.gte = startDate;
      }
      if (endDate) {
        where.startedAt.lte = endDate;
      }
    }

    // Get basic counts
    const [totalOperations, successfulOperations, failedOperations] = await Promise.all([
      this.prisma.syncHistory.count({ where }),
      this.prisma.syncHistory.count({
        where: { ...where, status: 'completed' },
      }),
      this.prisma.syncHistory.count({
        where: { ...where, status: 'failed' },
      }),
    ]);

    // Get average duration for completed operations
    const avgDurationResult = await this.prisma.syncHistory.aggregate({
      where: { ...where, status: 'completed', duration: { not: null } },
      _avg: {
        duration: true,
      },
    });
    const averageDuration = avgDurationResult._avg.duration || 0;

    // Get operations by platform
    const platformStats = await this.prisma.syncHistory.groupBy({
      by: ['platform'],
      where,
      _count: true,
    });

    const operationsByPlatform = await Promise.all(
      platformStats.map(async stat => {
        const successCount = await this.prisma.syncHistory.count({
          where: { ...where, platform: stat.platform, status: 'completed' },
        });
        return {
          platform: stat.platform,
          count: stat._count,
          successRate: stat._count > 0 ? (successCount / stat._count) * 100 : 0,
        };
      }),
    );

    // Get operations by type
    const operationStats = await this.prisma.syncHistory.groupBy({
      by: ['operation'],
      where,
      _count: true,
    });

    const operationsByType = await Promise.all(
      operationStats.map(async stat => {
        const successCount = await this.prisma.syncHistory.count({
          where: { ...where, operation: stat.operation, status: 'completed' },
        });
        return {
          operation: stat.operation,
          count: stat._count,
          successRate: stat._count > 0 ? (successCount / stat._count) * 100 : 0,
        };
      }),
    );

    // Get recent failures
    const recentFailures = await this.prisma.syncHistory.findMany({
      where: { ...where, status: 'failed' },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        operation: true,
        platform: true,
        error: true,
        startedAt: true,
      },
    });

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageDuration,
      operationsByPlatform,
      operationsByType,
      recentFailures: recentFailures.map(f => ({
        id: f.id,
        operation: f.operation,
        platform: f.platform,
        error: f.error || 'Unknown error',
        startedAt: f.startedAt,
      })),
    };
  }

  /**
   * Get sync history for a specific project
   */
  async getProjectSyncHistory(
    projectId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<SyncOperation[]> {
    const history = await this.prisma.syncHistory.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
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

    return history.map(h => ({
      id: h.id,
      userId: h.userId,
      projectId: h.projectId || undefined,
      operation: h.operation as any,
      platform: h.platform,
      repositoryUrl: h.repositoryUrl,
      status: h.status as any,
      changes: h.changes ? JSON.parse(h.changes as string) : [],
      metadata: h.metadata ? JSON.parse(h.metadata as string) : {},
      error: h.error || undefined,
      startedAt: h.startedAt,
      completedAt: h.completedAt || undefined,
      duration: h.duration || undefined,
    }));
  }

  /**
   * Detect changes between old and new project data
   */
  detectProjectChanges(oldProject: any, newProject: any): ChangeRecord[] {
    const changes: ChangeRecord[] = [];
    const fieldsToTrack = [
      'title',
      'description',
      'tags',
      'category',
      'language',
      'starCount',
      'forkCount',
      'isPrivate',
      'archived',
      'disabled',
      'lastCommitAt',
      'pushedAt',
    ];

    for (const field of fieldsToTrack) {
      const oldValue = oldProject?.[field];
      const newValue = newProject?.[field];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        let changeType: 'created' | 'updated' | 'deleted' = 'updated';

        if (oldValue === undefined || oldValue === null) {
          changeType = 'created';
        } else if (newValue === undefined || newValue === null) {
          changeType = 'deleted';
        }

        changes.push({
          field,
          oldValue,
          newValue,
          changeType,
        });
      }
    }

    return changes;
  }

  /**
   * Analyze sync failures to identify patterns
   */
  async analyzeSyncFailures(
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalFailures: number;
    failuresByPlatform: Array<{
      platform: string;
      count: number;
      percentage: number;
    }>;
    failuresByOperation: Array<{
      operation: string;
      count: number;
      percentage: number;
    }>;
    commonErrors: Array<{ error: string; count: number; percentage: number }>;
    failureTrends: Array<{ date: string; count: number }>;
  }> {
    const where: any = { status: 'failed' };

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        where.startedAt.gte = startDate;
      }
      if (endDate) {
        where.startedAt.lte = endDate;
      }
    }

    const totalFailures = await this.prisma.syncHistory.count({ where });

    if (totalFailures === 0) {
      return {
        totalFailures: 0,
        failuresByPlatform: [],
        failuresByOperation: [],
        commonErrors: [],
        failureTrends: [],
      };
    }

    // Failures by platform
    const platformFailures = await this.prisma.syncHistory.groupBy({
      by: ['platform'],
      where,
      _count: true,
      orderBy: {
        _count: {
          platform: 'desc',
        },
      },
    });

    const failuresByPlatform = platformFailures.map(f => ({
      platform: f.platform,
      count: f._count,
      percentage: (f._count / totalFailures) * 100,
    }));

    // Failures by operation
    const operationFailures = await this.prisma.syncHistory.groupBy({
      by: ['operation'],
      where,
      _count: true,
      orderBy: {
        _count: {
          operation: 'desc',
        },
      },
    });

    const failuresByOperation = operationFailures.map(f => ({
      operation: f.operation,
      count: f._count,
      percentage: (f._count / totalFailures) * 100,
    }));

    // Common errors (this would need more sophisticated error categorization)
    const errorFailures = await this.prisma.syncHistory.groupBy({
      by: ['error'],
      where: { ...where, error: { not: null } },
      _count: true,
      orderBy: {
        _count: {
          error: 'desc',
        },
      },
      take: 10,
    });

    const commonErrors = errorFailures.map(f => ({
      error: f.error || 'Unknown error',
      count: f._count,
      percentage: (f._count / totalFailures) * 100,
    }));

    // Failure trends (daily counts for the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendData = await this.prisma.$queryRaw`
      SELECT DATE(started_at) as date, COUNT(*) as count
      FROM "SyncHistory"
      WHERE status = 'failed' 
        AND started_at >= ${thirtyDaysAgo}
        ${userId ? `AND user_id = ${userId}` : ''}
      GROUP BY DATE(started_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const failureTrends = (trendData as Array<{ date: Date; count: bigint }>).map(d => ({
      date: d.date.toISOString().split('T')[0],
      count: Number(d.count),
    }));

    return {
      totalFailures,
      failuresByPlatform,
      failuresByOperation,
      commonErrors,
      failureTrends,
    };
  }

  /**
   * Get audit action for sync operation
   */
  private getAuditActionForOperation(operation: string): AuditAction {
    switch (operation) {
      case 'sync':
        return AuditAction.PROJECT_SYNCED;
      case 'create':
        return AuditAction.PROJECT_CREATED;
      case 'update':
        return AuditAction.PROJECT_UPDATED;
      case 'delete':
        return AuditAction.PROJECT_DELETED;
      default:
        return AuditAction.PROJECT_SYNCED;
    }
  }
}
