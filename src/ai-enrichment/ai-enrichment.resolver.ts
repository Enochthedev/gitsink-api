import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Inject, UseGuards } from '@nestjs/common';
import { AIEnrichmentService } from './ai-enrichment.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { AIAnalysisResult } from './entities/ai-analysis.entity';
import {
  BulkEnrichmentInput,
  BulkEnrichmentResult,
  EnrichmentJob,
  TriggerEnrichmentInput,
} from './dto/enrichment-graphql.dto';
import { PubSub } from 'graphql-subscriptions';
import { EnrichmentStatusUpdate } from '../common/dto/subscription.dto';

@Resolver(() => AIAnalysisResult)
export class AIEnrichmentResolver {
  constructor(
    private readonly aiEnrichmentService: AIEnrichmentService,
    @Inject('PUB_SUB') private pubSub: PubSub,
  ) {}

  @Query(() => AIAnalysisResult, { nullable: true })
  @UseGuards(EnhancedJwtGuard)
  async projectAnalysis(
    @Args('projectId') projectId: string,
    @Context() context: any,
  ): Promise<AIAnalysisResult | null> {
    const userId = context.req.user.id;
    return this.aiEnrichmentService.getAnalysisForProject(projectId, userId);
  }

  @Query(() => [AIAnalysisResult])
  @UseGuards(EnhancedJwtGuard)
  async userProjectAnalyses(
    @Args('limit', { defaultValue: 20 }) limit: number,
    @Args('offset', { defaultValue: 0 }) offset: number,
    @Context() context: any,
  ): Promise<AIAnalysisResult[]> {
    const userId = context.req.user.id;
    return this.aiEnrichmentService.getUserAnalyses(userId, limit, offset);
  }

  @Query(() => [AIAnalysisResult])
  async recentAnalyses(
    @Args('limit', { defaultValue: 10 }) limit: number,
  ): Promise<AIAnalysisResult[]> {
    return this.aiEnrichmentService.getRecentAnalyses(limit);
  }

  @Mutation(() => EnrichmentJob)
  @UseGuards(EnhancedJwtGuard)
  async triggerEnrichment(
    @Args('input') input: TriggerEnrichmentInput,
    @Context() context: any,
  ): Promise<EnrichmentJob> {
    const userId = context.req.user.id;
    const job = await this.aiEnrichmentService.triggerEnrichment(
      input.projectId,
      userId,
      input.forceReanalysis,
      input.analysisTypes,
    );

    // Publish enrichment status update
    this.pubSub.publish('enrichmentStatus', {
      enrichmentStatus: {
        jobId: job.id,
        projectId: input.projectId,
        status: 'pending',
        timestamp: new Date(),
      },
    });

    return job;
  }

  @Mutation(() => BulkEnrichmentResult)
  @UseGuards(EnhancedJwtGuard)
  async bulkTriggerEnrichment(
    @Args('input') input: BulkEnrichmentInput,
    @Context() context: any,
  ): Promise<BulkEnrichmentResult> {
    const userId = context.req.user.id;
    return this.aiEnrichmentService.bulkTriggerEnrichment(
      input.projectIds,
      userId,
      input.forceReanalysis,
      input.analysisTypes,
    );
  }

  @Query(() => [EnrichmentJob])
  @UseGuards(EnhancedJwtGuard)
  async enrichmentJobs(
    @Args('status', { nullable: true }) status?: string,
    @Args('limit', { defaultValue: 20 }) limit?: number,
    @Args('offset', { defaultValue: 0 }) offset?: number,
    @Context() context?: any,
  ): Promise<EnrichmentJob[]> {
    const userId = context.req.user.id;
    return this.aiEnrichmentService.getEnrichmentJobs(userId, status, limit, offset);
  }

  @Subscription(() => EnrichmentStatusUpdate, {
    filter: (payload, variables, context) => {
      return payload.enrichmentStatus.projectId === variables.projectId;
    },
  })
  enrichmentStatus(@Args('projectId') projectId: string) {
    return (this.pubSub as any).asyncIterator('enrichmentStatus');
  }

  @Subscription(() => EnrichmentStatusUpdate, {
    filter: (payload, variables, context) => {
      // Filter by user's projects only
      return context.userId && payload.enrichmentStatus.userId === context.userId;
    },
  })
  @UseGuards(EnhancedJwtGuard)
  userEnrichmentUpdates(@Context() context: any) {
    return (this.pubSub as any).asyncIterator('enrichmentStatus');
  }
}
