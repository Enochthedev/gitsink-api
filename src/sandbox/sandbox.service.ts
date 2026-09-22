import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';
import { Counter, Gauge, Histogram } from 'prom-client';
import {
  SandboxConfig,
  SandboxMigrationOptions,
  SandboxSession,
  SandboxUsage,
} from './interfaces/sandbox.interface';
import {
  MigrateSandboxDataInput,
  ResetSandboxInput,
  StartSandboxSessionInput,
} from './dto/sandbox.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly sandboxConfig: SandboxConfig;

  // Metrics
  private readonly sandboxSessionsCounter: Counter<string>;
  private readonly sandboxOperationDuration: Histogram<string>;
  private readonly sandboxUsageGauge: Gauge<string>;
  private readonly sandboxErrorsCounter: Counter<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    // Initialize sandbox configuration
    this.sandboxConfig = {
      enabled: this.configService.get<boolean>('SANDBOX_ENABLED', true),
      maxProjects: this.configService.get<number>('SANDBOX_MAX_PROJECTS', 10),
      maxApiCalls: this.configService.get<number>('SANDBOX_MAX_API_CALLS', 1000),
      maxSyncOperations: this.configService.get<number>('SANDBOX_MAX_SYNC_OPS', 50),
      sessionDuration: this.configService.get<number>(
        'SANDBOX_SESSION_DURATION',
        24 * 60 * 60 * 1000,
      ), // 24 hours
      dataRetention: this.configService.get<number>(
        'SANDBOX_DATA_RETENTION',
        7 * 24 * 60 * 60 * 1000,
      ), // 7 days
    };

    // Initialize metrics
    this.sandboxSessionsCounter = this.metricsService.createCustomCounter(
      'sandbox_sessions_total',
      'Total number of sandbox sessions',
      ['operation', 'status'],
    );

    this.sandboxOperationDuration = this.metricsService.createCustomHistogram(
      'sandbox_operation_duration_seconds',
      'Duration of sandbox operations',
      ['operation'],
      [0.1, 0.5, 1, 2, 5, 10],
    );

    this.sandboxUsageGauge = this.metricsService.createCustomGauge(
      'sandbox_usage_current',
      'Current sandbox usage metrics',
      ['metric_type', 'user_id'],
    );

    this.sandboxErrorsCounter = this.metricsService.createCustomCounter(
      'sandbox_errors_total',
      'Total number of sandbox errors',
      ['operation', 'error_type'],
    );

    this.logger.log('SandboxService initialized', {
      config: this.sandboxConfig,
    });
  }

  /**
   * Check if sandbox mode is enabled
   */
  isSandboxEnabled(): boolean {
    return this.sandboxConfig.enabled;
  }

  /**
   * Get sandbox configuration
   */
  getSandboxConfig(): SandboxConfig {
    return { ...this.sandboxConfig };
  }

  /**
   * Start a new sandbox session for a user
   */
  async startSandboxSession(
    userId: string,
    input: StartSandboxSessionInput = {},
  ): Promise<SandboxSession> {
    const operationStart = Date.now();
    const operation = 'start_session';

    try {
      if (!this.isSandboxEnabled()) {
        this.sandboxErrorsCounter.inc({ operation, error_type: 'disabled' });
        throw new ForbiddenException('Sandbox mode is disabled');
      }

      // Check if user already has an active session
      const existingSession = await this.getActiveSandboxSession(userId);
      if (existingSession) {
        this.logger.log(`User ${userId} already has active sandbox session`, {
          sessionId: existingSession.id,
        });
        return existingSession;
      }

      // Create new session
      const sessionId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.sandboxConfig.sessionDuration);

      const maxProjects = Math.min(
        input.maxProjects || this.sandboxConfig.maxProjects,
        this.sandboxConfig.maxProjects,
      );
      const maxApiCalls = Math.min(
        input.maxApiCalls || this.sandboxConfig.maxApiCalls,
        this.sandboxConfig.maxApiCalls,
      );

      const sessionData = {
        id: sessionId,
        userId,
        startedAt: now,
        expiresAt,
        projectCount: 0,
        apiCallCount: 0,
        syncOperationCount: 0,
        isActive: true,
        metadata: {
          sessionName: input.sessionName || `Sandbox Session ${now.toISOString()}`,
          maxProjects,
          maxApiCalls,
          maxSyncOperations: this.sandboxConfig.maxSyncOperations,
          createdBy: 'sandbox_service',
        },
      };

      // Store session in database (using a dedicated table or user metadata)
      await this.storeSandboxSession(sessionData);

      this.logger.log(`Sandbox session started for user ${userId}`, {
        sessionId,
        expiresAt,
        maxProjects,
        maxApiCalls,
      });

      this.sandboxSessionsCounter.inc({ operation, status: 'success' });
      const operationDuration = (Date.now() - operationStart) / 1000;
      this.sandboxOperationDuration.observe({ operation }, operationDuration);

      // Update usage metrics
      this.updateUsageMetrics(userId, sessionData);

      return sessionData;
    } catch (error) {
      this.sandboxSessionsCounter.inc({ operation, status: 'failure' });
      this.sandboxErrorsCounter.inc({ operation, error_type: 'unknown' });
      this.logger.error(`Failed to start sandbox session for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get active sandbox session for a user
   */
  async getActiveSandboxSession(userId: string): Promise<SandboxSession | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      if (!user?.settings || typeof user.settings !== 'object') {
        return null;
      }

      const settings = user.settings as any;
      const sandboxSession = settings.sandboxSession;

      if (!sandboxSession || !sandboxSession.isActive) {
        return null;
      }

      // Check if session has expired
      const expiresAt = new Date(sandboxSession.expiresAt);
      if (expiresAt < new Date()) {
        await this.expireSandboxSession(userId);
        return null;
      }

      return {
        id: sandboxSession.id,
        userId,
        startedAt: new Date(sandboxSession.startedAt),
        expiresAt,
        projectCount: sandboxSession.projectCount || 0,
        apiCallCount: sandboxSession.apiCallCount || 0,
        syncOperationCount: sandboxSession.syncOperationCount || 0,
        isActive: sandboxSession.isActive,
        metadata: sandboxSession.metadata || {},
      };
    } catch (error) {
      this.logger.error(`Failed to get sandbox session for user ${userId}`, error);
      return null;
    }
  }

  /**
   * Get sandbox usage statistics for a user
   */
  async getSandboxUsage(userId: string): Promise<SandboxUsage | null> {
    const session = await this.getActiveSandboxSession(userId);
    if (!session) {
      return null;
    }

    const metadata = session.metadata as any;
    const timeRemaining = Math.max(0, session.expiresAt.getTime() - Date.now());

    const usage: SandboxUsage = {
      projectsUsed: session.projectCount,
      maxProjects: metadata.maxProjects || this.sandboxConfig.maxProjects,
      apiCallsUsed: session.apiCallCount,
      maxApiCalls: metadata.maxApiCalls || this.sandboxConfig.maxApiCalls,
      syncOperationsUsed: session.syncOperationCount,
      maxSyncOperations: metadata.maxSyncOperations || this.sandboxConfig.maxSyncOperations,
      sessionTimeRemaining: timeRemaining,
    };

    // Update usage metrics
    this.sandboxUsageGauge.set(
      { metric_type: 'projects_used', user_id: userId },
      usage.projectsUsed,
    );
    this.sandboxUsageGauge.set(
      { metric_type: 'api_calls_used', user_id: userId },
      usage.apiCallsUsed,
    );
    this.sandboxUsageGauge.set(
      { metric_type: 'sync_ops_used', user_id: userId },
      usage.syncOperationsUsed,
    );

    return usage;
  }

  /**
   * Check if user is in sandbox mode
   */
  async isUserInSandboxMode(userId: string): Promise<boolean> {
    const session = await this.getActiveSandboxSession(userId);
    return session !== null;
  }

  /**
   * Increment project count for sandbox session
   */
  async incrementProjectCount(userId: string): Promise<void> {
    const session = await this.getActiveSandboxSession(userId);
    if (!session) {
      return;
    }

    const metadata = session.metadata as any;
    const maxProjects = metadata.maxProjects || this.sandboxConfig.maxProjects;

    if (session.projectCount >= maxProjects) {
      throw new ForbiddenException(
        `Sandbox project limit reached (${maxProjects}). Upgrade to production to sync more projects.`,
      );
    }

    await this.updateSessionCount(userId, 'projectCount', session.projectCount + 1);
  }

  /**
   * Increment API call count for sandbox session
   */
  async incrementApiCallCount(userId: string): Promise<void> {
    const session = await this.getActiveSandboxSession(userId);
    if (!session) {
      return;
    }

    const metadata = session.metadata as any;
    const maxApiCalls = metadata.maxApiCalls || this.sandboxConfig.maxApiCalls;

    if (session.apiCallCount >= maxApiCalls) {
      throw new ForbiddenException(
        `Sandbox API call limit reached (${maxApiCalls}). Upgrade to production for unlimited API access.`,
      );
    }

    await this.updateSessionCount(userId, 'apiCallCount', session.apiCallCount + 1);
  }

  /**
   * Increment sync operation count for sandbox session
   */
  async incrementSyncOperationCount(userId: string): Promise<void> {
    const session = await this.getActiveSandboxSession(userId);
    if (!session) {
      return;
    }

    const metadata = session.metadata as any;
    const maxSyncOps = metadata.maxSyncOperations || this.sandboxConfig.maxSyncOperations;

    if (session.syncOperationCount >= maxSyncOps) {
      throw new ForbiddenException(
        `Sandbox sync operation limit reached (${maxSyncOps}). Upgrade to production for unlimited syncing.`,
      );
    }

    await this.updateSessionCount(userId, 'syncOperationCount', session.syncOperationCount + 1);
  }

  /**
   * End sandbox session
   */
  async endSandboxSession(userId: string): Promise<void> {
    const operationStart = Date.now();
    const operation = 'end_session';

    try {
      await this.updateSandboxSession(userId, { isActive: false });

      this.logger.log(`Sandbox session ended for user ${userId}`);
      this.sandboxSessionsCounter.inc({ operation, status: 'success' });

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.sandboxOperationDuration.observe({ operation }, operationDuration);

      // Clear usage metrics
      this.clearUsageMetrics(userId);
    } catch (error) {
      this.sandboxSessionsCounter.inc({ operation, status: 'failure' });
      this.logger.error(`Failed to end sandbox session for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Reset sandbox data for a user
   */
  async resetSandboxData(userId: string, input: ResetSandboxInput = {}): Promise<void> {
    const operationStart = Date.now();
    const operation = 'reset_data';

    try {
      const session = await this.getActiveSandboxSession(userId);
      if (!session) {
        throw new NotFoundException('No active sandbox session found');
      }

      // Reset session counters
      await this.updateSandboxSession(userId, {
        projectCount: 0,
        apiCallCount: 0,
        syncOperationCount: 0,
      });

      // Delete sandbox projects (marked with sandbox metadata)
      await this.prisma.project.deleteMany({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });

      // Reset public profile if it exists and was created in sandbox
      const profile = await this.prisma.publicProfile.findUnique({
        where: { userId },
      });

      if (profile && (profile.settings as any)?.sandbox) {
        await this.prisma.publicProfile.delete({
          where: { userId },
        });
      }

      this.logger.log(`Sandbox data reset for user ${userId}`);
      this.sandboxSessionsCounter.inc({ operation, status: 'success' });

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.sandboxOperationDuration.observe({ operation }, operationDuration);

      // Update usage metrics
      const updatedSession = await this.getActiveSandboxSession(userId);
      if (updatedSession) {
        this.updateUsageMetrics(userId, updatedSession);
      }
    } catch (error) {
      this.sandboxSessionsCounter.inc({ operation, status: 'failure' });
      this.sandboxErrorsCounter.inc({ operation, error_type: 'reset_failed' });
      this.logger.error(`Failed to reset sandbox data for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Migrate sandbox data to production
   */
  async migrateSandboxDataToProduction(
    userId: string,
    options: MigrateSandboxDataInput,
  ): Promise<{
    success: boolean;
    projectsMigrated: number;
    profileMigrated: boolean;
    settingsMigrated: boolean;
    errors: string[];
  }> {
    const operationStart = Date.now();
    const operation = 'migrate_to_production';
    const errors: string[] = [];
    let projectsMigrated = 0;
    let profileMigrated = false;
    let settingsMigrated = false;

    try {
      const session = await this.getActiveSandboxSession(userId);
      if (!session) {
        throw new NotFoundException('No active sandbox session found');
      }

      // Migrate projects
      if (options.includeProjects) {
        try {
          const sandboxProjects = await this.prisma.project.findMany({
            where: {
              ownerId: userId,
              customMetadata: {
                path: ['sandbox'],
                equals: true,
              },
            },
          });

          for (const project of sandboxProjects) {
            try {
              // Remove sandbox flag from metadata
              const updatedMetadata = {
                ...((project.customMetadata as any) || {}),
              };
              delete updatedMetadata.sandbox;

              await this.prisma.project.update({
                where: { id: project.id },
                data: {
                  customMetadata: updatedMetadata,
                  // Mark as production project
                  published: true,
                },
              });

              projectsMigrated++;
            } catch (error) {
              errors.push(
                `Failed to migrate project ${project.title}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
              );
            }
          }
        } catch (error) {
          errors.push(
            `Failed to migrate projects: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
          );
        }
      }

      // Migrate profile
      if (options.includeProfile) {
        try {
          const sandboxProfile = await this.prisma.publicProfile.findUnique({
            where: { userId },
          });

          if (sandboxProfile && (sandboxProfile.settings as any)?.sandbox) {
            // Remove sandbox flag from profile settings
            const updatedSettings = {
              ...((sandboxProfile.settings as any) || {}),
            };
            delete updatedSettings.sandbox;

            await this.prisma.publicProfile.update({
              where: { userId },
              data: {
                settings: updatedSettings,
                isPublic: true, // Make profile public in production
              },
            });

            profileMigrated = true;
          }
        } catch (error) {
          errors.push(
            `Failed to migrate profile: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
          );
        }
      }

      // Migrate settings
      if (options.includeSettings) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { settings: true },
          });

          if (user?.settings) {
            const settings = user.settings as any;
            const sandboxSettings = settings.sandboxSettings || {};

            // Merge sandbox settings with production settings
            const updatedSettings = {
              ...settings,
              ...sandboxSettings,
              // Remove sandbox-specific settings
              sandboxSession: undefined,
              sandboxSettings: undefined,
            };

            await this.prisma.user.update({
              where: { id: userId },
              data: { settings: updatedSettings },
            });

            settingsMigrated = true;
          }
        } catch (error) {
          errors.push(
            `Failed to migrate settings: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
          );
        }
      }

      // End sandbox session after successful migration
      await this.endSandboxSession(userId);

      const success = errors.length === 0;
      this.logger.log(`Sandbox migration completed for user ${userId}`, {
        success,
        projectsMigrated,
        profileMigrated,
        settingsMigrated,
        errors: errors.length,
      });

      this.sandboxSessionsCounter.inc({
        operation,
        status: success ? 'success' : 'partial',
      });

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.sandboxOperationDuration.observe({ operation }, operationDuration);

      return {
        success,
        projectsMigrated,
        profileMigrated,
        settingsMigrated,
        errors,
      };
    } catch (error) {
      this.sandboxSessionsCounter.inc({ operation, status: 'failure' });
      this.sandboxErrorsCounter.inc({
        operation,
        error_type: 'migration_failed',
      });
      this.logger.error(`Failed to migrate sandbox data for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Clean up expired sandbox sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const operationStart = Date.now();
    const operation = 'cleanup_expired';
    let cleanedCount = 0;

    try {
      // Find users with expired sandbox sessions
      const users = await this.prisma.user.findMany({
        where: {
          settings: {
            path: ['sandboxSession', 'isActive'],
            equals: true,
          },
        },
        select: { id: true, settings: true },
      });

      const now = new Date();

      for (const user of users) {
        const settings = user.settings as any;
        const session = settings.sandboxSession;

        if (session && new Date(session.expiresAt) < now) {
          await this.expireSandboxSession(user.id);
          cleanedCount++;
        }
      }

      this.logger.log(`Cleaned up ${cleanedCount} expired sandbox sessions`);

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.sandboxOperationDuration.observe({ operation }, operationDuration);

      return cleanedCount;
    } catch (error) {
      this.sandboxErrorsCounter.inc({
        operation,
        error_type: 'cleanup_failed',
      });
      this.logger.error('Failed to cleanup expired sandbox sessions', error);
      throw error;
    }
  }

  // Private helper methods

  private async storeSandboxSession(session: SandboxSession): Promise<void> {
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        settings: {
          ...(await this.getUserSettings(session.userId)),
          sandboxSession: {
            id: session.id,
            startedAt: session.startedAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
            projectCount: session.projectCount,
            apiCallCount: session.apiCallCount,
            syncOperationCount: session.syncOperationCount,
            isActive: session.isActive,
            metadata: session.metadata,
          },
        },
      },
    });
  }

  private async updateSandboxSession(
    userId: string,
    updates: Partial<SandboxSession>,
  ): Promise<void> {
    const currentSettings = await this.getUserSettings(userId);
    const currentSession = currentSettings.sandboxSession || {};

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        settings: {
          ...currentSettings,
          sandboxSession: {
            ...currentSession,
            ...updates,
          },
        },
      },
    });
  }

  private async updateSessionCount(
    userId: string,
    countType: 'projectCount' | 'apiCallCount' | 'syncOperationCount',
    newValue: number,
  ): Promise<void> {
    await this.updateSandboxSession(userId, { [countType]: newValue });
  }

  private async expireSandboxSession(userId: string): Promise<void> {
    await this.updateSandboxSession(userId, { isActive: false });
    this.clearUsageMetrics(userId);
  }

  private async getUserSettings(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    return (user?.settings as any) || {};
  }

  private updateUsageMetrics(userId: string, session: SandboxSession): void {
    this.sandboxUsageGauge.set(
      { metric_type: 'projects_used', user_id: userId },
      session.projectCount,
    );
    this.sandboxUsageGauge.set(
      { metric_type: 'api_calls_used', user_id: userId },
      session.apiCallCount,
    );
    this.sandboxUsageGauge.set(
      { metric_type: 'sync_ops_used', user_id: userId },
      session.syncOperationCount,
    );
  }

  private clearUsageMetrics(userId: string): void {
    this.sandboxUsageGauge.remove({
      metric_type: 'projects_used',
      user_id: userId,
    });
    this.sandboxUsageGauge.remove({
      metric_type: 'api_calls_used',
      user_id: userId,
    });
    this.sandboxUsageGauge.remove({
      metric_type: 'sync_ops_used',
      user_id: userId,
    });
  }
}
