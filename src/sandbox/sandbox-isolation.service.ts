import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from './sandbox.service';

export interface DataIsolationRule {
  table: string;
  sandboxField: string;
  isolationStrategy: 'metadata' | 'flag' | 'prefix' | 'separate_table';
  allowedOperations: ('create' | 'read' | 'update' | 'delete')[];
}

@Injectable()
export class SandboxIsolationService {
  private readonly logger = new Logger(SandboxIsolationService.name);

  // Define isolation rules for different data types
  private readonly isolationRules: DataIsolationRule[] = [
    {
      table: 'Project',
      sandboxField: 'customMetadata.sandbox',
      isolationStrategy: 'metadata',
      allowedOperations: ['create', 'read', 'update', 'delete'],
    },
    {
      table: 'PublicProfile',
      sandboxField: 'settings.sandbox',
      isolationStrategy: 'metadata',
      allowedOperations: ['create', 'read', 'update', 'delete'],
    },
    {
      table: 'SyncHistory',
      sandboxField: 'metadata.sandbox',
      isolationStrategy: 'metadata',
      allowedOperations: ['create', 'read'],
    },
    {
      table: 'AIAnalysis',
      sandboxField: 'analysis.sandbox',
      isolationStrategy: 'metadata',
      allowedOperations: ['create', 'read', 'update', 'delete'],
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxService: SandboxService,
  ) {}

  /**
   * Validate that a user can perform an operation on specific data
   */
  async validateDataAccess(
    userId: string,
    table: string,
    operation: 'create' | 'read' | 'update' | 'delete',
    data?: any,
    recordId?: string,
  ): Promise<boolean> {
    const isInSandbox = await this.sandboxService.isUserInSandboxMode(userId);
    const rule = this.isolationRules.find(r => r.table === table);

    if (!rule) {
      // No specific rule - allow operation
      return true;
    }

    if (!rule.allowedOperations.includes(operation)) {
      throw new ForbiddenException(
        `Operation ${operation} not allowed on ${table} in sandbox mode`,
      );
    }

    // If user is in sandbox mode, ensure they can only access sandbox data
    if (isInSandbox) {
      return await this.validateSandboxDataAccess(userId, table, operation, data, recordId);
    }

    // If user is in production mode, ensure they can only access production data
    return await this.validateProductionDataAccess(userId, table, operation, data, recordId);
  }

  /**
   * Apply sandbox isolation filters to database queries
   */
  applySandboxFilters(userId: string, isInSandbox: boolean, baseWhere: any = {}): any {
    if (isInSandbox) {
      // In sandbox mode - only show sandbox data
      return {
        ...baseWhere,
        ownerId: userId,
        OR: [
          {
            customMetadata: {
              path: ['sandbox'],
              equals: true,
            },
          },
          {
            settings: {
              path: ['sandbox'],
              equals: true,
            },
          },
          {
            metadata: {
              path: ['sandbox'],
              equals: true,
            },
          },
          {
            analysis: {
              path: ['sandbox'],
              equals: true,
            },
          },
        ],
      };
    } else {
      // In production mode - exclude sandbox data
      return {
        ...baseWhere,
        ownerId: userId,
        AND: [
          {
            customMetadata: {
              path: ['sandbox'],
              not: true,
            },
          },
          {
            settings: {
              path: ['sandbox'],
              not: true,
            },
          },
          {
            metadata: {
              path: ['sandbox'],
              not: true,
            },
          },
          {
            analysis: {
              path: ['sandbox'],
              not: true,
            },
          },
        ],
      };
    }
  }

  /**
   * Mark data as sandbox data during creation
   */
  applySandboxMarkers(data: any, isInSandbox: boolean): any {
    if (!isInSandbox) {
      return data;
    }

    const markedData = { ...data };

    // Apply sandbox markers based on data structure
    if (markedData.customMetadata) {
      markedData.customMetadata = {
        ...markedData.customMetadata,
        sandbox: true,
        sandboxCreatedAt: new Date().toISOString(),
      };
    } else if (markedData.settings) {
      markedData.settings = {
        ...markedData.settings,
        sandbox: true,
        sandboxCreatedAt: new Date().toISOString(),
      };
    } else if (markedData.metadata) {
      markedData.metadata = {
        ...markedData.metadata,
        sandbox: true,
        sandboxCreatedAt: new Date().toISOString(),
      };
    } else if (markedData.analysis) {
      markedData.analysis = {
        ...markedData.analysis,
        sandbox: true,
        sandboxCreatedAt: new Date().toISOString(),
      };
    } else {
      // Default: add to customMetadata
      markedData.customMetadata = {
        sandbox: true,
        sandboxCreatedAt: new Date().toISOString(),
      };
    }

    return markedData;
  }

  /**
   * Clean up all sandbox data for a user
   */
  async cleanupAllSandboxData(userId: string): Promise<{
    projectsDeleted: number;
    profilesDeleted: number;
    syncHistoryDeleted: number;
    aiAnalysisDeleted: number;
  }> {
    const result = {
      projectsDeleted: 0,
      profilesDeleted: 0,
      syncHistoryDeleted: 0,
      aiAnalysisDeleted: 0,
    };

    try {
      // Delete sandbox projects
      const deletedProjects = await this.prisma.project.deleteMany({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });
      result.projectsDeleted = deletedProjects.count;

      // Delete sandbox profiles
      const deletedProfiles = await this.prisma.publicProfile.deleteMany({
        where: {
          userId,
          settings: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });
      result.profilesDeleted = deletedProfiles.count;

      // Delete sandbox sync history
      const deletedSyncHistory = await this.prisma.syncHistory.deleteMany({
        where: {
          userId,
          metadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });
      result.syncHistoryDeleted = deletedSyncHistory.count;

      // Delete sandbox AI analysis
      const sandboxProjects = await this.prisma.project.findMany({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
        select: { id: true },
      });

      if (sandboxProjects.length > 0) {
        const deletedAIAnalysis = await this.prisma.aIAnalysis.deleteMany({
          where: {
            projectId: {
              in: sandboxProjects.map(p => p.id),
            },
          },
        });
        result.aiAnalysisDeleted = deletedAIAnalysis.count;
      }

      this.logger.log(`Cleaned up sandbox data for user ${userId}`, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to cleanup sandbox data for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get sandbox data statistics for a user
   */
  async getSandboxDataStats(userId: string): Promise<{
    projects: number;
    profiles: number;
    syncHistory: number;
    aiAnalysis: number;
    totalSize: number;
  }> {
    try {
      const [projects, profiles, syncHistory, aiAnalysis] = await Promise.all([
        this.prisma.project.count({
          where: {
            ownerId: userId,
            customMetadata: {
              path: ['sandbox'],
              equals: true,
            },
          },
        }),
        this.prisma.publicProfile.count({
          where: {
            userId,
            settings: {
              path: ['sandbox'],
              equals: true,
            },
          },
        }),
        this.prisma.syncHistory.count({
          where: {
            userId,
            metadata: {
              path: ['sandbox'],
              equals: true,
            },
          },
        }),
        this.prisma.aIAnalysis.count({
          where: {
            project: {
              ownerId: userId,
              customMetadata: {
                path: ['sandbox'],
                equals: true,
              },
            },
          },
        }),
      ]);

      const totalSize = projects + profiles + syncHistory + aiAnalysis;

      return {
        projects,
        profiles,
        syncHistory,
        aiAnalysis,
        totalSize,
      };
    } catch (error) {
      this.logger.error(`Failed to get sandbox data stats for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Validate data integrity between sandbox and production
   */
  async validateDataIntegrity(userId: string): Promise<{
    isValid: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for data leakage (sandbox data in production queries)
      const productionProjectsWithSandboxFlag = await this.prisma.project.count({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
          published: true, // This shouldn't happen
        },
      });

      if (productionProjectsWithSandboxFlag > 0) {
        issues.push(
          `Found ${productionProjectsWithSandboxFlag} published projects with sandbox flag`,
        );
      }

      // Check for orphaned sandbox data
      const orphanedAIAnalysis = await this.prisma.aIAnalysis.count({
        where: {
          project: undefined,
          analysis: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });

      if (orphanedAIAnalysis > 0) {
        warnings.push(`Found ${orphanedAIAnalysis} orphaned sandbox AI analysis records`);
      }

      // Check for inconsistent sandbox markers
      const projectsWithInconsistentMarkers = await this.prisma.project.findMany({
        where: {
          ownerId: userId,
          OR: [
            {
              customMetadata: {
                path: ['sandbox'],
                equals: true,
              },
              published: true,
            },
            {
              customMetadata: {
                path: ['sandbox'],
                equals: true,
              },
              featured: true,
            },
          ],
        },
        select: { id: true, title: true },
      });

      if (projectsWithInconsistentMarkers.length > 0) {
        warnings.push(
          `Found ${projectsWithInconsistentMarkers.length} sandbox projects with production flags`,
        );
      }

      return {
        isValid: issues.length === 0,
        issues,
        warnings,
      };
    } catch (error) {
      issues.push(
        `Data integrity validation failed: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
      );
      return { isValid: false, issues, warnings };
    }
  }

  // Private helper methods

  private async validateSandboxDataAccess(
    userId: string,
    table: string,
    operation: string,
    data?: any,
    recordId?: string,
  ): Promise<boolean> {
    // In sandbox mode, user can only access sandbox data
    if (recordId) {
      // Check if existing record is sandbox data
      const record = await this.getRecord(table, recordId);
      if (!record) {
        return false;
      }

      return this.isSandboxRecord(record);
    }

    // For create operations, data will be marked as sandbox
    return true;
  }

  private async validateProductionDataAccess(
    userId: string,
    table: string,
    operation: string,
    data?: any,
    recordId?: string,
  ): Promise<boolean> {
    // In production mode, user cannot access sandbox data
    if (recordId) {
      // Check if existing record is production data
      const record = await this.getRecord(table, recordId);
      if (!record) {
        return false;
      }

      return !this.isSandboxRecord(record);
    }

    // For create operations, data will not be marked as sandbox
    return true;
  }

  private async getRecord(table: string, recordId: string): Promise<any> {
    switch (table) {
      case 'Project':
        return await this.prisma.project.findUnique({
          where: { id: recordId },
        });
      case 'PublicProfile':
        return await this.prisma.publicProfile.findUnique({
          where: { id: recordId },
        });
      case 'SyncHistory':
        return await this.prisma.syncHistory.findUnique({
          where: { id: recordId },
        });
      case 'AIAnalysis':
        return await this.prisma.aIAnalysis.findUnique({
          where: { id: recordId },
        });
      default:
        return null;
    }
  }

  private isSandboxRecord(record: any): boolean {
    if (!record) {
      return false;
    }

    // Check various possible sandbox markers
    return (
      record.customMetadata?.sandbox === true ||
      record.settings?.sandbox === true ||
      record.metadata?.sandbox === true ||
      record.analysis?.sandbox === true
    );
  }
}
