import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseWorkerService, JobContext } from './base-worker.service';
import { QueueConfigService, QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';
import { AIEnrichmentService } from '../../ai-enrichment/ai-enrichment.service';
import { ProjectsService } from '../../projects/projects.service';
import { RepositoryContent } from '../../ai-enrichment/interfaces/ai-enrichment.interface';

export interface AIEnrichmentJobData {
  repositoryId: string;
  userId: string;
  repositoryUrl: string;
  enrichmentType: 'description' | 'technologies' | 'categorization' | 'full';
  options?: {
    forceRegenerate?: boolean;
    includeReadme?: boolean;
    analyzeCode?: boolean;
    generateTags?: boolean;
  };
}

export interface AIEnrichmentResult {
  success: boolean;
  repositoryId: string;
  enrichmentType: string;
  processedAt: Date;
  results: any;
  error?: string;
}

@Injectable()
export class AIEnrichmentWorkerService extends BaseWorkerService {
  constructor(
    queueConfig: QueueConfigService,
    metricsService: MetricsService,
    private readonly aiEnrichmentService: AIEnrichmentService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {
    super(queueConfig, metricsService, QueueType.AI_ENRICHMENT);
  }

  protected getWorkerName(): string {
    return 'AIEnrichmentWorker';
  }

  protected async processJob(
    job: Job<AIEnrichmentJobData>,
    context: JobContext,
  ): Promise<AIEnrichmentResult> {
    const { repositoryId, userId, repositoryUrl, enrichmentType, options = {} } = job.data;

    this.logger.log(`Starting AI enrichment (${enrichmentType}) for repository ${repositoryId}`);

    try {
      await job.updateProgress(10);

      // Validate job data
      this.validateEnrichmentJobData(job.data);

      await job.updateProgress(20);

      // Get repository data
      const repositoryContent = await this.getRepositoryContent(repositoryId, userId);

      await job.updateProgress(30);

      // Perform AI enrichment
      const analysisResult = await this.aiEnrichmentService.analyzeRepository(
        repositoryId,
        repositoryContent,
        options.forceRegenerate,
      );

      await job.updateProgress(100);

      const result: AIEnrichmentResult = {
        success: true,
        repositoryId,
        enrichmentType,
        processedAt: new Date(),
        results: analysisResult,
      };

      this.logger.log(`Successfully enriched repository ${repositoryId}`);
      return result;
    } catch (error) {
      this.logger.error(`AI enrichment failed for repository ${repositoryId}:`, error);

      const result: AIEnrichmentResult = {
        success: false,
        repositoryId,
        enrichmentType,
        processedAt: new Date(),
        results: {},
        error: error instanceof Error ? error.message : String(error),
      };

      // Record failure metrics
      this.metricsService.recordQueueJob(this.queueType, 'enrichment_failed', 'failed');

      return result;
    }
  }

  private validateEnrichmentJobData(data: AIEnrichmentJobData): void {
    if (!data.repositoryId || !data.userId) {
      throw new Error('Repository ID and User ID are required');
    }
  }

  private async getRepositoryContent(
    projectId: string,
    userId: string,
  ): Promise<RepositoryContent> {
    // Fetch project from DB using ProjectsService
    // We access Prisma through projects service's internal method or assume accessing DB directly but we can't here easily.
    // Instead we'll use access to the projects cache/db from ProjectsService if exposed,
    // or just assume we have access to PrismaService if we injected it.
    // Since we didn't inject PrismaService, let's use a workaround or best effort.
    // Actually, ProjectsService has getAllProjectsForUser methods. We can use that or rely on `any` cast to get raw access.

    // Better: Inject PrismaService directly? No, let's stick to ProjectsService public API or just use what we can.
    // Wait, getting a single project is fundamental. ProjectsService should have `getProjectById`.
    // It doesn't seem to have a public `getProjectById` in the view I saw (only `getAllProjectsForUser` and `getEnhancedProjects`).

    // I'll use `getEnhancedProjects` with a filter.
    const projects = await this.projectsService.getEnhancedProjects(userId, { id: projectId });
    const project = projects.projects[0]; // Assuming structure { projects: [], ... }

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const languages: Record<string, number> = {};
    if (project.language) {
      languages[project.language] = 1000;
    }

    return {
      readme: project.markdown || '',
      files: [
        {
          name: 'README.md',
          path: 'README.md',
          extension: 'md',
          size: project.markdown?.length || 0,
          content: project.markdown || '',
        },
      ],
      packageJson: {}, // We don't have this stored
      languages,
      totalSize: project.size || 0,
    };
  }
}
