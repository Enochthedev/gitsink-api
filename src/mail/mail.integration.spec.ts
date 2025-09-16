import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from './mail.module';
import { MailService } from './mail.service';
import { EmailBounceService } from './bounce/email-bounce.service';
import { EmailTemplateService } from './templates/email-template.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');
const mockNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

describe('Mail Integration', () => {
  let app: TestingModule;
  let mailService: MailService;
  let emailBounceService: EmailBounceService;
  let emailTemplateService: EmailTemplateService;
  let prismaService: PrismaService;
  let mockTransporter: any;

  beforeAll(async () => {
    // Create mock transporter
    mockTransporter = {
      sendMail: jest.fn(),
    };

    // Mock nodemailer methods
    mockNodemailer.createTransport.mockReturnValue(mockTransporter);
    mockNodemailer.createTestAccount.mockResolvedValue({
      user: 'test@ethereal.email',
      pass: 'testpass',
      smtp: {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
      },
    } as any);

    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
        MailModule,
      ],
    }).compile();

    mailService = app.get<MailService>(MailService);
    emailBounceService = app.get<EmailBounceService>(EmailBounceService);
    emailTemplateService = app.get<EmailTemplateService>(EmailTemplateService);
    prismaService = app.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransporter.sendMail.mockResolvedValue({
      messageId: 'test-message-id',
    });
  });

  describe('Email Templates Integration', () => {
    it('should generate and send waitlist welcome email', async () => {
      const email = 'test@example.com';
      const data = { name: 'John Doe' };

      const result = await mailService.sendWaitlistWelcome(email, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('waitlist'),
          text: expect.any(String),
          html: expect.any(String),
        }),
      );
    });

    it('should generate and send signup confirmation email', async () => {
      const email = 'test@example.com';
      const data = { username: 'johndoe' };

      const result = await mailService.sendSignupEmail(email, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Welcome'),
          text: expect.any(String),
          html: expect.any(String),
        }),
      );
    });

    it('should generate and send password reset email', async () => {
      const email = 'test@example.com';
      const token = 'reset-token-123';
      const data = { username: 'johndoe' };

      const result = await mailService.sendForgotPassword(email, token, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Reset'),
          text: expect.stringContaining(token),
          html: expect.stringContaining(token),
        }),
      );
    });

    it('should generate and send magic link email', async () => {
      const email = 'test@example.com';
      const token = 'magic-token-123';
      const data = { username: 'johndoe' };

      const result = await mailService.sendMagicLinkSignInEmail(email, token, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Sign in'),
          text: expect.stringContaining(token),
          html: expect.stringContaining(token),
        }),
      );
    });

    it('should generate and send API key regeneration email', async () => {
      const email = 'test@example.com';
      const data = {
        username: 'johndoe',
        reason: 'User request',
        timestamp: new Date(),
      };

      const result = await mailService.sendApiKeyRegeneration(email, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('API key'),
          text: expect.stringContaining('regenerated'),
          html: expect.stringContaining('regenerated'),
        }),
      );
    });

    it('should generate and send sync failure notification', async () => {
      const email = 'test@example.com';
      const data = {
        username: 'johndoe',
        repositoryName: 'test-repo',
        errorMessage: 'Connection timeout',
        retryCount: 2,
        maxRetries: 3,
      };

      const result = await mailService.sendSyncFailureNotification(email, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Sync failed'),
          text: expect.stringContaining('test-repo'),
          html: expect.stringContaining('test-repo'),
        }),
      );
    });

    it('should generate and send weekly digest email', async () => {
      const email = 'test@example.com';
      const data = {
        username: 'johndoe',
        weekStart: new Date('2023-01-01'),
        weekEnd: new Date('2023-01-07'),
        stats: {
          repositoriesSynced: 5,
          apiCalls: 100,
          profileViews: 25,
          newStars: 10,
        },
        newRepositories: [{ name: 'new-repo', description: 'A new repository' }],
        topRepositories: [{ name: 'top-repo', stars: 50 }],
      };

      const result = await mailService.sendWeeklyDigest(email, data);

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('digest'),
          text: expect.stringContaining('5'),
          html: expect.stringContaining('5'),
        }),
      );
    });
  });

  describe('Email Bounce Integration', () => {
    const testEmail = 'bounce-test@example.com';

    beforeEach(async () => {
      // Clean up any existing test data
      try {
        await prismaService.emailSuppression.deleteMany({
          where: { email: testEmail },
        });
        await prismaService.emailBounce.deleteMany({
          where: { email: testEmail },
        });
        await prismaService.emailComplaint.deleteMany({
          where: { email: testEmail },
        });
        await prismaService.emailDelivery.deleteMany({
          where: { email: testEmail },
        });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should suppress email after permanent bounce', async () => {
      // Simulate permanent bounce
      await emailBounceService.handleBounce({
        messageId: 'test-message-1',
        email: testEmail,
        bounceType: 'permanent',
        bounceSubType: 'general',
        timestamp: new Date(),
      });

      // Check if email is suppressed
      const isSuppressed = await emailBounceService.isEmailSuppressed(testEmail);
      expect(isSuppressed).toBe(true);

      // Try to send email - should be skipped
      const result = await mailService.sendWaitlistWelcome(testEmail);
      expect(result.success).toBe(false);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should handle complaint and suppress email', async () => {
      // Simulate complaint
      await emailBounceService.handleComplaint({
        messageId: 'test-message-2',
        email: testEmail,
        complaintType: 'abuse',
        timestamp: new Date(),
      });

      // Check if email is suppressed
      const isSuppressed = await emailBounceService.isEmailSuppressed(testEmail);
      expect(isSuppressed).toBe(true);
    });

    it('should clear transient bounce suppression after successful delivery', async () => {
      // Create multiple transient bounces to trigger suppression
      for (let i = 0; i < 6; i++) {
        await emailBounceService.handleBounce({
          messageId: `test-message-${i}`,
          email: testEmail,
          bounceType: 'transient',
          bounceSubType: 'general',
          timestamp: new Date(),
        });
      }

      // Verify suppression
      let isSuppressed = await emailBounceService.isEmailSuppressed(testEmail);
      expect(isSuppressed).toBe(true);

      // Simulate successful delivery
      await emailBounceService.handleDelivery({
        messageId: 'test-delivery-1',
        email: testEmail,
        timestamp: new Date(),
      });

      // Check if suppression is cleared
      isSuppressed = await emailBounceService.isEmailSuppressed(testEmail);
      expect(isSuppressed).toBe(false);
    });

    it('should get correct bounce statistics', async () => {
      // Add some bounce records
      await emailBounceService.handleBounce({
        messageId: 'test-message-1',
        email: testEmail,
        bounceType: 'permanent',
        bounceSubType: 'general',
        timestamp: new Date(),
      });

      await emailBounceService.handleBounce({
        messageId: 'test-message-2',
        email: testEmail,
        bounceType: 'transient',
        bounceSubType: 'general',
        timestamp: new Date(),
      });

      const stats = await emailBounceService.getBounceStats(testEmail);

      expect(stats.totalBounces).toBe(2);
      expect(stats.permanentBounces).toBe(1);
      expect(stats.transientBounces).toBe(1);
      expect(stats.lastBounceAt).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle SMTP errors gracefully', async () => {
      const smtpError = new Error('SMTP connection failed') as any;
      smtpError.code = 'ECONNREFUSED';
      mockTransporter.sendMail.mockRejectedValue(smtpError);

      await expect(mailService.sendWaitlistWelcome('test@example.com')).rejects.toThrow(
        'SMTP connection failed',
      );
    });

    it('should handle template generation errors', async () => {
      // Test with invalid template data
      const invalidData = { invalidField: null };

      // This should not throw an error as templates should handle missing data gracefully
      const result = await mailService.sendWaitlistWelcome('test@example.com', invalidData);
      expect(result.success).toBe(true);
    });

    it('should handle bounce service database errors gracefully', async () => {
      // Mock database error
      jest
        .spyOn(prismaService.emailSuppression, 'findUnique')
        .mockRejectedValue(new Error('Database error'));

      // Should still send email if bounce check fails
      const result = await mailService.sendWaitlistWelcome('test@example.com');
      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });

  describe('Configuration Integration', () => {
    it('should use correct SMTP configuration for development', async () => {
      const configService = app.get<ConfigService>(ConfigService);
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      // Reinitialize mail service
      await mailService.onModuleInit();

      expect(mockNodemailer.createTestAccount).toHaveBeenCalled();
      expect(mockNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
        }),
      );
    });

    it('should use production SMTP configuration', async () => {
      const configService = app.get<ConfigService>(ConfigService);
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        const config = {
          NODE_ENV: 'production',
          SMTP_HOST: 'smtp.production.com',
          SMTP_PORT: '587',
          SMTP_USER: 'user@production.com',
          SMTP_PASS: 'password',
        };
        return config[key];
      });

      // Reinitialize mail service
      await mailService.onModuleInit();

      expect(mockNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.production.com',
          port: 587,
          secure: false,
          auth: {
            user: 'user@production.com',
            pass: 'password',
          },
        }),
      );
    });
  });
});
