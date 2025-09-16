import { Injectable, Logger } from '@nestjs/common';
import { IWebhookProcessor } from '../interfaces/webhook.interface';
import { WebhookEvent, WebhookProcessingResult } from '../types/webhook.types';
import { WebhookSyncService } from './webhook-sync.service';

@Injectable()
export class WebhookProcessorService implements IWebhookProcessor {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(private readonly syncService: WebhookSyncService) {}

  async process(event: WebhookEvent): Promise<WebhookProcessingResult> {
    try {
      this.logger.debug(`Processing webhook event: ${event.platform}:${event.eventType}`, {
        eventId: event.id,
        repositoryFullName: event.repositoryFullName,
      });

      // Route to platform-specific processor
      switch (event.platform) {
        case 'github':
          return await this.processGitHubEvent(event);
        case 'gitlab':
          return await this.processGitLabEvent(event);
        case 'bitbucket':
          return await this.processBitbucketEvent(event);
        default:
          return {
            success: false,
            eventId: event.id,
            processed: false,
            error: `Unsupported platform: ${event.platform}`,
          };
      }
    } catch (error) {
      this.logger.error(`Failed to process webhook event ${event.id}:`, error);
      return {
        success: false,
        eventId: event.id,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Processing failed',
      };
    }
  }

  supports(platform: string, eventType: string): boolean {
    const supportedPlatforms = ['github', 'gitlab', 'bitbucket'];
    return supportedPlatforms.includes(platform);
  }

  getPriority(): number {
    return 1; // Default priority
  }

  private async processGitHubEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    try {
      switch (event.eventType) {
        case 'push':
          return await this.processGitHubPushEvent(event);
        case 'pull_request':
          return await this.processGitHubPullRequestEvent(event);
        case 'issues':
          return await this.processGitHubIssueEvent(event);
        case 'release':
          return await this.processGitHubReleaseEvent(event);
        case 'star':
          return await this.processGitHubStarEvent(event);
        case 'fork':
          return await this.processGitHubForkEvent(event);
        default:
          this.logger.debug(`Unhandled GitHub event type: ${event.eventType}`);
          return {
            success: true,
            eventId: event.id,
            processed: true,
            error: `Unhandled event type: ${event.eventType}`,
          };
      }
    } catch (error) {
      this.logger.error(`Failed to process GitHub event ${event.id}:`, error);
      return {
        success: false,
        eventId: event.id,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'GitHub event processing failed',
      };
    }
  }

  private async processGitLabEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    try {
      switch (event.eventType) {
        case 'push':
        case 'Push Hook':
          return await this.processGitLabPushEvent(event);
        case 'merge_request':
        case 'Merge Request Hook':
          return await this.processGitLabMergeRequestEvent(event);
        case 'issues':
        case 'Issue Hook':
          return await this.processGitLabIssueEvent(event);
        case 'tag_push':
        case 'Tag Push Hook':
          return await this.processGitLabTagPushEvent(event);
        default:
          this.logger.debug(`Unhandled GitLab event type: ${event.eventType}`);
          return {
            success: true,
            eventId: event.id,
            processed: true,
            error: `Unhandled event type: ${event.eventType}`,
          };
      }
    } catch (error) {
      this.logger.error(`Failed to process GitLab event ${event.id}:`, error);
      return {
        success: false,
        eventId: event.id,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'GitLab event processing failed',
      };
    }
  }

  private async processBitbucketEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    try {
      switch (event.eventType) {
        case 'repo:push':
          return await this.processBitbucketPushEvent(event);
        case 'pullrequest:created':
        case 'pullrequest:updated':
        case 'pullrequest:fulfilled':
          return await this.processBitbucketPullRequestEvent(event);
        case 'repo:fork':
          return await this.processBitbucketForkEvent(event);
        default:
          this.logger.debug(`Unhandled Bitbucket event type: ${event.eventType}`);
          return {
            success: true,
            eventId: event.id,
            processed: true,
            error: `Unhandled event type: ${event.eventType}`,
          };
      }
    } catch (error) {
      this.logger.error(`Failed to process Bitbucket event ${event.id}:`, error);
      return {
        success: false,
        eventId: event.id,
        processed: false,
        error:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Bitbucket event processing failed',
      };
    }
  }

  // GitHub event processors
  private async processGitHubPushEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    const payload = event.payload;

    // Check if Portfolio.md was modified or if it's a push to main branch
    const portfolioModified = payload.commits?.some(
      (commit: any) =>
        commit.added?.includes('Portfolio.md') ||
        commit.modified?.includes('Portfolio.md') ||
        commit.removed?.includes('Portfolio.md'),
    );

    const branch = payload.ref?.split('/').pop();
    const isMainBranch = branch && ['main', 'master', 'develop'].includes(branch);

    if (portfolioModified || isMainBranch) {
      this.logger.log(`Triggering sync for ${event.repositoryFullName}`, {
        portfolioModified,
        isMainBranch,
        branch,
      });

      // Use the sync service to process the webhook
      return await this.syncService.processWebhookForSync(event);
    }

    // For other push events, just acknowledge
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitHubPullRequestEvent(
    event: WebhookEvent,
  ): Promise<WebhookProcessingResult> {
    // TODO: Handle pull request events for project activity tracking
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitHubIssueEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Handle issue events for project statistics
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitHubReleaseEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Handle release events for project updates
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitHubStarEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Update star count
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitHubForkEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Update fork count
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  // GitLab event processors
  private async processGitLabPushEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    const payload = event.payload;

    // Check if Portfolio.md was modified or if it's a push to main branch
    const portfolioModified = payload.commits?.some(
      (commit: any) =>
        commit.added?.includes('Portfolio.md') ||
        commit.modified?.includes('Portfolio.md') ||
        commit.removed?.includes('Portfolio.md'),
    );

    const branch = payload.ref?.split('/').pop();
    const isMainBranch = branch && ['main', 'master', 'develop'].includes(branch);

    if (portfolioModified || isMainBranch) {
      this.logger.log(`Triggering sync for ${event.repositoryFullName}`, {
        portfolioModified,
        isMainBranch,
        branch,
      });

      // Use the sync service to process the webhook
      return await this.syncService.processWebhookForSync(event);
    }

    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitLabMergeRequestEvent(
    event: WebhookEvent,
  ): Promise<WebhookProcessingResult> {
    // TODO: Handle merge request events
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitLabIssueEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Handle issue events
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processGitLabTagPushEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Handle tag push events for release tracking
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  // Bitbucket event processors
  private async processBitbucketPushEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    const payload = event.payload;

    // Check if push is to main/master branch
    const isMainBranch = payload.push?.changes?.some(
      (change: any) =>
        change.new?.name === 'main' ||
        change.new?.name === 'master' ||
        change.new?.name === 'develop',
    );

    if (isMainBranch) {
      this.logger.log(`Push to main branch in ${event.repositoryFullName}, triggering sync`);

      // Use the sync service to process the webhook
      return await this.syncService.processWebhookForSync(event);
    }

    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processBitbucketPullRequestEvent(
    event: WebhookEvent,
  ): Promise<WebhookProcessingResult> {
    // TODO: Handle pull request events
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }

  private async processBitbucketForkEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    // TODO: Update fork count
    return {
      success: true,
      eventId: event.id,
      processed: true,
    };
  }
}
