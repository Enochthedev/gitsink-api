import { Body, Controller, Headers, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PlatformRegistryService } from '../services/platform-registry.service';

interface GitLabWebhookPayload {
  object_kind: string;
  event_name: string;
  before: string;
  after: string;
  ref: string;
  checkout_sha: string;
  message: string;
  user_id: number;
  user_name: string;
  user_username: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url?: string;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
    ci_config_path?: string;
    homepage: string;
    url: string;
    ssh_url: string;
    http_url: string;
  };
  commits: Array<{
    id: string;
    message: string;
    title: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  total_commits_count: number;
  push_options?: Record<string, any>;
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
    git_http_url: string;
    git_ssh_url: string;
    visibility_level: number;
  };
}

@Controller('webhooks/gitlab')
export class GitLabWebhookController {
  private readonly logger = new Logger(GitLabWebhookController.name);

  constructor(
    private readonly platformRegistry: PlatformRegistryService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handleWebhook(
    @Body() payload: GitLabWebhookPayload,
    @Headers('x-gitlab-token') signature: string,
    @Headers('x-gitlab-event') event: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.debug(`Received GitLab webhook: ${event}`);

      // Validate webhook signature
      const provider = this.platformRegistry.getProvider('gitlab');
      if (!provider) {
        this.logger.error('GitLab provider not available');
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'GitLab provider not available',
        });
      }

      const webhookSecret = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
      if (!webhookSecret) {
        this.logger.error('GitLab webhook secret not configured');
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Webhook secret not configured',
        });
      }

      const payloadString = JSON.stringify(payload);
      const isValidSignature = provider.validateWebhookSignature(
        payloadString,
        signature,
        webhookSecret,
      );

      if (!isValidSignature) {
        this.logger.warn('Invalid GitLab webhook signature');
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: 'Invalid webhook signature',
        });
      }

      // Process different webhook events
      switch (payload.object_kind || event) {
        case 'push':
          await this.handlePushEvent(payload);
          break;
        case 'merge_request':
          await this.handleMergeRequestEvent(payload);
          break;
        case 'issues':
          await this.handleIssueEvent(payload);
          break;
        case 'note':
          await this.handleNoteEvent(payload);
          break;
        case 'pipeline':
          await this.handlePipelineEvent(payload);
          break;
        case 'job':
          await this.handleJobEvent(payload);
          break;
        case 'tag_push':
          await this.handleTagPushEvent(payload);
          break;
        case 'wiki_page':
          await this.handleWikiPageEvent(payload);
          break;
        case 'deployment':
          await this.handleDeploymentEvent(payload);
          break;
        case 'feature_flag':
          await this.handleFeatureFlagEvent(payload);
          break;
        case 'release':
          await this.handleReleaseEvent(payload);
          break;
        default:
          this.logger.debug(`Unhandled GitLab webhook event: ${payload.object_kind || event}`);
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      this.logger.error('GitLab webhook processing failed:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Webhook processing failed',
        message:
          error instanceof Error
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'Unknown error',
      });
    }
  }

  private async handlePushEvent(payload: GitLabWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing GitLab push event for project: ${payload.project.path_with_namespace}`,
    );

    // Check if Portfolio.md was modified
    const portfolioModified = payload.commits.some(
      commit =>
        commit.added.includes('Portfolio.md') ||
        commit.modified.includes('Portfolio.md') ||
        commit.removed.includes('Portfolio.md'),
    );

    if (portfolioModified) {
      this.logger.log(
        `Portfolio.md modified in ${payload.project.path_with_namespace}, triggering sync`,
      );
      // TODO: Queue project sync job
      // await this.projectSyncService.queueSync(payload.project.web_url, 'gitlab');
    }

    // TODO: Update project metadata (last push time, commit count, etc.)
  }

  private async handleMergeRequestEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab merge request event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle merge request events if needed for project sync
  }

  private async handleIssueEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab issue event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle issue events if needed for project statistics
  }

  private async handleNoteEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab note event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle comment events if needed
  }

  private async handlePipelineEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab pipeline event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle pipeline events if needed for project status
  }

  private async handleJobEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab job event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle job events if needed
  }

  private async handleTagPushEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab tag push event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle tag creation for release tracking
  }

  private async handleWikiPageEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab wiki page event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle wiki changes if needed
  }

  private async handleDeploymentEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab deployment event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle deployment events if needed
  }

  private async handleFeatureFlagEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab feature flag event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle feature flag events if needed
  }

  private async handleReleaseEvent(payload: any): Promise<void> {
    this.logger.debug(
      `Processing GitLab release event for project: ${payload.project?.path_with_namespace}`,
    );
    // TODO: Handle release events for project updates
  }
}
