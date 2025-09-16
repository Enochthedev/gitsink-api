import { Controller, Post, Body, Headers, HttpStatus, Logger, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PlatformRegistryService } from '../services/platform-registry.service';

interface BitbucketWebhookPayload {
  push?: {
    changes: Array<{
      new: {
        name: string;
        target: {
          hash: string;
          message: string;
          date: string;
          author: {
            raw: string;
            user: {
              display_name: string;
              uuid: string;
              username: string;
            };
          };
        };
      };
      old?: {
        name: string;
        target: {
          hash: string;
        };
      };
      created: boolean;
      forced: boolean;
      closed: boolean;
      commits: Array<{
        hash: string;
        message: string;
        date: string;
        author: {
          raw: string;
          user: {
            display_name: string;
            uuid: string;
            username: string;
          };
        };
        parents: Array<{
          hash: string;
        }>;
      }>;
    }>;
  };
  pullrequest?: {
    id: number;
    title: string;
    description: string;
    state: 'OPEN' | 'MERGED' | 'DECLINED';
    author: {
      display_name: string;
      uuid: string;
      username: string;
    };
    source: {
      branch: {
        name: string;
      };
      commit: {
        hash: string;
      };
      repository: {
        name: string;
        full_name: string;
        uuid: string;
      };
    };
    destination: {
      branch: {
        name: string;
      };
      commit: {
        hash: string;
      };
      repository: {
        name: string;
        full_name: string;
        uuid: string;
      };
    };
    created_on: string;
    updated_on: string;
  };
  repository: {
    uuid: string;
    name: string;
    full_name: string;
    is_private: boolean;
    scm: 'git' | 'hg';
    website?: string;
    language?: string;
    has_issues: boolean;
    has_wiki: boolean;
    fork_policy: 'allow_forks' | 'no_public_forks' | 'no_forks';
    created_on: string;
    updated_on: string;
    size: number;
    links: {
      self: { href: string };
      html: { href: string };
      avatar: { href: string };
      clone: Array<{
        name: 'https' | 'ssh';
        href: string;
      }>;
    };
    owner: {
      uuid: string;
      username: string;
      display_name: string;
      type: 'user' | 'team';
    };
    workspace: {
      uuid: string;
      name: string;
      slug: string;
      type: 'workspace';
    };
    project?: {
      uuid: string;
      key: string;
      name: string;
      type: 'project';
    };
  };
  actor: {
    uuid: string;
    username: string;
    display_name: string;
    type: 'user';
    links: {
      self: { href: string };
      avatar: { href: string };
      html: { href: string };
    };
  };
}

@Controller('webhooks/bitbucket')
export class BitbucketWebhookController {
  private readonly logger = new Logger(BitbucketWebhookController.name);

  constructor(
    private readonly platformRegistry: PlatformRegistryService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handleWebhook(
    @Body() payload: BitbucketWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-event-key') event: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.debug(`Received Bitbucket webhook: ${event}`);

      // Validate webhook signature
      const provider = this.platformRegistry.getProvider('bitbucket');
      if (!provider) {
        this.logger.error('Bitbucket provider not available');
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Bitbucket provider not available',
        });
      }

      const webhookSecret = this.config.get<string>('BITBUCKET_WEBHOOK_SECRET');
      if (!webhookSecret) {
        this.logger.error('Bitbucket webhook secret not configured');
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
        this.logger.warn('Invalid Bitbucket webhook signature');
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: 'Invalid webhook signature',
        });
      }

      // Process different webhook events
      switch (event) {
        case 'repo:push':
          await this.handlePushEvent(payload);
          break;
        case 'repo:fork':
          await this.handleForkEvent(payload);
          break;
        case 'repo:commit_comment_created':
          await this.handleCommitCommentEvent(payload);
          break;
        case 'repo:commit_status_created':
        case 'repo:commit_status_updated':
          await this.handleCommitStatusEvent(payload);
          break;
        case 'issue:created':
        case 'issue:updated':
          await this.handleIssueEvent(payload);
          break;
        case 'issue:comment_created':
          await this.handleIssueCommentEvent(payload);
          break;
        case 'pullrequest:created':
        case 'pullrequest:updated':
        case 'pullrequest:approved':
        case 'pullrequest:unapproved':
        case 'pullrequest:fulfilled':
        case 'pullrequest:rejected':
          await this.handlePullRequestEvent(payload);
          break;
        case 'pullrequest:comment_created':
        case 'pullrequest:comment_updated':
        case 'pullrequest:comment_deleted':
          await this.handlePullRequestCommentEvent(payload);
          break;
        default:
          this.logger.debug(`Unhandled Bitbucket webhook event: ${event}`);
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      this.logger.error('Bitbucket webhook processing failed:', error);
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

  private async handlePushEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket push event for repository: ${payload.repository.full_name}`,
    );

    if (!payload.push) {
      return;
    }

    // Check if Portfolio.md was modified in any of the commits
    const portfolioModified = payload.push.changes.some(change =>
      change.commits.some(commit => {
        // Bitbucket doesn't provide file lists in push events by default
        // We would need to make additional API calls to get commit details
        // For now, we'll trigger sync for all pushes to main/master branches
        return change.new.name === 'main' || change.new.name === 'master';
      }),
    );

    if (portfolioModified) {
      this.logger.log(`Push to main branch in ${payload.repository.full_name}, triggering sync`);
      // TODO: Queue project sync job
      // await this.projectSyncService.queueSync(payload.repository.links.html.href, 'bitbucket');
    }

    // TODO: Update project metadata (last push time, commit count, etc.)
  }

  private async handleForkEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket fork event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Update fork count if needed
  }

  private async handleCommitCommentEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket commit comment event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle commit comments if needed
  }

  private async handleCommitStatusEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket commit status event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle commit status updates if needed for CI/CD tracking
  }

  private async handleIssueEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket issue event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle issue events if needed for project statistics
  }

  private async handleIssueCommentEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket issue comment event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle issue comments if needed
  }

  private async handlePullRequestEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket pull request event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle pull request events if needed for project activity tracking
  }

  private async handlePullRequestCommentEvent(payload: BitbucketWebhookPayload): Promise<void> {
    this.logger.debug(
      `Processing Bitbucket pull request comment event for repository: ${payload.repository.full_name}`,
    );
    // TODO: Handle pull request comments if needed
  }
}
