import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseWorkerService, JobContext } from './base-worker.service';
import { QueueConfigService, QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';
import { ProjectsService } from '../../projects/projects.service';

export interface SyncJobData {
  userId: string;
  repositoryUrl: string;
  platform: 'github' | 'gitlab' | 'bitbucket';
  syncType: 'full' | 'incremental' | 'metadata_only';
  priority?: 'low' | 'normal' | 'high';
  options?: {
    forceRefresh?: boolean;
    includePrivate?: boolean;
    syncBranches?: boolean;
  };
}

export interface SyncAllReposJobData {
  userId: string;
  triggeredBy: string;
  timestamp: string;
}

export type AnySyncJobData = SyncJobData | SyncAllReposJobData;

export interface SyncResult {
  success: boolean;
  repositoryId?: string;
  syncedAt: Date;
  changes: {
    created: number;
    updated: number;
    deleted: number;
  };
  metadata?: {
    commits: number;
    branches: number;
    contributors: number;
    languages: Record<string, number>;
  };
  error?: string;
}

@Injectable()
export class SyncWorkerService extends BaseWorkerService {
  constructor(
    queueConfig: QueueConfigService,
    metricsService: MetricsService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {
    super(queueConfig, metricsService, QueueType.SYNC);
  }

  protected getWorkerName(): string {
    return 'SyncWorker';
  }

  protected async processJob(job: Job<AnySyncJobData>, context: JobContext): Promise<SyncResult> {
    if (job.name === 'sync-all-repos') {
      return this.processSyncAllRepos(job as Job<SyncAllReposJobData>);
    }

    return this.processSyncProject(job as Job<SyncJobData>);
  }

  private async processSyncAllRepos(job: Job<SyncAllReposJobData>): Promise<SyncResult> {
    const { userId } = job.data;
    this.logger.log(`Starting full account sync for user ${userId}`);

    try {
      await job.updateProgress(10);

      // Execute the actual sync logic via ProjectsService
      // This method now includes event publishing for GraphQL subscriptions
      await this.projectsService.syncAllReposForUser(userId);

      await job.updateProgress(100);

      this.logger.log(`Successfully completed account sync for ${userId}`);

      return {
        success: true,
        syncedAt: new Date(),
        changes: { created: 0, updated: 0, deleted: 0 }, // Details are handled by events
      };
    } catch (error) {
      this.logger.error(`Account sync failed for user ${userId}:`, error);
      throw error;
    }
  }

  private async processSyncProject(
    job: Job<SyncJobData & { repoUrl?: string | null; branch?: string | null }>,
  ): Promise<SyncResult> {
    const { userId, repositoryUrl, repoUrl, branch } = job.data;
    const finalRepoUrl = repositoryUrl || repoUrl;
    const finalBranch = branch || 'main';

    if (!finalRepoUrl) {
      throw new Error('Repository URL is required');
    }

    this.logger.log(`Starting sync for ${finalRepoUrl}`);

    try {
      await job.updateProgress(10);

      // Execute the actual sync logic
      await this.projectsService.syncProjectFromGitHub(userId, finalRepoUrl, finalBranch);

      await job.updateProgress(100);

      const result: SyncResult = {
        success: true,
        syncedAt: new Date(),
        changes: { created: 0, updated: 0, deleted: 0 },
      };

      this.logger.log(`Successfully synced ${finalRepoUrl}`);
      return result;
    } catch (error) {
      this.logger.error(`Sync failed for ${finalRepoUrl}:`, error);
      throw error;
    }
  }

  private validateSyncJobData(data: SyncJobData): void {
    // Deprecated validation
  }
}
