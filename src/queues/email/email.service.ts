import { Injectable } from '@nestjs/common';
import { EnqueueService } from './enqueue/enqueue.service';

@Injectable()
export class EmailService {
  constructor(private readonly enqueueService: EnqueueService) {}

  async sendWaitlistWelcome(email: string) {
    return this.enqueueService.enqueueWaitlistWelcome(email);
  }

  async sendSignupEmail(email: string) {
    return this.enqueueService.enqueueSignupEmail(email);
  }

  async sendForgotPassword(email: string, token: string) {
    return this.enqueueService.enqueueForgotPassword(email, token);
  }

  async sendSigninEmail(email: string) {
    return this.enqueueService.enqueueSigninEmail(email);
  }

  async sendMagicLinkSignInEmail(email: string, token: string) {
    return this.enqueueService.enqueueMagicLinkSignInEmail(email, token);
  }

  async sendPasswordResetConfirmation(email: string) {
    return this.enqueueService.enqueuePasswordResetConfirmation(email);
  }

  async sendApiKeyRegeneration(email: string, data: any = {}) {
    return this.enqueueService.enqueueApiKeyRegeneration(email, data);
  }

  async sendAccountSuspension(email: string, data: any = {}) {
    return this.enqueueService.enqueueAccountSuspension(email, data);
  }

  async sendSyncFailureNotification(email: string, data: any = {}) {
    return this.enqueueService.enqueueSyncFailureNotification(email, data);
  }

  async sendWeeklyDigest(email: string, data: any = {}) {
    return this.enqueueService.enqueueWeeklyDigest(email, data);
  }
}
