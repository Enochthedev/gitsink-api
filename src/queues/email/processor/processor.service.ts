import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { MailService } from '@mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { MailJob } from '@type/queue.types';
import { EmailBounceService } from '../../../mail/bounce/email-bounce.service';

@Injectable()
export class ProcessorService implements OnModuleInit, OnModuleDestroy {
  private worker!: Worker;
  private readonly logger = new Logger(ProcessorService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly emailBounceService: EmailBounceService,
  ) { }
  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = this.config.get<number>('REDIS_PORT') || 6379;
    const timeoutMs = this.config.get<number>('EMAIL_JOB_TIMEOUT', 30000);

    this.worker = new Worker<MailJob>(
      'email',
      async (job: Job<MailJob>) => {
        const startTime = Date.now();
        const { type, email, token, data = {} } = job.data;

        try {
          // Check if email is suppressed before processing
          const isSuppressed = await this.emailBounceService.isEmailSuppressed(email);
          if (isSuppressed) {
            this.logger.warn(`Email ${email} is suppressed, skipping job ${job.id}`);
            return { skipped: true, reason: 'email_suppressed' };
          }

          this.logger.log(`Processing ${type} email job for ${email} [${job.id}]`);

          // Update job progress
          await job.updateProgress(10);

          const work = async () => {
            switch (type) {
              case 'waitlistWelcome':
                await this.mailService.sendWaitlistWelcome(email, data);
                break;

              case 'forgotPassword':
                if (!token) {
                  throw new Error('Token is required for forgotPassword email');
                }
                await this.mailService.sendForgotPassword(email, token, data);
                break;

              case 'signup':
                await this.mailService.sendSignupEmail(email, data);
                break;

              case 'signin':
                await this.mailService.sendSigninEmail(email, data);
                break;

              case 'passwordResetConfirmation':
                await this.mailService.sendPasswordResetConfirmation(email, data);
                break;

              case 'magicLinkSignIn':
                if (!token) {
                  throw new Error('Token is required for magicLinkSignIn email');
                }
                await this.mailService.sendMagicLinkSignInEmail(email, token, data);
                break;

              case 'apiKeyRegeneration':
                await this.mailService.sendApiKeyRegeneration(email, data);
                break;

              case 'accountSuspension':
                await this.mailService.sendAccountSuspension(email, data);
                break;

              case 'syncFailureNotification':
                await this.mailService.sendSyncFailureNotification(email, data);
                break;

              case 'weeklyDigest':
                await this.mailService.sendWeeklyDigest(email, data);
                break;

              default:
                throw new Error(`Unknown email job type: ${type as string}`);
            }
          };

          await job.updateProgress(50);

          // Execute with timeout and enhanced error handling
          try {
            await Promise.race([
              work(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Job timed out after ${timeoutMs}ms`)),
                  timeoutMs,
                ),
              ),
            ]);
          } catch (workError) {
            // Enhanced error handling with context
            const enhancedError = this.enhanceError(workError, {
              type,
              email,
              jobId: job.id || 'unknown',
            });
            throw enhancedError;
          }

          await job.updateProgress(100);

          const duration = Date.now() - startTime;
          this.logger.log(
            `Successfully sent ${type} email to ${email} in ${duration}ms [${job.id}]`,
          );

          return { success: true, duration, type, email };
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          this.logger.error(
            `Failed to process ${type} email for ${email} after ${duration}ms [${job.id}]:`,
            {
              error: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
              attempt: job.attemptsMade,
              maxAttempts: job.opts.attempts,
              jobData: {
                type,
                email,
                hasToken: !!token,
                dataKeys: Object.keys(data),
              },
            },
          );

          // Determine if error is retryable
          const isRetryable = this.isRetryableError(error);
          if (!isRetryable) {
            this.logger.error(`Non-retryable error for ${email}, marking job as failed`);

            // Record permanent failure for monitoring
            await this.recordPermanentFailure(type, email, errorMessage);
          }

          throw error;
        }
      },
      {
        connection: { host, port },
        concurrency: this.config.get<number>('EMAIL_WORKER_CONCURRENCY', 5),
        removeOnComplete: { count: this.config.get<number>('EMAIL_REMOVE_ON_COMPLETE', 100) },
        removeOnFail: { count: this.config.get<number>('EMAIL_REMOVE_ON_FAIL', 50) },
        settings: {},
      },
    );

    this.setupWorkerEventHandlers();
  }

  onModuleDestroy() {
    if (this.worker) {
      this.logger.log('Shutting down email worker...');
      return this.worker.close();
    }
  }

  private setupWorkerEventHandlers() {
    this.worker.on('completed', (job, result) => {
      if (result?.skipped) {
        this.logger.log(`Job ${job.name} [${job.id}] skipped: ${result.reason}`);
      } else {
        this.logger.log(`Job ${job.name} [${job.id}] completed successfully`);
      }
    });

    this.worker.on('failed', (job, err) => {
      const attempt = job?.attemptsMade || 0;
      const maxAttempts = job?.opts?.attempts || 1;

      if (attempt >= maxAttempts) {
        this.logger.error(
          `Job ${job?.name} [${job?.id}] permanently failed after ${attempt} attempts:`,
          err.message,
        );
      } else {
        this.logger.warn(
          `Job ${job?.name} [${job?.id}] failed (attempt ${attempt}/${maxAttempts}):`,
          err.message,
        );
      }
    });

    this.worker.on('stalled', jobId => {
      this.logger.warn(`Job ${jobId} stalled and will be retried`);
    });

    this.worker.on('error', err => {
      this.logger.error('Email worker error:', err);
    });

    this.worker.on('ready', () => {
      this.logger.log('Email worker is ready');
    });

    this.worker.on('closing', () => {
      this.logger.log('Email worker is closing');
    });
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code;

    // Network/connection errors - retryable
    if (
      errorCode === 'ECONNRESET' ||
      errorCode === 'ECONNREFUSED' ||
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ENOTFOUND' ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('network')
    ) {
      return true;
    }

    // SMTP temporary errors - retryable
    if (
      errorMessage.includes('4.') || // 4xx SMTP codes are temporary
      errorMessage.includes('rate limit') ||
      errorMessage.includes('throttle') ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('try again later')
    ) {
      return true;
    }

    // Template/data errors - not retryable
    if (
      errorMessage.includes('template') ||
      errorMessage.includes('missing required') ||
      errorMessage.includes('invalid template data')
    ) {
      return false;
    }

    // Authentication/configuration errors - not retryable
    if (
      errorMessage.includes('authentication') ||
      errorMessage.includes('invalid credentials') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('5.') || // 5xx SMTP codes are permanent
      errorMessage.includes('invalid email') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('blacklisted') ||
      errorMessage.includes('blocked')
    ) {
      return false;
    }

    // Email transporter not initialized - not retryable (configuration issue)
    if (errorMessage.includes('transporter not initialized')) {
      return false;
    }

    // Default to retryable for unknown errors
    return true;
  }

  private enhanceError(error: any, context: { type: string; email: string; jobId: string }): Error {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const enhancedMessage = `Email job failed [${context.jobId}] - Type: ${context.type}, Email: ${context.email}, Error: ${originalMessage}`;

    const enhancedError = new Error(enhancedMessage);
    enhancedError.stack = error instanceof Error ? error.stack : undefined;

    // Preserve original error properties
    if (error instanceof Error) {
      Object.setPrototypeOf(enhancedError, Object.getPrototypeOf(error));
      Object.assign(enhancedError, error);
    }

    return enhancedError;
  }

  private async recordPermanentFailure(
    type: string,
    email: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      // This could be expanded to record in database or send alerts
      this.logger.error(
        `PERMANENT EMAIL FAILURE - Type: ${type}, Email: ${email}, Error: ${errorMessage}`,
      );

      // If this is a critical email type, we might want to alert administrators
      const criticalTypes = ['forgotPassword', 'magicLinkSignIn', 'accountSuspension'];
      if (criticalTypes.includes(type)) {
        this.logger.error(
          `CRITICAL EMAIL FAILURE - Admin attention required for ${type} email to ${email}`,
        );
      }
    } catch (recordError) {
      this.logger.error('Failed to record permanent failure:', recordError);
    }
  }
}
