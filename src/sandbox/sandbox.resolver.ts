import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { BadRequestException, Logger, UseGuards } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { SandboxService } from './sandbox.service';
import { SandboxDataService } from './sandbox-data.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestWithUser } from '../auth/request-with-user';
import {
  MigrateSandboxDataInput,
  ResetSandboxInput,
  StartSandboxSessionInput,
} from './dto/sandbox.dto';
import { SandboxRepository, SandboxSession, SandboxUsage } from './entities/sandbox-session.entity';
import { AllowSandbox, RequireSandbox } from './sandbox.guard';

@Resolver()
@UseGuards(ApiKeyGuard)
export class SandboxResolver {
  private readonly logger = new Logger(SandboxResolver.name);
  private readonly pubSub = new PubSub();

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly sandboxDataService: SandboxDataService,
  ) {}

  @Mutation(() => SandboxSession)
  async startSandboxSession(
    @Args('input') input: StartSandboxSessionInput,
    @Context() context: { req: RequestWithUser },
  ): Promise<SandboxSession> {
    const userId = context.req.userId;
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

    // Publish session started event
    this.pubSub.publish('sandboxSessionStarted', {
      sandboxSessionStarted: session,
      userId,
    });

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

  @Query(() => SandboxSession, { nullable: true })
  @AllowSandbox()
  async currentSandboxSession(
    @Context() context: { req: RequestWithUser },
  ): Promise<SandboxSession | null> {
    const userId = context.req.userId;
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

  @Query(() => SandboxUsage, { nullable: true })
  @RequireSandbox()
  async sandboxUsage(@Context() context: { req: RequestWithUser }): Promise<SandboxUsage | null> {
    const userId = context.req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    const usage = await this.sandboxService.getSandboxUsage(userId);
    if (!usage) {
      return null;
    }

    return usage;
  }

  @Query(() => [SandboxRepository])
  @RequireSandbox()
  async sandboxRepositories(): Promise<SandboxRepository[]> {
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

  @Mutation(() => Boolean)
  @RequireSandbox()
  async resetSandboxData(
    @Args('input') input: ResetSandboxInput,
    @Context() context: { req: RequestWithUser },
  ): Promise<boolean> {
    const userId = context.req.userId;
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

    // Publish reset event
    this.pubSub.publish('sandboxDataReset', {
      sandboxDataReset: true,
      userId,
    });

    return true;
  }

  @Mutation(() => String)
  @RequireSandbox()
  async migrateSandboxToProduction(
    @Args('input') input: MigrateSandboxDataInput,
    @Context() context: { req: RequestWithUser },
  ): Promise<string> {
    const userId = context.req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Migrating sandbox data to production for user ${userId}`, input);

    const result = await this.sandboxService.migrateSandboxDataToProduction(userId, input);

    // Publish migration event
    this.pubSub.publish('sandboxMigrated', {
      sandboxMigrated: result,
      userId,
    });

    return JSON.stringify(result);
  }

  @Mutation(() => Boolean)
  @RequireSandbox()
  async endSandboxSession(@Context() context: { req: RequestWithUser }): Promise<boolean> {
    const userId = context.req.userId;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }

    this.logger.log(`Ending sandbox session for user ${userId}`);

    // Clean up sandbox data
    await this.sandboxDataService.cleanupSandboxData(userId);

    // End the session
    await this.sandboxService.endSandboxSession(userId);

    // Publish session ended event
    this.pubSub.publish('sandboxSessionEnded', {
      sandboxSessionEnded: true,
      userId,
    });

    return true;
  }

  @Query(() => String)
  @AllowSandbox()
  async sandboxConfig(): Promise<string> {
    const config = this.sandboxService.getSandboxConfig();
    return JSON.stringify(config);
  }

  @Query(() => String)
  @AllowSandbox()
  async sandboxStatus(@Context() context: { req: RequestWithUser }): Promise<string> {
    const userId = context.req.userId;
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

    const status = {
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

    return JSON.stringify(status);
  }

  // Subscriptions for real-time updates

  @Subscription(() => SandboxSession, {
    filter: (payload, variables, context) => {
      return payload.userId === context.req.userId;
    },
  })
  sandboxSessionStarted(@Context() context: { req: RequestWithUser }) {
    return (this.pubSub as any).asyncIterator('sandboxSessionStarted');
  }

  @Subscription(() => Boolean, {
    filter: (payload, variables, context) => {
      return payload.userId === context.req.userId;
    },
  })
  sandboxSessionEnded(@Context() context: { req: RequestWithUser }) {
    return (this.pubSub as any).asyncIterator('sandboxSessionEnded');
  }

  @Subscription(() => Boolean, {
    filter: (payload, variables, context) => {
      return payload.userId === context.req.userId;
    },
  })
  sandboxDataReset(@Context() context: { req: RequestWithUser }) {
    return (this.pubSub as any).asyncIterator('sandboxDataReset');
  }

  @Subscription(() => String, {
    filter: (payload, variables, context) => {
      return payload.userId === context.req.userId;
    },
  })
  sandboxMigrated(@Context() context: { req: RequestWithUser }) {
    return (this.pubSub as any).asyncIterator('sandboxMigrated');
  }

  @Subscription(() => SandboxUsage, {
    filter: (payload, variables, context) => {
      return payload.userId === context.req.userId;
    },
  })
  sandboxUsageUpdated(@Context() context: { req: RequestWithUser }) {
    return (this.pubSub as any).asyncIterator('sandboxUsageUpdated');
  }
}
