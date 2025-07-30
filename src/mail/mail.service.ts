/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

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

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const env = this.config.get<string>('NODE_ENV');

    if (env === 'development') {
      const testAccount: nodemailer.TestAccount =
        await nodemailer.createTestAccount();
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

  async sendMail({ to, subject, text, html }: MailPayload) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const from =
        this.config.get<string>('EMAIL_FROM') || 'noreply@example.com';

      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });

      this.logger.log(`📨 Email sent to ${to} | Subject: ${subject}`);

      // Dev only preview link
      if (this.config.get('NODE_ENV') === 'development') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) this.logger.log(`🔍 Preview: ${previewUrl}`);
      }
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error(`❌ Failed to send email to ${to}:`, err.stack);
      } else {
        this.logger.error(`❌ Failed to send email to ${to}:`, String(err));
      }
    }
  }

  // Helper methods
  sendWaitlistWelcome(email: string) {
    return this.sendMail({
      to: email,
      subject: 'Welcome to the waitlist',
      text: 'Thanks for joining!',
      html: `<p>Thanks for joining the <strong>GitSink</strong> waitlist!</p>`,
    });
  }

  sendSignupEmail(email: string) {
    return this.sendMail({
      to: email,
      subject: 'Welcome to GitSink',
      text: 'Your account was created.',
      html: `<p>Your GitSink account has been created!</p>`,
    });
  }

  sendForgotPassword(email: string, token: string) {
    return this.sendMail({
      to: email,
      subject: 'Password Reset',
      text: `Use this token to reset your password: ${token}`,
      html: `<p>Reset your password using this token: <strong>${token}</strong></p>`,
    });
  }

  sendSigninEmail(email: string) {
    return this.sendMail({
      to: email,
      subject: 'Sign In Notification',
      text: 'You have signed in successfully.',
      html: `<p>You have signed in successfully to your GitSink account.</p>`,
    });
  }

  sendPasswordResetConfirmation(email: string) {
    return this.sendMail({
      to: email,
      subject: 'Password Reset Confirmation',
      text: 'Your password has been reset successfully.',
      html: `<p>Your password has been reset successfully.</p>`,
    });
  }
}
