import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from '../../projects/projects.service';
import { WebhookEvent, WebhookProcessingResult } from '../types/webhook.types';
import { WebhookQueueService } from './webhook-queue.service';

export interface SyncJobData {
  eventId: string;
  userId: string;
  repositoryUrl: string;
  repositoryId: string;
  repositoryName: string;
  repositoryFullName: string;
  platform: 'github' | 'gitlab' | 'bitbucket';
  eventType: string;
  branch?: string;
  forced?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface SyncResult {
  success: boolean;
  projectId?: string;
  changes?: string[];
  error?: string;
  duration?: number;
}

@Injectable()
export class WebhookSyncService {
  private readonly logger = new Logger(WebhookSyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly queueService: WebhookQueueService,
  ) {}

  /**
   * Process webhook event and trigger sync if needed
   */
  async processWebhookForSync(event: WebhookEvent): Promise<WebhookProcessingResult> {
    try {
      this.logger.debug(`Processing webhook for sync: ${event.platform}:${event.eventType}`, {
        eventId: event.id,
        repositoryFullName: event.repositoryFullName,
      });

      // Determine if sync is needed based on event type and payload
      const shouldSync = this.shouldTriggerSync(event);
      if (!shouldSync) {
        this.logger.debug(`Skipping sync for event ${event.id}: not a sync-triggering event`);
        return {
          success: true,
          eventId: event.id,
          processed: true,
        };
      }

      // Extract sync-relevant information
      const syncData = this.extractSyncData(event);
      if (!syncData) {
        return {
          success: false,
          eventId: event.id,
          processed: false,
          error: 'Could not extract sync data from webhook event',
        };
      }

      // Queue sync operation
      await this.queueSyncOperation(syncData);

      this.logger.log(`Queued sync operation for ${event.repositoryFullName}`, {
        eventId: event.id,
        syncData,
      });

      return {
        success: true,
        eventId: event.id,
        processed: true,
      };
    } catch (error) {
      this.logger.error(`Failed to process webhook for sync: ${event.id}`, error);
      return {
        success: false,
        eventId: event.id,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Sync processing failed',
      };
    }
  }

  /**
   * Execute sync operation
   */
  async executeSyncOperation(syncData: SyncJobData): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      this.logger.debug('Executing sync operation', {
        eventId: syncData.eventId,
        repositoryUrl: syncData.repositoryUrl,
        platform: syncData.platform,
      });

      // Find or create user for webhook-triggered syncs
      const userId = await this.resolveUserId(syncData);
      if (!userId) {
        throw new Error('Could not resolve user ID for sync operation');
      }

      // Execute platform-specific sync
      let result: any;
      switch (syncData.platform) {
        case 'github':
          result = await this.syncFromGitHub(userId, syncData);
          break;
        case 'gitlab':
          result = await this.syncFromGitLab(userId, syncData);
          break;
        case 'bitbucket':
          result = await this.syncFromBitbucket(userId, syncData);
          break;
        default:
          throw new Error(`Unsupported platform: ${syncData.platform}`);
      }

      const duration = Date.now() - startTime;

      this.logger.log('Sync operation completed successfully', {
        eventId: syncData.eventId,
        repositoryUrl: syncData.repositoryUrl,
        projectId: result?.id,
        duration,
      });

      return {
        success: true,
        projectId: result?.id,
        changes: this.extractChanges(result),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Sync operation failed', {
        eventId: syncData.eventId,
        repositoryUrl: syncData.repositoryUrl,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
        duration,
      });

      return {
        success: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Sync operation failed',
        duration,
      };
    }
  }

  /**
   * Determine if webhook event should trigger a sync
   */
  private shouldTriggerSync(event: WebhookEvent): boolean {
    const syncTriggeringEvents = {
      github: ['push', 'release', 'create', 'delete'],
      gitlab: ['push', 'Push Hook', 'tag_push', 'Tag Push Hook', 'release'],
      bitbucket: ['repo:push', 'repo:fork'],
    };

    const platformEvents = syncTriggeringEvents[event.platform];
    if (!platformEvents) {
      return false;
    }

    return platformEvents.includes(event.eventType);
  }

  /**
   * Extract sync data from webhook event
   */
  private extractSyncData(event: WebhookEvent): SyncJobData | null {
    try {
      const branch = this.extractBranch(event);
      const forced = this.extractForced(event);
      const priority = this.determinePriority(event);

      return {
        eventId: event.id,
        userId: '', // Will be resolved later
        repositoryUrl: event.repositoryUrl,
        repositoryId: event.repositoryId,
        repositoryName: event.repositoryName,
        repositoryFullName: event.repositoryFullName,
        platform: event.platform,
        eventType: event.eventType,
        branch,
        forced,
        priority,
      };
    } catch (error) {
      this.logger.error(`Failed to extract sync data from event ${event.id}:`, error);
      return null;
    }
  }

  /**
   * Extract branch information from webhook payload
   */
  private extractBranch(event: WebhookEvent): string | undefined {
    const payload = event.payload;

    switch (event.platform) {
      case 'github':
        return payload.ref?.split('/').pop();
      case 'gitlab':
        return payload.ref?.split('/').pop();
      case 'bitbucket':
        return payload.push?.changes?.[0]?.new?.name;
      default:
        return undefined;
    }
  }

  /**
   * Extract forced push information from webhook payload
   */
  private extractForced(event: WebhookEvent): boolean {
    const payload = event.payload;

    switch (event.platform) {
      case 'github':
        return payload.forced || false;
      case 'gitlab':
        return false; // GitLab doesn't provide forced flag in webhook
      case 'bitbucket':
        return payload.push?.changes?.[0]?.forced || false;
      default:
        return false;
    }
  }

  /**
   * Determine sync priority based on event
   */
  private determinePriority(event: WebhookEvent): 'low' | 'normal' | 'high' {
    // High priority for main branch pushes and releases
    const highPriorityEvents = ['release', 'create', 'delete'];
    if (highPriorityEvents.includes(event.eventType)) {
      return 'high';
    }

    // Check if it's a main branch push
    const branch = this.extractBranch(event);
    if (branch && ['main', 'master', 'develop'].includes(branch)) {
      return 'high';
    }

    return 'normal';
  }

  /**
   * Queue sync operation for background processing
   */
  private async queueSyncOperation(syncData: SyncJobData): Promise<void> {
    // Use the webhook queue for sync operations
    await this.queueService.addJob(
      {
        eventId: syncData.eventId,
        platform: syncData.platform,
        eventType: 'sync-operation',
        repositoryUrl: syncData.repositoryUrl,
        payload: syncData,
        signature: '', // Not needed for internal sync jobs
        timestamp: new Date(),
      },
      {
        priority: syncData.priority,
        immediate: syncData.priority === 'high',
      },
    );
  }

  /**
   * Resolve user ID for webhook-triggered sync
   */
  private async resolveUserId(syncData: SyncJobData): Promise<string | null> {
    // For webhook-triggered syncs, use a configured webhook user ID
    // or try to find the repository owner
    const webhookUserId = this.config.get<string>('WEBHOOK_USER_ID');
    if (webhookUserId) {
      return webhookUserId;
    }

    // TODO: Implement logic to find user by repository URL or owner
    // This would require querying the database for users who have connected
    // the platform and own this repository

    return 'webhook-user'; // Fallback user ID
  }

  /**
   * Sync repository from GitHub
   */
  private async syncFromGitHub(userId: string, syncData: SyncJobData): Promise<any> {
    return await this.projectsService.syncProjectFromGitHub(
      userId,
      syncData.repositoryUrl,
      syncData.branch || 'main',
    );
  }

  /**
   * Sync repository from GitLab
   */
  private async syncFromGitLab(userId: string, syncData: SyncJobData): Promise<any> {
    // TODO: Implement GitLab sync when GitLab integration is available
    throw new Error('GitLab sync not yet implemented');
  }

  /**
   * Sync repository from Bitbucket
   */
  private async syncFromBitbucket(userId: string, syncData: SyncJobData): Promise<any> {
    // TODO: Implement Bitbucket sync when Bitbucket integration is available
    throw new Error('Bitbucket sync not yet implemented');
  }

  /**
   * Extract changes from sync result
   */
  private extractChanges(result: any): string[] {
    if (!result) {
      return [];
    }

    const changes: string[] = [];

    // Add basic change information
    if (result.title) {
      changes.push(`Updated project: ${result.title}`);
    }

    if (result.description) {
      changes.push('Updated description');
    }

    if (result.tags && result.tags.length > 0) {
      changes.push(`Updated tags: ${result.tags.join(', ')}`);
    }

    return changes;
  }

  /**
   * Get sync operation metrics
   */
  async getSyncMetrics(timeRange?: { from: Date; to: Date }): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    averageDuration: number;
    syncsByPlatform: Record<string, number>;
  }> {
    // TODO: Implement metrics collection from sync history
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageDuration: 0,
      syncsByPlatform: {},
    };
  }
}
