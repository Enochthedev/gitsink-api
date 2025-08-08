import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { MailService } from '@mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { MailJob } from '@type/queue.types';

@Injectable()
export class ProcessorService implements OnModuleInit {
  private worker!: Worker;

  constructor(
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) { }
  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = this.config.get<number>('REDIS_PORT') || 6379;
    const timeoutMs = 10000;

    this.worker = new Worker<MailJob>(
      'email',
      async (job: Job<MailJob>) => {
        try {
          const { type, email, token } = job.data;
          const work = async () => {
            switch (type) {
              case 'waitlistWelcome':
                console.log(`📨 Sending waitlist welcome email to ${email}`);
                await this.mailService.sendWaitlistWelcome(email);
                break;

              case 'forgotPassword':
                console.log(`📨 Sending forgot password email to ${email}`);
                if (!token) {
                  throw new Error('Token is required for forgotPassword email');
                }
                await this.mailService.sendForgotPassword(email, token);
                break;

              case 'signup':
                console.log(`👋 Sending signup email to ${email}`);
                await this.mailService.sendSignupEmail(email);
                break;

              case 'signin':
                await this.mailService.sendSigninEmail(email);
                break;

              case 'passwordResetConfirmation':
                await this.mailService.sendPasswordResetConfirmation(email);
                break;

              case 'magicLinkSignIn':
                console.log(`🔗 Sending magic link email to ${email}`);
                if (!token) {
                  throw new Error('Token is required for magicLinkSignIn email');
                }
                await this.mailService.sendMagicLinkSignInEmail(email, token);
                break;

              default:
                console.warn(`🚫 Unknown email job type: ${type as string}`);
            }
          };
          return await Promise.race([
            work(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Job timed out')), timeoutMs),
            ),
          ]);
        } catch (error) {
          console.error(`❌ Failed to process job ${job.id}:`, error);
          throw error;
        }
      },
      {
        connection: { host, port },
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`✅ Job ${job.name} [${job.id}] completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.name} [${job?.id}] failed:`, err.message);
    });
  }
}
