import { Injectable, Logger } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxDataService } from './sandbox-data.service';
import { SandboxMigrationService } from './sandbox-migration.service';
import { SandboxIsolationService } from './sandbox-isolation.service';

export interface CLICommand {
  name: string;
  description: string;
  args: string[];
  execute: (...args: any[]) => Promise<any>;
}

@Injectable()
export class SandboxCLIService {
  private readonly logger = new Logger(SandboxCLIService.name);

  private readonly commands: CLICommand[] = [
    {
      name: 'start-session',
      description: 'Start a new sandbox session for a user',
      args: ['userId', 'maxProjects?', 'maxApiCalls?'],
      execute: this.startSession.bind(this),
    },
    {
      name: 'end-session',
      description: 'End sandbox session for a user',
      args: ['userId'],
      execute: this.endSession.bind(this),
    },
    {
      name: 'get-status',
      description: 'Get sandbox status for a user',
      args: ['userId'],
      execute: this.getStatus.bind(this),
    },
    {
      name: 'cleanup-expired',
      description: 'Clean up all expired sandbox sessions',
      args: [],
      execute: this.cleanupExpired.bind(this),
    },
    {
      name: 'validate-data',
      description: 'Validate sandbox data integrity for a user',
      args: ['userId'],
      execute: this.validateData.bind(this),
    },
    {
      name: 'migrate-to-production',
      description: 'Migrate sandbox data to production',
      args: ['userId', 'includeProjects?', 'includeProfile?', 'includeSettings?'],
      execute: this.migrateToProduction.bind(this),
    },
    {
      name: 'get-stats',
      description: 'Get sandbox data statistics for a user',
      args: ['userId'],
      execute: this.getStats.bind(this),
    },
    {
      name: 'reset-data',
      description: 'Reset sandbox data for a user',
      args: ['userId'],
      execute: this.resetData.bind(this),
    },
  ];

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly sandboxDataService: SandboxDataService,
    private readonly sandboxMigrationService: SandboxMigrationService,
    private readonly sandboxIsolationService: SandboxIsolationService,
  ) {}

  /**
   * Get list of available commands
   */
  getCommands(): CLICommand[] {
    return this.commands;
  }

  /**
   * Execute a CLI command
   */
  async executeCommand(commandName: string, ...args: any[]): Promise<any> {
    const command = this.commands.find(cmd => cmd.name === commandName);
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    this.logger.log(`Executing command: ${commandName}`, { args });

    try {
      const result = await command.execute(...args);
      this.logger.log(`Command ${commandName} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(`Command ${commandName} failed`, error);
      throw error;
    }
  }

  /**
   * Get help text for all commands
   */
  getHelp(): string {
    let help = 'Available Sandbox CLI Commands:\n\n';

    for (const command of this.commands) {
      help += `${command.name} ${command.args.join(' ')}\n`;
      help += `  ${command.description}\n\n`;
    }

    return help;
  }

  // Command implementations

  private async startSession(
    userId: string,
    maxProjects?: number,
    maxApiCalls?: number,
  ): Promise<any> {
    const session = await this.sandboxService.startSandboxSession(userId, {
      maxProjects: maxProjects ? parseInt(maxProjects.toString()) : undefined,
      maxApiCalls: maxApiCalls ? parseInt(maxApiCalls.toString()) : undefined,
    });

    // Generate test data
    const testRepositories = this.sandboxDataService.generateTestRepositories(maxProjects || 10);
    const testUser = this.sandboxDataService.generateTestUser();

    await Promise.all([
      this.sandboxDataService.createSandboxProjects(userId, testRepositories),
      this.sandboxDataService.createSandboxProfile(userId, testUser),
    ]);

    return {
      message: 'Sandbox session started successfully',
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
        maxProjects: (session.metadata as any).maxProjects,
        maxApiCalls: (session.metadata as any).maxApiCalls,
      },
      testDataCreated: {
        projects: testRepositories.length,
        profile: true,
      },
    };
  }

  private async endSession(userId: string): Promise<any> {
    await this.sandboxDataService.cleanupSandboxData(userId);
    await this.sandboxService.endSandboxSession(userId);

    return {
      message: 'Sandbox session ended and data cleaned up successfully',
    };
  }

  private async getStatus(userId: string): Promise<any> {
    const session = await this.sandboxService.getActiveSandboxSession(userId);
    const usage = session ? await this.sandboxService.getSandboxUsage(userId) : null;
    const stats = session ? await this.sandboxIsolationService.getSandboxDataStats(userId) : null;

    return {
      isInSandbox: !!session,
      session: session
        ? {
            id: session.id,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            isActive: session.isActive,
          }
        : null,
      usage,
      dataStats: stats,
    };
  }

  private async cleanupExpired(): Promise<any> {
    const cleanedCount = await this.sandboxService.cleanupExpiredSessions();

    return {
      message: `Cleaned up ${cleanedCount} expired sandbox sessions`,
      cleanedCount,
    };
  }

  private async validateData(userId: string): Promise<any> {
    const validationResult = await this.sandboxMigrationService.validateSandboxData(userId);
    const integrityResult = await this.sandboxIsolationService.validateDataIntegrity(userId);

    return {
      dataValidation: validationResult,
      integrityCheck: integrityResult,
      overallValid: validationResult.isValid && integrityResult.isValid,
    };
  }

  private async migrateToProduction(
    userId: string,
    includeProjects: string = 'true',
    includeProfile: string = 'true',
    includeSettings: string = 'true',
  ): Promise<any> {
    const options = {
      includeProjects: includeProjects.toLowerCase() === 'true',
      includeProfile: includeProfile.toLowerCase() === 'true',
      includeSettings: includeSettings.toLowerCase() === 'true',
      overwriteExisting: false,
      dryRun: false,
      validateData: true,
    };

    const result = await this.sandboxMigrationService.migrateToProduction(userId, options);

    return {
      message: result.success
        ? 'Migration completed successfully'
        : 'Migration completed with issues',
      result,
    };
  }

  private async getStats(userId: string): Promise<any> {
    const stats = await this.sandboxIsolationService.getSandboxDataStats(userId);
    const session = await this.sandboxService.getActiveSandboxSession(userId);
    const usage = session ? await this.sandboxService.getSandboxUsage(userId) : null;

    return {
      dataStats: stats,
      sessionInfo: session
        ? {
            id: session.id,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            timeRemaining: session.expiresAt.getTime() - Date.now(),
          }
        : null,
      usage,
    };
  }

  private async resetData(userId: string): Promise<any> {
    await this.sandboxService.resetSandboxData(userId);

    // Regenerate test data
    const testRepositories = this.sandboxDataService.generateTestRepositories(10);
    const testUser = this.sandboxDataService.generateTestUser();

    await Promise.all([
      this.sandboxDataService.createSandboxProjects(userId, testRepositories),
      this.sandboxDataService.createSandboxProfile(userId, testUser),
    ]);

    return {
      message: 'Sandbox data reset and regenerated successfully',
      newDataCreated: {
        projects: testRepositories.length,
        profile: true,
      },
    };
  }
}
