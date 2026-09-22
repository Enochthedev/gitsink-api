/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { EmailTemplateData, EmailTemplateService } from './templates/email-template.service';
import { EmailBounceService } from './bounce/email-bounce.service';

interface MailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private transporter!: Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly emailBounceService: EmailBounceService,
  ) {}

  async onModuleInit() {
    const env = this.config.get<string>('NODE_ENV');

    if (env === 'development') {
      const testAccount: nodemailer.TestAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      this.logger.log(`🧪 Using Ethereal test account: ${testAccount.user}`);
    } else {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: parseInt(this.config.get<string>('SMTP_PORT') || '587', 10),
        secure: false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendMail({
    to,
    subject,
    text,
    html,
  }: MailPayload): Promise<{ messageId?: string; success: boolean }> {
    try {
      // Check if email is suppressed
      let isSuppressed = false;
      try {
        isSuppressed = await this.emailBounceService.isEmailSuppressed(to);
      } catch (bounceError) {
        this.logger.warn(
          `Failed to check email suppression for ${to}, proceeding with send:`,
          bounceError,
        );
        // Continue with sending if bounce check fails
      }

      if (isSuppressed) {
        this.logger.warn(`Email to ${to} is suppressed, skipping send`);
        return { success: false };
      }

      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const from = this.config.get<string>('EMAIL_FROM') || 'noreply@example.com';

      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        // Add message ID for tracking
        messageId: this.generateMessageId(),
      });

      this.logger.log(
        `📨 Email sent to ${to} | Subject: ${subject} | MessageId: ${info.messageId}`,
      );

      // Dev only preview link
      if (this.config.get('NODE_ENV') === 'development') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) this.logger.log(`🔍 Preview: ${previewUrl}`);
      }

      return { messageId: info.messageId, success: true };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`❌ Failed to send email to ${to}:`, {
        error: error.message,
        stack: error.stack,
        subject,
      });

      // Re-throw error so queue can handle retries
      throw error;
    }
  }

  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const domain = this.config.get<string>('EMAIL_DOMAIN') || 'gitsink.com';
    return `${timestamp}.${random}@${domain}`;
  }

  // Helper methods
  async sendWaitlistWelcome(email: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generateWaitlistWelcome(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendSignupEmail(email: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generateSignupConfirmation(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendForgotPassword(email: string, token: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generatePasswordReset({
      ...data,
      token,
    });
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendSigninEmail(email: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generateSignInNotification(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendMagicLinkSignInEmail(email: string, token: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generateMagicLinkSignIn({
      ...data,
      token,
    });
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendPasswordResetConfirmation(email: string, data: EmailTemplateData = {}) {
    const template = this.emailTemplateService.generatePasswordResetConfirmation(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendApiKeyRegeneration(email: string, data: EmailTemplateData) {
    const template = this.emailTemplateService.generateApiKeyRegeneration(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendAccountSuspension(email: string, data: EmailTemplateData) {
    const template = this.emailTemplateService.generateAccountSuspension(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendSyncFailureNotification(email: string, data: EmailTemplateData) {
    const template = this.emailTemplateService.generateSyncFailureNotification(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendWeeklyDigest(email: string, data: EmailTemplateData) {
    const template = this.emailTemplateService.generateWeeklyDigest(data);
    return this.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }
}
