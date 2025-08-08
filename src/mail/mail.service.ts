/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
    const resetUrl = this.createPasswordResetUrl(token);
    const appName = this.config.get<string>('APP_NAME') || 'GitSink';

    return this.sendMail({
      to: email,
      subject: 'Password Reset Request',
      text: `Reset your password by clicking this link: ${resetUrl}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your ${appName} account.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Reset Password
          </a>
        </p>
        <p>Or copy and paste this link: <br>
           <code style="background-color: #f5f5f5; padding: 5px;">${resetUrl}</code>
        </p>
        <p><small>This link expires in 1 hour. If you didn't request this, please ignore this email.</small></p>
      </div>
    `,
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

  sendMagicLinkSignInEmail(email: string, token: string) {
    const magicLink = this.createMagicLink(token);
    const appName = this.config.get<string>('APP_NAME') || 'GitSink';

    return this.sendMail({
      to: email,
      subject: `Sign in to ${appName}`,
      text: this.createMagicLinkTextTemplate(magicLink, appName),
      html: this.createMagicLinkHtmlTemplate(magicLink, appName),
    });
  }

  private createMagicLink(token: string): string {
    const baseUrl =
      this.config.get<string>('MAGIC_LINK_BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}/auth/magic-link?token=${token}`;
  }

  private createMagicLinkTextTemplate(
    magicLink: string,
    appName: string,
  ): string {
    return `
Sign in to ${appName}

Click the link below to sign in to your account:
${magicLink}

This link will expire in 15 minutes for security reasons.

If you didn't request this sign-in link, you can safely ignore this email.

---
${appName} Team
    `.trim();
  }

  private createMagicLinkHtmlTemplate(
    magicLink: string,
    appName: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to ${appName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .button:hover { background-color: #0056b3; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
    .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 12px; margin: 20px 0; color: #856404; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Sign in to ${appName}</h1>
  </div>
  
  <p>Hello,</p>
  
  <p>Click the button below to sign in to your ${appName} account:</p>
  
  <p style="text-align: center; margin: 30px 0;">
    <a href="${magicLink}" class="button">Sign In</a>
  </p>
  
  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">
    ${magicLink}
  </p>
  
  <div class="warning">
    <strong>Security Notice:</strong> This link will expire in 15 minutes for your security. If you didn't request this sign-in link, you can safely ignore this email.
  </div>
  
  <div class="footer">
    <p>Best regards,<br>The ${appName} Team</p>
  </div>
</body>
</html>
    `.trim();
  }

  sendPasswordResetConfirmation(email: string) {
    return this.sendMail({
      to: email,
      subject: 'Password Reset Confirmation',
      text: 'Your password has been reset successfully.',
      html: `<p>Your password has been reset successfully.</p>`,
    });
  }
  private createPasswordResetUrl(token: string): string {
    const baseUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    return `${baseUrl}/auth/reset-password?token=${token}`;
  }
}
