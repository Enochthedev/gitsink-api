import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: Number(config.get('SMTP_PORT')) || 587,
      secure: false,
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASS'),
      },
    });
  }

  async sendMail(to: string, subject: string, text: string) {
    if (!this.transporter) return;
    await this.transporter.sendMail({
      from: this.config.get('EMAIL_FROM') || 'noreply@example.com',
      to,
      subject,
      text,
    });
  }

  sendWaitlistWelcome(email: string) {
    return this.sendMail(email, 'Welcome to the waitlist', 'Thanks for joining!');
  }

  sendSignupEmail(email: string) {
    return this.sendMail(email, 'Welcome to GitSink', 'Your account was created');
  }

  sendSigninEmail(email: string) {
    return this.sendMail(email, 'Login Notification', 'You just signed in');
  }

  sendForgotPassword(email: string, token: string) {
    const text = `Reset token: ${token}`;
    return this.sendMail(email, 'Password reset', text);
  }

  sendPasswordResetConfirmation(email: string) {
    return this.sendMail(email, 'Password changed', 'Your password was reset');
  }
}
