import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class EnqueueService {
  constructor(
    private readonly config: ConfigService,
    @InjectQueue('email') private queue: Queue,
  ) {}
  async enqueueEmail(jobData: any, options: any = {}) {
    const defaultOptions = {
      removeOnComplete: this.config.get<number>('EMAIL_REMOVE_ON_COMPLETE', 100),
      removeOnFail: this.config.get<number>('EMAIL_REMOVE_ON_FAIL', 50),
      attempts: this.config.get<number>('EMAIL_MAX_ATTEMPTS', 5),
      backoff: {
        type: 'exponential',
        delay: this.config.get<number>('EMAIL_RETRY_DELAY', 2000),
      },
      delay: options.delay || 0,
      priority: options.priority || 0,
    };

    await this.queue.add('sendEmail', jobData, {
      ...defaultOptions,
      ...options,
    });
  }
  async enqueueWaitlistWelcome(email: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'waitlistWelcome',
        email,
      },
      options,
    );
  }

  async enqueueForgotPassword(email: string, token: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'forgotPassword',
        email,
        token,
      },
      { ...options, priority: 5 },
    ); // Higher priority for password resets
  }

  async enqueueSignupEmail(email: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'signup',
        email,
      },
      { ...options, priority: 3 },
    ); // Medium priority for signups
  }

  async enqueueSigninEmail(email: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'signin',
        email,
      },
      options,
    );
  }

  async enqueueMagicLinkSignInEmail(email: string, token: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'magicLinkSignIn',
        email,
        token,
      },
      { ...options, priority: 5 },
    ); // Higher priority for magic links
  }

  async enqueuePasswordResetConfirmation(email: string, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'passwordResetConfirmation',
        email,
      },
      { ...options, priority: 3 },
    ); // Medium priority for confirmations
  }

  async enqueueApiKeyRegeneration(email: string, data: any = {}, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'apiKeyRegeneration',
        email,
        data,
      },
      { ...options, priority: 4 },
    ); // High priority for security notifications
  }

  async enqueueAccountSuspension(email: string, data: any = {}, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'accountSuspension',
        email,
        data,
      },
      { ...options, priority: 5 },
    ); // Highest priority for account actions
  }

  async enqueueSyncFailureNotification(email: string, data: any = {}, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'syncFailureNotification',
        email,
        data,
      },
      { ...options, priority: 2 },
    ); // Lower priority for operational notifications
  }

  async enqueueWeeklyDigest(email: string, data: any = {}, options: any = {}) {
    await this.enqueueEmail(
      {
        type: 'weeklyDigest',
        email,
        data,
      },
      { ...options, priority: 1, delay: options.delay || 0 },
    ); // Lowest priority for digest emails
  }
}
