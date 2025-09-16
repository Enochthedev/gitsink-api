import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseWorkerService, JobContext } from './base-worker.service';
import { QueueConfigService, QueueType } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';
import { MailService } from '../../mail/mail.service';
import { MailJob } from '../../types/queue.types';

@Injectable()
export class EmailWorkerService extends BaseWorkerService {
  constructor(
    queueConfig: QueueConfigService,
    metricsService: MetricsService,
    private readonly mailService: MailService,
  ) {
    super(queueConfig, metricsService, QueueType.EMAIL);
  }

  protected getWorkerName(): string {
    return 'EmailWorker';
  }

  protected async processJob(job: Job<MailJob>, context: JobContext): Promise<void> {
    const { type, email, token } = job.data;

    // Update job progress
    await job.updateProgress(10);

    try {
      switch (type) {
        case 'waitlistWelcome':
          await this.processWaitlistWelcome(email, job);
          break;

        case 'forgotPassword':
          if (!token) {
            throw new Error('Token is required for forgotPassword email');
          }
          await this.processForgotPassword(email, token, job);
          break;

        case 'signup':
          await this.processSignupEmail(email, job);
          break;

        case 'signin':
          await this.processSigninEmail(email, job);
          break;

        case 'passwordResetConfirmation':
          await this.processPasswordResetConfirmation(email, job);
          break;

        case 'magicLinkSignIn':
          if (!token) {
            throw new Error('Token is required for magicLinkSignIn email');
          }
          await this.processMagicLinkSignIn(email, token, job);
          break;

        case 'apiKeyRegeneration':
          await this.processApiKeyRegeneration(email, job);
          break;

        case 'accountSuspension':
          await this.processAccountSuspension(email, job);
          break;

        case 'syncFailureNotification':
          await this.processSyncFailureNotification(email, job);
          break;

        case 'weeklyDigest':
          await this.processWeeklyDigest(email, job);
          break;

        default:
          throw new Error(`Unknown email job type: ${type}`);
      }

      await job.updateProgress(100);
      this.logger.log(`Successfully processed ${type} email for ${email}`);
    } catch (error) {
      this.logger.error(`Failed to process ${type} email for ${email}:`, error);
      throw error;
    }
  }

  private async processWaitlistWelcome(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendWaitlistWelcome(email);
    await job.updateProgress(80);
  }

  private async processForgotPassword(email: string, token: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendForgotPassword(email, token);
    await job.updateProgress(80);
  }

  private async processSignupEmail(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendSignupEmail(email);
    await job.updateProgress(80);
  }

  private async processSigninEmail(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendSigninEmail(email);
    await job.updateProgress(80);
  }

  private async processPasswordResetConfirmation(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendPasswordResetConfirmation(email);
    await job.updateProgress(80);
  }

  private async processMagicLinkSignIn(email: string, token: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    await this.mailService.sendMagicLinkSignInEmail(email, token);
    await job.updateProgress(80);
  }

  private async processApiKeyRegeneration(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    const data = (job.data as MailJob).data || {};
    await this.mailService.sendApiKeyRegeneration(email, data);
    await job.updateProgress(80);
  }

  private async processAccountSuspension(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    const data = (job.data as MailJob).data || {};
    await this.mailService.sendAccountSuspension(email, data);
    await job.updateProgress(80);
  }

  private async processSyncFailureNotification(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    const data = (job.data as MailJob).data || {};
    await this.mailService.sendSyncFailureNotification(email, data);
    await job.updateProgress(80);
  }

  private async processWeeklyDigest(email: string, job: Job): Promise<void> {
    await job.updateProgress(30);
    const data = (job.data as MailJob).data || {};
    await this.mailService.sendWeeklyDigest(email, data);
    await job.updateProgress(80);
  }
}
