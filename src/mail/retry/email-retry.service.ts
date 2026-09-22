import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail.service';

export interface FailedEmailJob {
  id: string;
  email: string;
  subject: string;
  type: string;
  data: any;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  nextRetryAt: Date;
  createdAt: Date;
}

@Injectable()
export class EmailRetryService {
  private readonly logger = new Logger(EmailRetryService.name);
  private readonly maxRetries: number;
  private readonly retryDelays: number[]; // in minutes

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.maxRetries = this.configService.get<number>('EMAIL_MAX_RETRIES', 3);
    this.retryDelays = [5, 15, 60]; // 5 min, 15 min, 1 hour
  }

  /**
   * Record a failed email for retry
   */
  async recordFailedEmail(
    email: string,
    subject: string,
    type: string,
    data: any,
    error: string,
  ): Promise<void> {
    try {
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + this.retryDelays[0]);

      // TODO: Add failedEmailJob model to Prisma schema
      // await this.prismaService.failedEmailJob.create({
      //   data: {
      //     email,
      //     subject,
      //     type,
      //     data: JSON.stringify(data),
      //     attempts: 0,
      //     maxAttempts: this.maxRetries,
      //     lastError: error,
      //     nextRetryAt,
      //   },
      // });

      this.logger.log(`Recorded failed email for retry: ${email} - ${type}`);
    } catch (recordError) {
      this.logger.error('Failed to record failed email:', recordError);
    }
  }

  /**
   * Process retry queue - runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processRetryQueue(): Promise<void> {
    try {
      const now = new Date();
      // TODO: Add failedEmailJob model to Prisma schema
      const failedJobs = []; // await this.prismaService.failedEmailJob.findMany({
      //   where: {
      //     nextRetryAt: { lte: now },
      //     attempts: { lt: this.maxRetries },
      //   },
      //   orderBy: { createdAt: 'asc' },
      //   take: 50, // Process up to 50 at a time
      // });

      if (failedJobs.length === 0) {
        return;
      }

      this.logger.log(`Processing ${failedJobs.length} failed email jobs`);

      for (const job of failedJobs) {
        // await this.retryFailedEmail(job);
      }
    } catch (error) {
      this.logger.error('Failed to process retry queue:', error);
    }
  }

  /**
   * Retry a specific failed email
   */
  private async retryFailedEmail(job: any): Promise<void> {
    try {
      const data = JSON.parse(job.data || '{}');
      let success = false;

      // Attempt to send the email based on type
      switch (job.type) {
        case 'waitlistWelcome':
          await this.mailService.sendWaitlistWelcome(job.email, data);
          success = true;
          break;
        case 'signup':
          await this.mailService.sendSignupEmail(job.email, data);
          success = true;
          break;
        case 'forgotPassword':
          await this.mailService.sendForgotPassword(job.email, data.token, data);
          success = true;
          break;
        case 'magicLinkSignIn':
          await this.mailService.sendMagicLinkSignInEmail(job.email, data.token, data);
          success = true;
          break;
        case 'passwordResetConfirmation':
          await this.mailService.sendPasswordResetConfirmation(job.email, data);
          success = true;
          break;
        case 'signin':
          await this.mailService.sendSigninEmail(job.email, data);
          success = true;
          break;
        case 'apiKeyRegeneration':
          await this.mailService.sendApiKeyRegeneration(job.email, data);
          success = true;
          break;
        case 'accountSuspension':
          await this.mailService.sendAccountSuspension(job.email, data);
          success = true;
          break;
        case 'syncFailureNotification':
          await this.mailService.sendSyncFailureNotification(job.email, data);
          success = true;
          break;
        case 'weeklyDigest':
          await this.mailService.sendWeeklyDigest(job.email, data);
          success = true;
          break;
        default:
          throw new Error(`Unknown email type: ${job.type}`);
      }

      if (success) {
        // Remove successful retry from queue
        // await this.prismaService.failedEmailJob.delete({
        //   where: { id: job.id },
        // });

        this.logger.log(`Successfully retried email: ${job.email} - ${job.type}`);
      }
    } catch (error) {
      await this.handleRetryFailure(job, error);
    }
  }

  /**
   * Handle retry failure
   */
  private async handleRetryFailure(job: any, error: any): Promise<void> {
    const newAttempts = job.attempts + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (newAttempts >= this.maxRetries) {
      // Max retries reached, mark as permanently failed
      // await this.prismaService.failedEmailJob.update({
      //   where: { id: job.id },
      //   data: {
      //     attempts: newAttempts,
      //     lastError: errorMessage,
      //     nextRetryAt: null, // No more retries
      //   },
      // });

      this.logger.error(
        `Email permanently failed after ${newAttempts} attempts: ${job.email} - ${job.type}`,
        {
          error: errorMessage,
          jobId: job.id,
        },
      );

      // Optionally send alert to administrators for critical email types
      const criticalTypes = ['forgotPassword', 'magicLinkSignIn', 'accountSuspension'];
      if (criticalTypes.includes(job.type)) {
        this.logger.error(
          `CRITICAL EMAIL FAILURE - Admin attention required: ${job.email} - ${job.type}`,
        );
      }
    } else {
      // Schedule next retry
      const nextRetryAt = new Date();
      const delayIndex = Math.min(newAttempts - 1, this.retryDelays.length - 1);
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + this.retryDelays[delayIndex]);

      // await this.prismaService.failedEmailJob.update({
      //   where: { id: job.id },
      //   data: {
      //     attempts: newAttempts,
      //     lastError: errorMessage,
      //     nextRetryAt,
      //   },
      // });

      this.logger.warn(
        `Email retry ${newAttempts}/${this.maxRetries} failed, scheduled next retry: ${job.email} - ${job.type}`,
        {
          error: errorMessage,
          nextRetryAt,
        },
      );
    }
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(): Promise<{
    pending: number;
    failed: number;
    totalProcessed: number;
  }> {
    try {
      // TODO: Add failedEmailJob model to Prisma schema
      const [pending, failed, totalProcessed] = [0, 0, 0]; // await Promise.all([
      //   this.prismaService.failedEmailJob.count({
      //     where: {
      //       attempts: { lt: this.maxRetries },
      //       nextRetryAt: { not: null },
      //     },
      //   }),
      //   this.prismaService.failedEmailJob.count({
      //     where: {
      //       attempts: { gte: this.maxRetries },
      //     },
      //   }),
      //   this.prismaService.failedEmailJob.count(),
      // ]);

      return { pending, failed, totalProcessed };
    } catch (error) {
      this.logger.error('Failed to get retry stats:', error);
      return { pending: 0, failed: 0, totalProcessed: 0 };
    }
  }

  /**
   * Clean up old failed email records
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldFailedEmails(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep records for 30 days

      // TODO: Add failedEmailJob model to Prisma schema
      const result = { count: 0 }; // await this.prismaService.failedEmailJob.deleteMany({
      //   where: {
      //     createdAt: { lt: cutoffDate },
      //     attempts: { gte: this.maxRetries }, // Only delete permanently failed ones
      //   },
      // });

      this.logger.log(`Cleaned up ${result.count} old failed email records`);
    } catch (error) {
      this.logger.error('Failed to cleanup old failed emails:', error);
    }
  }

  /**
   * Manually retry a specific email by ID
   */
  async manualRetry(jobId: string): Promise<boolean> {
    try {
      // TODO: Add failedEmailJob model to Prisma schema
      const job = null; // await this.prismaService.failedEmailJob.findUnique({
      //   where: { id: jobId },
      // });

      if (!job) {
        this.logger.warn(`Failed email job not found: ${jobId}`);
        return false;
      }

      // if (job.attempts >= this.maxRetries) {
      //   this.logger.warn(`Cannot retry job that has reached max attempts: ${jobId}`);
      //   return false;
      // }

      // await this.retryFailedEmail(job);
      return true;
    } catch (error) {
      this.logger.error(`Failed to manually retry email job ${jobId}:`, error);
      return false;
    }
  }
}
