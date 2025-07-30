import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnqueueService {
  private queue: Queue;

  constructor(private readonly config: ConfigService) {
    this.queue = new Queue('email', {
      connection: {
        host: this.config.get<string>('REDIS_HOST'),
        port: this.config.get<number>('REDIS_PORT'),
      },
    });
  }
  async enqueueEmail(jobData: any) {
    await this.queue.add('sendEmail', jobData, {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }
  async enqueueWaitlistWelcome(email: string) {
    await this.enqueueEmail({
      type: 'waitlistWelcome',
      email,
    });
  }

  async enqueueForgotPassword(email: string, token: string) {
    await this.enqueueEmail({
      type: 'forgotPassword',
      email,
      token,
    });
  }

  async enqueueSignupEmail(email: string) {
    await this.enqueueEmail({
      type: 'signup',
      email,
    });
  }

  async enqueueSigninEmail(email: string) {
    await this.enqueueEmail({
      type: 'signin',
      email,
    });
  }

  async enqueuePasswordResetConfirmation(email: string) {
    await this.enqueueEmail({
      type: 'passwordResetConfirmation',
      email,
    });
  }
}
