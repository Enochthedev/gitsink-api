import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from './sandbox.service';
import { SandboxDataService } from './sandbox-data.service';
import { MetricsService } from '../metrics/metrics.service';
import { Counter, Histogram } from 'prom-client';

export interface MigrationResult {
  success: boolean;
  projectsMigrated: number;
  profileMigrated: boolean;
  settingsMigrated: boolean;
  errors: string[];
  warnings: string[];
}

export interface MigrationOptions {
  includeProjects: boolean;
  includeProfile: boolean;
  includeSettings: boolean;
  overwriteExisting: boolean;
  dryRun: boolean;
  validateData: boolean;
}

@Injectable()
export class SandboxMigrationService {
  private readonly logger = new Logger(SandboxMigrationService.name);

  // Metrics
  private readonly migrationCounter: Counter<string>;
  private readonly migrationDuration: Histogram<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxService: SandboxService,
    private readonly sandboxDataService: SandboxDataService,
    private readonly metricsService: MetricsService,
  ) {
    this.migrationCounter = this.metricsService.createCustomCounter(
      'sandbox_migrations_total',
      'Total number of sandbox migrations',
      ['type', 'status'],
    );

    this.migrationDuration = this.metricsService.createCustomHistogram(
      'sandbox_migration_duration_seconds',
      'Duration of sandbox migrations',
      ['type'],
      [0.5, 1, 2, 5, 10, 30],
    );
  }

  /**
   * Migrate sandbox data to production with comprehensive validation
   */
  async migrateToProduction(userId: string, options: MigrationOptions): Promise<MigrationResult> {
    const operationStart = Date.now();
    const operation = 'migrate_to_production';

    try {
      // Validate user has active sandbox session
      const session = await this.sandboxService.getActiveSandboxSession(userId);
      if (!session) {
        throw new BadRequestException('No active sandbox session found');
      }

      this.logger.log(`Starting sandbox migration for user ${userId}`, {
        options,
        sessionId: session.id,
      });

      const result: MigrationResult = {
        success: false,
        projectsMigrated: 0,
        profileMigrated: false,
        settingsMigrated: false,
        errors: [],
        warnings: [],
      };

      // Validate data before migration if requested
      if (options.validateData) {
        const validationResult = await this.validateSandboxData(userId);
        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors);
          result.warnings.push(...validationResult.warnings);

          if (validationResult.errors.length > 0) {
            this.migrationCounter.inc({
              type: operation,
              status: 'validation_failed',
            });
            return result;
          }
        }
      }

      // Perform dry run if requested
      if (options.dryRun) {
        return await this.performDryRun(userId, options);
      }

      // Execute migration steps
      if (options.includeProjects) {
        const projectResult = await this.migrateProjects(userId, options.overwriteExisting);
        result.projectsMigrated = projectResult.migrated;
        result.errors.push(...projectResult.errors);
        result.warnings.push(...projectResult.warnings);
      }

      if (options.includeProfile) {
        const profileResult = await this.migrateProfile(userId, options.overwriteExisting);
        result.profileMigrated = profileResult.migrated;
        result.errors.push(...profileResult.errors);
        result.warnings.push(...profileResult.warnings);
      }

      if (options.includeSettings) {
        const settingsResult = await this.migrateSettings(userId, options.overwriteExisting);
        result.settingsMigrated = settingsResult.migrated;
        result.errors.push(...settingsResult.errors);
        result.warnings.push(...settingsResult.warnings);
      }

      // Determine overall success
      result.success = result.errors.length === 0;

      // Clean up sandbox data if migration was successful
      if (result.success) {
        await this.sandboxDataService.cleanupSandboxData(userId);
        await this.sandboxService.endSandboxSession(userId);
      }

      this.logger.log(`Sandbox migration completed for user ${userId}`, {
        result,
        duration: Date.now() - operationStart,
      });

      this.migrationCounter.inc({
        type: operation,
        status: result.success ? 'success' : 'partial',
      });

      const operationDuration = (Date.now() - operationStart) / 1000;
      this.migrationDuration.observe({ type: operation }, operationDuration);

      return result;
    } catch (error) {
      this.logger.error(`Sandbox migration failed for user ${userId}`, error);
      this.migrationCounter.inc({ type: operation, status: 'error' });
      throw error;
    }
  }

  /**
   * Validate sandbox data before migration
   */
  async validateSandboxData(userId: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for sandbox projects
      const sandboxProjects = await this.prisma.project.findMany({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });

      if (sandboxProjects.length === 0) {
        warnings.push('No sandbox projects found to migrate');
      }

      // Validate project data
      for (const project of sandboxProjects) {
        if (!project.title || project.title.trim() === '') {
          errors.push(`Project ${project.id} has empty title`);
        }

        if (!project.repoUrl || !this.isValidUrl(project.repoUrl)) {
          errors.push(`Project ${project.title} has invalid repository URL`);
        }

        // Check for potential conflicts with existing production projects
        const existingProject = await this.prisma.project.findFirst({
          where: {
            ownerId: userId,
            repoUrl: project.repoUrl,
            customMetadata: {
              path: ['sandbox'],
              not: true,
            },
          },
        });

        if (existingProject) {
          warnings.push(`Project ${project.title} conflicts with existing production project`);
        }
      }

      // Check sandbox profile
      const sandboxProfile = await this.prisma.publicProfile.findUnique({
        where: { userId },
      });

      if (sandboxProfile && (sandboxProfile.settings as any)?.sandbox) {
        if (!sandboxProfile.username || sandboxProfile.username.trim() === '') {
          errors.push('Sandbox profile has empty username');
        }

        // Check for username conflicts
        const existingProfile = await this.prisma.publicProfile.findFirst({
          where: {
            username: sandboxProfile.username,
            userId: { not: userId },
          },
        });

        if (existingProfile) {
          errors.push(`Username ${sandboxProfile.username} is already taken`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(
        `Validation failed: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
      );
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Perform a dry run migration to preview changes
   */
  async performDryRun(userId: string, options: MigrationOptions): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      projectsMigrated: 0,
      profileMigrated: false,
      settingsMigrated: false,
      errors: [],
      warnings: ['This is a dry run - no actual changes were made'],
    };

    if (options.includeProjects) {
      const sandboxProjects = await this.prisma.project.count({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });
      result.projectsMigrated = sandboxProjects;
      result.warnings.push(`Would migrate ${sandboxProjects} projects`);
    }

    if (options.includeProfile) {
      const sandboxProfile = await this.prisma.publicProfile.findUnique({
        where: { userId },
      });

      if (sandboxProfile && (sandboxProfile.settings as any)?.sandbox) {
        result.profileMigrated = true;
        result.warnings.push('Would migrate sandbox profile to production');
      }
    }

    if (options.includeSettings) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      if (user?.settings && (user.settings as any).sandboxSettings) {
        result.settingsMigrated = true;
        result.warnings.push('Would migrate sandbox settings to production');
      }
    }

    return result;
  }

  /**
   * Create a backup of production data before migration
   */
  async createProductionBackup(userId: string): Promise<{
    backupId: string;
    projectsBackedUp: number;
    profileBackedUp: boolean;
    settingsBackedUp: boolean;
  }> {
    const backupId = `backup_${userId}_${Date.now()}`;

    // Store backup in user settings
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    const currentSettings = (user?.settings as any) || {};
    const backupData = {
      projects: [],
      profile: null,
      settings: null,
      createdAt: new Date().toISOString(),
    };

    // Backup existing production projects
    const productionProjects = await this.prisma.project.findMany({
      where: {
        ownerId: userId,
        customMetadata: {
          path: ['sandbox'],
          not: true,
        },
      },
    });

    (backupData as any).projects = productionProjects.map(p => ({
      id: p.id,
      title: p.title,
      repoUrl: p.repoUrl,
      customMetadata: p.customMetadata,
    }));

    // Backup existing production profile
    const productionProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (productionProfile && !(productionProfile.settings as any)?.sandbox) {
      (backupData as any).profile = {
        username: productionProfile.username,
        displayName: productionProfile.displayName,
        bio: productionProfile.bio,
        settings: productionProfile.settings,
      };
    }

    // Backup current settings (excluding sandbox data)
    const { sandboxSession, sandboxSettings, ...productionSettings } = currentSettings;
    backupData.settings = productionSettings;

    // Store backup
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        settings: {
          ...currentSettings,
          [`backup_${backupId}`]: backupData,
        },
      },
    });

    this.logger.log(`Created production backup for user ${userId}`, {
      backupId,
      projectsCount: backupData.projects.length,
      hasProfile: !!backupData.profile,
    });

    return {
      backupId,
      projectsBackedUp: backupData.projects.length,
      profileBackedUp: !!backupData.profile,
      settingsBackedUp: Object.keys((backupData as any).settings || {}).length > 0,
    };
  }

  /**
   * Restore from a production backup
   */
  async restoreFromBackup(userId: string, backupId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      const settings = (user?.settings as any) || {};
      const backupData = settings[`backup_${backupId}`];

      if (!backupData) {
        throw new BadRequestException(`Backup ${backupId} not found`);
      }

      // Restore projects (remove current sandbox projects first)
      await this.prisma.project.deleteMany({
        where: {
          ownerId: userId,
          customMetadata: {
            path: ['sandbox'],
            equals: true,
          },
        },
      });

      // Restore profile
      if (backupData.profile) {
        await this.prisma.publicProfile.upsert({
          where: { userId },
          create: {
            userId,
            ...backupData.profile,
          },
          update: backupData.profile,
        });
      }

      // Restore settings
      const { [`backup_${backupId}`]: removedBackup, ...otherSettings } = settings;
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          settings: {
            ...backupData.settings,
            ...otherSettings,
          },
        },
      });

      this.logger.log(`Restored from backup ${backupId} for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to restore backup ${backupId} for user ${userId}`, error);
      return false;
    }
  }

  // Private helper methods

  private async migrateProjects(
    userId: string,
    overwriteExisting: boolean,
  ): Promise<{
    migrated: number;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let migrated = 0;

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
          // Check for conflicts
          const existingProject = await this.prisma.project.findFirst({
            where: {
              ownerId: userId,
              repoUrl: project.repoUrl,
              customMetadata: {
                path: ['sandbox'],
                not: true,
              },
            },
          });

          if (existingProject && !overwriteExisting) {
            warnings.push(`Skipped project ${project.title} - conflicts with existing project`);
            continue;
          }

          // Remove sandbox flag and migrate
          const updatedMetadata = { ...(project.customMetadata as any) };
          delete updatedMetadata.sandbox;

          if (existingProject && overwriteExisting) {
            await this.prisma.project.update({
              where: { id: existingProject.id },
              data: {
                title: project.title,
                description: project.description,
                tags: project.tags,
                customMetadata: updatedMetadata,
                published: true,
              },
            });
          } else {
            await this.prisma.project.update({
              where: { id: project.id },
              data: {
                customMetadata: updatedMetadata,
                published: true,
              },
            });
          }

          migrated++;
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

    return { migrated, errors, warnings };
  }

  private async migrateProfile(
    userId: string,
    overwriteExisting: boolean,
  ): Promise<{
    migrated: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let migrated = false;

    try {
      const sandboxProfile = await this.prisma.publicProfile.findUnique({
        where: { userId },
      });

      if (sandboxProfile && (sandboxProfile.settings as any)?.sandbox) {
        // Remove sandbox flag
        const updatedSettings = { ...(sandboxProfile.settings as any) };
        delete updatedSettings.sandbox;

        await this.prisma.publicProfile.update({
          where: { userId },
          data: {
            settings: updatedSettings,
            isPublic: true,
          },
        });

        migrated = true;
      }
    } catch (error) {
      errors.push(
        `Failed to migrate profile: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
      );
    }

    return { migrated, errors, warnings };
  }

  private async migrateSettings(
    userId: string,
    overwriteExisting: boolean,
  ): Promise<{
    migrated: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let migrated = false;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      if (user?.settings) {
        const settings = user.settings as any;
        const sandboxSettings = settings.sandboxSettings || {};

        if (Object.keys(sandboxSettings).length > 0) {
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

          migrated = true;
        }
      }
    } catch (error) {
      errors.push(
        `Failed to migrate settings: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
      );
    }

    return { migrated, errors, warnings };
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
