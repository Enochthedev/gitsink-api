import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailTemplateData {
  [key: string]: any;
}

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailTemplateService {
  constructor(private readonly configService: ConfigService) {}

  private getAppName(): string {
    return this.configService.get<string>('APP_NAME') || 'GitSink';
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
  }

  private getSupportEmail(): string {
    return this.configService.get<string>('SUPPORT_EMAIL') || 'support@gitsink.com';
  }

  /**
   * Generate waitlist welcome email template
   */
  generateWaitlistWelcome(data: EmailTemplateData = {}): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();

    return {
      subject: `Welcome to the ${appName} waitlist!`,
      text: `
Hi there!

Thanks for joining the ${appName} waitlist! We're excited to have you on board.

We're working hard to bring you the best GitHub repository management and portfolio generation experience. You'll be among the first to know when we launch.

What to expect:
- Early access to ${appName} when we launch
- Updates on our progress
- Exclusive features for early adopters

Stay tuned for updates!

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateWaitlistWelcomeHtml(appName, baseUrl, data),
    };
  }

  /**
   * Generate signup confirmation email template
   */
  generateSignupConfirmation(data: EmailTemplateData = {}): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { username = 'Developer' } = data;

    return {
      subject: `Welcome to ${appName}! Your account is ready`,
      text: `
Hi ${username}!

Welcome to ${appName}! Your account has been successfully created.

You can now:
- Sync your GitHub repositories
- Generate AI-powered project descriptions
- Create beautiful developer profiles
- Access our comprehensive API

Get started: ${baseUrl}/dashboard

If you have any questions, feel free to reach out to our support team.

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateSignupConfirmationHtml(appName, baseUrl, username),
    };
  }

  /**
   * Generate password reset email template
   */
  generatePasswordReset(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { token, username = 'User' } = data;
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

    return {
      subject: `Reset your ${appName} password`,
      text: `
Hi ${username},

You requested a password reset for your ${appName} account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email.

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generatePasswordResetHtml(appName, baseUrl, resetUrl, username),
    };
  }

  /**
   * Generate magic link sign-in email template
   */
  generateMagicLinkSignIn(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { token, username = 'User' } = data;
    const magicLink = `${baseUrl}/auth/magic-link?token=${token}`;

    return {
      subject: `Sign in to ${appName}`,
      text: `
Hi ${username},

Click the link below to sign in to your ${appName} account:
${magicLink}

This link will expire in 15 minutes for security reasons.

If you didn't request this sign-in link, you can safely ignore this email.

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateMagicLinkSignInHtml(appName, baseUrl, magicLink, username),
    };
  }

  /**
   * Generate password reset confirmation email template
   */
  generatePasswordResetConfirmation(data: EmailTemplateData = {}): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { username = 'User' } = data;

    return {
      subject: `Your ${appName} password has been reset`,
      text: `
Hi ${username},

Your ${appName} password has been successfully reset.

If you didn't make this change, please contact our support team immediately at ${this.getSupportEmail()}.

For security, we recommend:
- Using a strong, unique password
- Enabling two-factor authentication if available
- Keeping your account information up to date

Sign in to your account: ${baseUrl}/auth/signin

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generatePasswordResetConfirmationHtml(appName, baseUrl, username),
    };
  }

  /**
   * Generate sign-in notification email template
   */
  generateSignInNotification(data: EmailTemplateData = {}): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { username = 'User', location = 'Unknown location', timestamp = new Date() } = data;

    return {
      subject: `New sign-in to your ${appName} account`,
      text: `
Hi ${username},

We noticed a new sign-in to your ${appName} account.

Details:
- Time: ${timestamp.toLocaleString()}
- Location: ${location}

If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately:

1. Change your password: ${baseUrl}/auth/change-password
2. Review your account activity: ${baseUrl}/account/security
3. Contact support if needed: ${this.getSupportEmail()}

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateSignInNotificationHtml(appName, baseUrl, username, location, timestamp),
    };
  }

  /**
   * Generate API key regeneration notification email template
   */
  generateApiKeyRegeneration(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const { username = 'User', reason = 'User request', timestamp = new Date() } = data;

    return {
      subject: `Your ${appName} API key has been regenerated`,
      text: `
Hi ${username},

Your ${appName} API key has been regenerated.

Details:
- Time: ${timestamp.toLocaleString()}
- Reason: ${reason}

Your old API key is no longer valid. Please update your applications with the new API key.

If you didn't request this change, please contact our support team immediately at ${this.getSupportEmail()}.

For security:
- Keep your API key secure and don't share it
- Regenerate your API key if you suspect it's been compromised
- Monitor your API usage regularly

Manage your API keys: ${baseUrl}/account/api-keys

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateApiKeyRegenerationHtml(appName, baseUrl, username, reason, timestamp),
    };
  }

  /**
   * Generate account suspension notification email template
   */
  generateAccountSuspension(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const {
      username = 'User',
      reason = 'Terms of service violation',
      suspendedUntil,
      appealUrl,
    } = data;

    return {
      subject: `Your ${appName} account has been suspended`,
      text: `
Hi ${username},

Your ${appName} account has been temporarily suspended.

Reason: ${reason}
${suspendedUntil ? `Suspended until: ${new Date(suspendedUntil).toLocaleString()}` : 'Suspension duration: Under review'}

What this means:
- You cannot access your account or API
- Your data is preserved and will be restored when the suspension is lifted
- You can appeal this decision if you believe it was made in error

${appealUrl ? `To appeal this decision, please visit: ${appealUrl}` : `To appeal this decision, please contact: ${this.getSupportEmail()}`}

We take account security and terms of service seriously to protect all our users.

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateAccountSuspensionHtml(
        appName,
        baseUrl,
        username,
        reason,
        suspendedUntil,
        appealUrl,
      ),
    };
  }

  /**
   * Generate sync failure notification email template
   */
  generateSyncFailureNotification(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const {
      username = 'User',
      repositoryName,
      errorMessage,
      retryCount = 0,
      maxRetries = 3,
    } = data;

    return {
      subject: `Sync failed for ${repositoryName} - ${appName}`,
      text: `
Hi ${username},

We encountered an issue while syncing your repository "${repositoryName}".

Error: ${errorMessage}
Retry attempt: ${retryCount}/${maxRetries}

${
  retryCount < maxRetries
    ? 'We will automatically retry this sync. No action is needed from you.'
    : 'We have exhausted all retry attempts. Please check your repository settings and try again.'
}

What you can do:
- Check if your repository is accessible
- Verify your GitHub token permissions
- Review your repository settings: ${baseUrl}/repositories

If the problem persists, please contact our support team at ${this.getSupportEmail()}.

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateSyncFailureNotificationHtml(
        appName,
        baseUrl,
        username,
        repositoryName,
        errorMessage,
        retryCount,
        maxRetries,
      ),
    };
  }

  /**
   * Generate weekly digest email template
   */
  generateWeeklyDigest(data: EmailTemplateData): EmailTemplate {
    const appName = this.getAppName();
    const baseUrl = this.getBaseUrl();
    const {
      username = 'User',
      weekStart,
      weekEnd,
      stats = {},
      newRepositories = [],
      topRepositories = [],
    } = data;

    const weekStartStr = weekStart ? new Date(weekStart).toLocaleDateString() : 'Last week';
    const weekEndStr = weekEnd ? new Date(weekEnd).toLocaleDateString() : 'This week';

    return {
      subject: `Your ${appName} weekly digest - ${weekStartStr}`,
      text: `
Hi ${username},

Here's your ${appName} activity summary for ${weekStartStr} - ${weekEndStr}:

📊 Your Stats:
- Repositories synced: ${stats.repositoriesSynced || 0}
- API calls made: ${stats.apiCalls || 0}
- Profile views: ${stats.profileViews || 0}
- New stars received: ${stats.newStars || 0}

${
  newRepositories.length > 0
    ? `
🆕 New Repositories Added:
${newRepositories.map(repo => `- ${repo.name}: ${repo.description || 'No description'}`).join('\n')}
`
    : ''
}

${
  topRepositories.length > 0
    ? `
⭐ Your Top Repositories:
${topRepositories.map((repo, index) => `${index + 1}. ${repo.name} (${repo.stars} stars)`).join('\n')}
`
    : ''
}

View your full dashboard: ${baseUrl}/dashboard

Best regards,
The ${appName} Team

---
${appName} - Sync, Enrich, and Showcase Your GitHub Repositories
${baseUrl}
      `.trim(),
      html: this.generateWeeklyDigestHtml(
        appName,
        baseUrl,
        username,
        weekStartStr,
        weekEndStr,
        stats,
        newRepositories,
        topRepositories,
      ),
    };
  }

  // HTML template generators
  private generateWaitlistWelcomeHtml(
    appName: string,
    baseUrl: string,
    data: EmailTemplateData,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${appName} Waitlist</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to the ${appName} Waitlist!</h1>
    </div>
    
    <div class="content">
      <p>Hi there!</p>
      
      <p>Thanks for joining the <strong>${appName}</strong> waitlist! We're excited to have you on board.</p>
      
      <p>We're working hard to bring you the best GitHub repository management and portfolio generation experience. You'll be among the first to know when we launch.</p>
      
      <div class="feature-box">
        <h3>What to expect:</h3>
        <ul>
          <li>✨ Early access to ${appName} when we launch</li>
          <li>📧 Updates on our progress</li>
          <li>🚀 Exclusive features for early adopters</li>
        </ul>
      </div>
      
      <p>Stay tuned for updates!</p>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateSignupConfirmationHtml(
    appName: string,
    baseUrl: string,
    username: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${appName}</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ${appName}!</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username}!</p>
      
      <p>Welcome to <strong>${appName}</strong>! Your account has been successfully created.</p>
      
      <div class="feature-box">
        <h3>You can now:</h3>
        <ul>
          <li>🔄 Sync your GitHub repositories</li>
          <li>🤖 Generate AI-powered project descriptions</li>
          <li>👤 Create beautiful developer profiles</li>
          <li>🔌 Access our comprehensive API</li>
        </ul>
      </div>
      
      <div class="cta-section">
        <a href="${baseUrl}/dashboard" class="button">Get Started</a>
      </div>
      
      <p>If you have any questions, feel free to reach out to our support team.</p>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generatePasswordResetHtml(
    appName: string,
    baseUrl: string,
    resetUrl: string,
    username: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Reset Your Password</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>You requested a password reset for your <strong>${appName}</strong> account.</p>
      
      <div class="cta-section">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </div>
      
      <p>Or copy and paste this link into your browser:</p>
      <div class="link-box">
        ${resetUrl}
      </div>
      
      <div class="warning-box">
        <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour for security reasons. If you didn't request this password reset, you can safely ignore this email.
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateMagicLinkSignInHtml(
    appName: string,
    baseUrl: string,
    magicLink: string,
    username: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to ${appName}</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔗 Sign in to ${appName}</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>Click the button below to sign in to your <strong>${appName}</strong> account:</p>
      
      <div class="cta-section">
        <a href="${magicLink}" class="button">Sign In</a>
      </div>
      
      <p>Or copy and paste this link into your browser:</p>
      <div class="link-box">
        ${magicLink}
      </div>
      
      <div class="warning-box">
        <strong>⚠️ Security Notice:</strong> This link will expire in 15 minutes for your security. If you didn't request this sign-in link, you can safely ignore this email.
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generatePasswordResetConfirmationHtml(
    appName: string,
    baseUrl: string,
    username: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Confirmation</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Password Reset Successful</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>Your <strong>${appName}</strong> password has been successfully reset.</p>
      
      <div class="info-box">
        <p>If you didn't make this change, please contact our support team immediately at <a href="mailto:${this.getSupportEmail()}">${this.getSupportEmail()}</a>.</p>
      </div>
      
      <div class="feature-box">
        <h3>For security, we recommend:</h3>
        <ul>
          <li>🔒 Using a strong, unique password</li>
          <li>🛡️ Enabling two-factor authentication if available</li>
          <li>📝 Keeping your account information up to date</li>
        </ul>
      </div>
      
      <div class="cta-section">
        <a href="${baseUrl}/auth/signin" class="button">Sign In to Your Account</a>
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateSignInNotificationHtml(
    appName: string,
    baseUrl: string,
    username: string,
    location: string,
    timestamp: Date,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Sign-in Notification</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 New Sign-in Detected</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>We noticed a new sign-in to your <strong>${appName}</strong> account.</p>
      
      <div class="info-box">
        <h3>Sign-in Details:</h3>
        <ul>
          <li><strong>Time:</strong> ${timestamp.toLocaleString()}</li>
          <li><strong>Location:</strong> ${location}</li>
        </ul>
      </div>
      
      <p>If this was you, no action is needed.</p>
      
      <div class="warning-box">
        <strong>⚠️ Don't recognize this activity?</strong> Please secure your account immediately:
        <ol>
          <li><a href="${baseUrl}/auth/change-password">Change your password</a></li>
          <li><a href="${baseUrl}/account/security">Review your account activity</a></li>
          <li><a href="mailto:${this.getSupportEmail()}">Contact support if needed</a></li>
        </ol>
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private getEmailStyles(): string {
    return `
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 0;
    background-color: #f8f9fa;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }
  .header {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    color: white;
    padding: 30px 20px;
    text-align: center;
  }
  .header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }
  .content {
    padding: 30px 20px;
  }
  .button {
    display: inline-block;
    padding: 12px 24px;
    background-color: #007bff;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  .button:hover {
    background-color: #0056b3;
  }
  .cta-section {
    text-align: center;
    margin: 30px 0;
  }
  .feature-box {
    background-color: #f8f9fa;
    border-left: 4px solid #007bff;
    padding: 20px;
    margin: 20px 0;
    border-radius: 4px;
  }
  .info-box {
    background-color: #e7f3ff;
    border: 1px solid #b3d9ff;
    padding: 15px;
    margin: 20px 0;
    border-radius: 4px;
  }
  .warning-box {
    background-color: #fff3cd;
    border: 1px solid #ffeaa7;
    padding: 15px;
    margin: 20px 0;
    border-radius: 4px;
    color: #856404;
  }
  .link-box {
    background-color: #f8f9fa;
    padding: 10px;
    border-radius: 4px;
    font-family: monospace;
    word-break: break-all;
    margin: 15px 0;
  }
  .footer {
    background-color: #f8f9fa;
    padding: 20px;
    text-align: center;
    font-size: 14px;
    color: #666;
    border-top: 1px solid #eee;
  }
  .footer a {
    color: #007bff;
    text-decoration: none;
  }
  ul, ol {
    padding-left: 20px;
  }
  li {
    margin: 8px 0;
  }
</style>
    `;
  }

  private generateApiKeyRegenerationHtml(
    appName: string,
    baseUrl: string,
    username: string,
    reason: string,
    timestamp: Date,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Key Regenerated</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔑 API Key Regenerated</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>Your <strong>${appName}</strong> API key has been regenerated.</p>
      
      <div class="info-box">
        <h3>Details:</h3>
        <ul>
          <li><strong>Time:</strong> ${timestamp.toLocaleString()}</li>
          <li><strong>Reason:</strong> ${reason}</li>
        </ul>
      </div>
      
      <div class="warning-box">
        <strong>⚠️ Important:</strong> Your old API key is no longer valid. Please update your applications with the new API key.
      </div>
      
      <p>If you didn't request this change, please contact our support team immediately at <a href="mailto:${this.getSupportEmail()}">${this.getSupportEmail()}</a>.</p>
      
      <div class="feature-box">
        <h3>For security:</h3>
        <ul>
          <li>🔒 Keep your API key secure and don't share it</li>
          <li>🔄 Regenerate your API key if you suspect it's been compromised</li>
          <li>📊 Monitor your API usage regularly</li>
        </ul>
      </div>
      
      <div class="cta-section">
        <a href="${baseUrl}/account/api-keys" class="button">Manage API Keys</a>
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateAccountSuspensionHtml(
    appName: string,
    baseUrl: string,
    username: string,
    reason: string,
    suspendedUntil: any,
    appealUrl: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Suspended</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);">
      <h1>⚠️ Account Suspended</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>Your <strong>${appName}</strong> account has been temporarily suspended.</p>
      
      <div class="warning-box">
        <h3>Suspension Details:</h3>
        <ul>
          <li><strong>Reason:</strong> ${reason}</li>
          ${suspendedUntil ? `<li><strong>Suspended until:</strong> ${new Date(suspendedUntil).toLocaleString()}</li>` : '<li><strong>Duration:</strong> Under review</li>'}
        </ul>
      </div>
      
      <div class="info-box">
        <h3>What this means:</h3>
        <ul>
          <li>You cannot access your account or API</li>
          <li>Your data is preserved and will be restored when the suspension is lifted</li>
          <li>You can appeal this decision if you believe it was made in error</li>
        </ul>
      </div>
      
      ${
        appealUrl
          ? `
      <div class="cta-section">
        <a href="${appealUrl}" class="button">Appeal This Decision</a>
      </div>
      `
          : `
      <p>To appeal this decision, please contact: <a href="mailto:${this.getSupportEmail()}">${this.getSupportEmail()}</a></p>
      `
      }
      
      <p>We take account security and terms of service seriously to protect all our users.</p>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateSyncFailureNotificationHtml(
    appName: string,
    baseUrl: string,
    username: string,
    repositoryName: string,
    errorMessage: string,
    retryCount: number,
    maxRetries: number,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sync Failed</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: #212529;">
      <h1>⚠️ Sync Failed</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>We encountered an issue while syncing your repository <strong>"${repositoryName}"</strong>.</p>
      
      <div class="warning-box">
        <h3>Error Details:</h3>
        <ul>
          <li><strong>Error:</strong> ${errorMessage}</li>
          <li><strong>Retry attempt:</strong> ${retryCount}/${maxRetries}</li>
        </ul>
      </div>
      
      ${
        retryCount < maxRetries
          ? `
      <div class="info-box">
        <p><strong>🔄 Automatic Retry:</strong> We will automatically retry this sync. No action is needed from you.</p>
      </div>
      `
          : `
      <div class="warning-box">
        <p><strong>❌ Max Retries Reached:</strong> We have exhausted all retry attempts. Please check your repository settings and try again.</p>
      </div>
      `
      }
      
      <div class="feature-box">
        <h3>What you can do:</h3>
        <ul>
          <li>🔍 Check if your repository is accessible</li>
          <li>🔑 Verify your GitHub token permissions</li>
          <li>⚙️ Review your repository settings</li>
        </ul>
      </div>
      
      <div class="cta-section">
        <a href="${baseUrl}/repositories" class="button">Review Repository Settings</a>
      </div>
      
      <p>If the problem persists, please contact our support team at <a href="mailto:${this.getSupportEmail()}">${this.getSupportEmail()}</a>.</p>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private generateWeeklyDigestHtml(
    appName: string,
    baseUrl: string,
    username: string,
    weekStartStr: string,
    weekEndStr: string,
    stats: any,
    newRepositories: any[],
    topRepositories: any[],
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Digest</title>
  ${this.getEmailStyles()}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Your Weekly Digest</h1>
    </div>
    
    <div class="content">
      <p>Hi ${username},</p>
      
      <p>Here's your <strong>${appName}</strong> activity summary for ${weekStartStr} - ${weekEndStr}:</p>
      
      <div class="feature-box">
        <h3>📊 Your Stats:</h3>
        <ul>
          <li>🔄 Repositories synced: <strong>${stats.repositoriesSynced || 0}</strong></li>
          <li>🔌 API calls made: <strong>${stats.apiCalls || 0}</strong></li>
          <li>👀 Profile views: <strong>${stats.profileViews || 0}</strong></li>
          <li>⭐ New stars received: <strong>${stats.newStars || 0}</strong></li>
        </ul>
      </div>
      
      ${
        newRepositories.length > 0
          ? `
      <div class="info-box">
        <h3>🆕 New Repositories Added:</h3>
        <ul>
          ${newRepositories.map(repo => `<li><strong>${repo.name}:</strong> ${repo.description || 'No description'}</li>`).join('')}
        </ul>
      </div>
      `
          : ''
      }
      
      ${
        topRepositories.length > 0
          ? `
      <div class="feature-box">
        <h3>⭐ Your Top Repositories:</h3>
        <ol>
          ${topRepositories.map(repo => `<li><strong>${repo.name}</strong> (${repo.stars} stars)</li>`).join('')}
        </ol>
      </div>
      `
          : ''
      }
      
      <div class="cta-section">
        <a href="${baseUrl}/dashboard" class="button">View Full Dashboard</a>
      </div>
    </div>
    
    ${this.getEmailFooter(appName, baseUrl)}
  </div>
</body>
</html>
    `.trim();
  }

  private getEmailFooter(appName: string, baseUrl: string): string {
    return `
<div class="footer">
  <p>Best regards,<br>The <strong>${appName}</strong> Team</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p>
    <strong>${appName}</strong> - Sync, Enrich, and Showcase Your GitHub Repositories<br>
    <a href="${baseUrl}">${baseUrl}</a>
  </p>
  <p>
    <a href="${baseUrl}/unsubscribe">Unsubscribe</a> | 
    <a href="${baseUrl}/privacy">Privacy Policy</a> | 
    <a href="mailto:${this.getSupportEmail()}">Support</a>
  </p>
</div>
    `;
  }
}
