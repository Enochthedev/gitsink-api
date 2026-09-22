import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { SandboxDataService } from './sandbox-data.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';
import {
  MigrateSandboxDataInput,
  ResetSandboxInput,
  SandboxMigrationResultDto,
  SandboxRepositoryDto,
  SandboxSessionDto,
  SandboxUsageDto,
  StartSandboxSessionInput,
} from './dto/sandbox.dto';
import { AllowSandbox, DisableSandbox, RequireSandbox } from './sandbox.guard';

@ApiTags('Sandbox')
@Controller('sandbox')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ApiSecurity('x-api-key')
export class SandboxController {
  private readonly logger = new Logger(SandboxController.name);

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly sandboxDataService: SandboxDataService,
  ) {}

  @Post('session/start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a new sandbox session',
    description: 'Creates a new sandbox session with test data and usage limits',
  })
  @ApiResponse({
    status: 201,
    description: 'Sandbox session started successfully',
    type: SandboxSessionDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 403, description: 'Sandbox mode is disabled' })
  async startSession(
    @Req() req: RequestWithUser,
    @Body() input: StartSandboxSessionInput,
  ): Promise<SandboxSessionDto> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Starting sandbox session for user ${userId}`, input);

    const session = await this.sandboxService.startSandboxSession(userId, input);

    // Generate and create test data
    const testRepositories = this.sandboxDataService.generateTestRepositories(
      input.maxProjects || 10,
    );
    const testUser = this.sandboxDataService.generateTestUser();

    // Create sandbox projects and profile
    await Promise.all([
      this.sandboxDataService.createSandboxProjects(userId, testRepositories),
      this.sandboxDataService.createSandboxProfile(userId, testUser),
    ]);

    return {
      id: session.id,
      userId: session.userId,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      projectCount: session.projectCount,
      apiCallCount: session.apiCallCount,
      syncOperationCount: session.syncOperationCount,
      isActive: session.isActive,
      metadata: JSON.stringify(session.metadata),
    };
  }

  @Get('session')
  @ApiOperation({
    summary: 'Get current sandbox session',
    description: 'Retrieves information about the current active sandbox session',
  })
  @ApiResponse({
    status: 200,
    description: 'Current sandbox session information',
    type: SandboxSessionDto,
  })
  @ApiResponse({ status: 404, description: 'No active sandbox session found' })
  @AllowSandbox()
  async getCurrentSession(@Req() req: RequestWithUser): Promise<SandboxSessionDto | null> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    const session = await this.sandboxService.getActiveSandboxSession(userId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      projectCount: session.projectCount,
      apiCallCount: session.apiCallCount,
      syncOperationCount: session.syncOperationCount,
      isActive: session.isActive,
      metadata: JSON.stringify(session.metadata),
    };
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Get sandbox usage statistics',
    description: 'Retrieves current usage statistics for the active sandbox session',
  })
  @ApiResponse({
    status: 200,
    description: 'Sandbox usage statistics',
    type: SandboxUsageDto,
  })
  @ApiResponse({ status: 404, description: 'No active sandbox session found' })
  @RequireSandbox()
  async getUsage(@Req() req: RequestWithUser): Promise<SandboxUsageDto> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    const usage = await this.sandboxService.getSandboxUsage(userId);
    if (!usage) {
      throw new BadRequestException('No active sandbox session found');
    }

    return usage;
  }

  @Get('repositories')
  @ApiOperation({
    summary: 'Get sandbox test repositories',
    description: 'Retrieves a list of test repositories available in sandbox mode',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sandbox test repositories',
    type: [SandboxRepositoryDto],
  })
  @RequireSandbox()
  async getTestRepositories(): Promise<SandboxRepositoryDto[]> {
    const repositories = this.sandboxDataService.generateTestRepositories(20);

    return repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      htmlUrl: repo.htmlUrl,
      cloneUrl: repo.cloneUrl,
      defaultBranch: repo.defaultBranch,
      language: repo.language,
      topics: repo.topics,
      starCount: repo.starCount,
      forkCount: repo.forkCount,
      isPrivate: repo.isPrivate,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      platform: repo.platform,
      portfolioContent: repo.portfolioContent,
      readmeContent: repo.readmeContent,
    }));
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset sandbox data',
    description: 'Resets all sandbox data while keeping the session active',
  })
  @ApiResponse({ status: 200, description: 'Sandbox data reset successfully' })
  @ApiResponse({ status: 404, description: 'No active sandbox session found' })
  @RequireSandbox()
  async resetSandboxData(
    @Req() req: RequestWithUser,
    @Body() input: ResetSandboxInput,
  ): Promise<{ message: string }> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Resetting sandbox data for user ${userId}`, input);

    await this.sandboxService.resetSandboxData(userId, input);

    // Regenerate test data if session should continue
    if (input.keepSession !== false) {
      const testRepositories = this.sandboxDataService.generateTestRepositories(10);
      const testUser = this.sandboxDataService.generateTestUser();

      await Promise.all([
        this.sandboxDataService.createSandboxProjects(userId, testRepositories),
        this.sandboxDataService.createSandboxProfile(userId, testUser),
      ]);
    }

    return { message: 'Sandbox data reset successfully' };
  }

  @Post('migrate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Migrate sandbox data to production',
    description: 'Migrates sandbox projects and profile data to production environment',
  })
  @ApiResponse({
    status: 200,
    description: 'Migration completed',
    type: SandboxMigrationResultDto,
  })
  @ApiResponse({ status: 404, description: 'No active sandbox session found' })
  @RequireSandbox()
  async migrateToProduction(
    @Req() req: RequestWithUser,
    @Body() input: MigrateSandboxDataInput,
  ): Promise<SandboxMigrationResultDto> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Migrating sandbox data to production for user ${userId}`, input);

    const result = await this.sandboxService.migrateSandboxDataToProduction(userId, input);

    return result;
  }

  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End sandbox session',
    description: 'Ends the current sandbox session and cleans up test data',
  })
  @ApiResponse({
    status: 204,
    description: 'Sandbox session ended successfully',
  })
  @ApiResponse({ status: 404, description: 'No active sandbox session found' })
  @RequireSandbox()
  async endSession(@Req() req: RequestWithUser): Promise<void> {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Ending sandbox session for user ${userId}`);

    // Clean up sandbox data
    await this.sandboxDataService.cleanupSandboxData(userId);

    // End the session
    await this.sandboxService.endSandboxSession(userId);
  }

  @Get('config')
  @ApiOperation({
    summary: 'Get sandbox configuration',
    description: 'Retrieves the current sandbox configuration and limits',
  })
  @ApiResponse({ status: 200, description: 'Sandbox configuration' })
  @AllowSandbox()
  async getConfig() {
    return this.sandboxService.getSandboxConfig();
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check sandbox status',
    description: 'Checks if sandbox mode is enabled and user session status',
  })
  @ApiResponse({ status: 200, description: 'Sandbox status information' })
  @AllowSandbox()
  async getStatus(@Req() req: RequestWithUser) {
    const userId = req.userId;
    const isEnabled = this.sandboxService.isSandboxEnabled();

    let isInSandbox = false;
    let session: any = null;
    let usage: any = null;

    if (userId && isEnabled) {
      isInSandbox = await this.sandboxService.isUserInSandboxMode(userId);
      if (isInSandbox) {
        session = await this.sandboxService.getActiveSandboxSession(userId);
        usage = await this.sandboxService.getSandboxUsage(userId);
      }
    }

    return {
      sandboxEnabled: isEnabled,
      userInSandbox: isInSandbox,
      session: session
        ? {
            id: session.id,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            isActive: session.isActive,
          }
        : null,
      usage,
    };
  }
}
