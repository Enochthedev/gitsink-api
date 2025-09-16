import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { EmailTemplateService } from './templates/email-template.service';
import { EmailBounceService } from './bounce/email-bounce.service';
import * as nodemailer from 'nodemailer';

// Mock nodemailer
jest.mock('nodemailer');
const mockNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

describe('MailService', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;
  let emailTemplateService: jest.Mocked<EmailTemplateService>;
  let emailBounceService: jest.Mocked<EmailBounceService>;
  let mockTransporter: any;

  beforeEach(async () => {
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
    mockNodemailer.getTestMessageUrl.mockReturnValue('https://ethereal.email/message/test');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: EmailTemplateService,
          useValue: {
            generateWaitlistWelcome: jest.fn(),
            generateSignupConfirmation: jest.fn(),
            generatePasswordReset: jest.fn(),
            generateMagicLinkSignIn: jest.fn(),
            generatePasswordResetConfirmation: jest.fn(),
            generateSignInNotification: jest.fn(),
            generateApiKeyRegeneration: jest.fn(),
            generateAccountSuspension: jest.fn(),
            generateSyncFailureNotification: jest.fn(),
            generateWeeklyDigest: jest.fn(),
          },
        },
        {
          provide: EmailBounceService,
          useValue: {
            isEmailSuppressed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    configService = module.get(ConfigService);
    emailTemplateService = module.get(EmailTemplateService);
    emailBounceService = module.get(EmailBounceService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        NODE_ENV: 'test',
        EMAIL_FROM: 'test@gitsink.com',
        EMAIL_DOMAIN: 'gitsink.com',
        APP_NAME: 'GitSink',
        FRONTEND_URL: 'http://localhost:3001',
      };
      return config[key] || defaultValue;
    });

    // Setup default bounce service behavior
    emailBounceService.isEmailSuppressed.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize transporter for development environment', async () => {
      configService.get.mockImplementation(key => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      await service.onModuleInit();

      expect(mockNodemailer.createTestAccount).toHaveBeenCalled();
      expect(mockNodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'test@ethereal.email',
          pass: 'testpass',
        },
      });
    });

    it('should initialize transporter for production environment', async () => {
      configService.get.mockImplementation(key => {
        const config = {
          NODE_ENV: 'production',
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_USER: 'user@example.com',
          SMTP_PASS: 'password',
        };
        return config[key];
      });

      await service.onModuleInit();

      expect(mockNodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
      });
    });
  });

  describe('sendMail', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send email successfully', async () => {
      const mockMessageId = 'test-message-id';
      mockTransporter.sendMail.mockResolvedValue({ messageId: mockMessageId });

      const result = await service.sendMail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test text',
        html: '<p>Test HTML</p>',
      });

      expect(emailBounceService.isEmailSuppressed).toHaveBeenCalledWith('test@example.com');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test text',
        html: '<p>Test HTML</p>',
        messageId: expect.stringMatching(/^\d+\.[a-z0-9]+@gitsink\.com$/),
      });
      expect(result).toEqual({ messageId: mockMessageId, success: true });
    });

    it('should skip sending to suppressed email', async () => {
      emailBounceService.isEmailSuppressed.mockResolvedValue(true);

      const result = await service.sendMail({
        to: 'suppressed@example.com',
        subject: 'Test Subject',
        text: 'Test text',
        html: '<p>Test HTML</p>',
      });

      expect(emailBounceService.isEmailSuppressed).toHaveBeenCalledWith('suppressed@example.com');
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false });
    });

    it('should handle transporter not initialized error', async () => {
      // Create service without initializing
      const uninitializedService = new MailService(
        configService,
        emailTemplateService,
        emailBounceService,
      );

      await expect(
        uninitializedService.sendMail({
          to: 'test@example.com',
          subject: 'Test Subject',
          text: 'Test text',
          html: '<p>Test HTML</p>',
        }),
      ).rejects.toThrow('Email transporter not initialized');
    });

    it('should handle sendMail errors', async () => {
      const error = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(error);

      await expect(
        service.sendMail({
          to: 'test@example.com',
          subject: 'Test Subject',
          text: 'Test text',
          html: '<p>Test HTML</p>',
        }),
      ).rejects.toThrow('SMTP connection failed');
    });

    it('should generate unique message IDs', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      await service.sendMail({
        to: 'test1@example.com',
        subject: 'Test 1',
        text: 'Test 1',
        html: '<p>Test 1</p>',
      });

      await service.sendMail({
        to: 'test2@example.com',
        subject: 'Test 2',
        text: 'Test 2',
        html: '<p>Test 2</p>',
      });

      const calls = mockTransporter.sendMail.mock.calls;
      expect(calls[0][0].messageId).not.toEqual(calls[1][0].messageId);
      expect(calls[0][0].messageId).toMatch(/^\d+\.[a-z0-9]+@gitsink\.com$/);
      expect(calls[1][0].messageId).toMatch(/^\d+\.[a-z0-9]+@gitsink\.com$/);
    });
  });

  describe('sendWaitlistWelcome', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send waitlist welcome email', async () => {
      const mockTemplate = {
        subject: 'Welcome to GitSink Waitlist',
        text: 'Welcome text',
        html: '<p>Welcome HTML</p>',
      };
      emailTemplateService.generateWaitlistWelcome.mockReturnValue(mockTemplate);

      await service.sendWaitlistWelcome('test@example.com');

      expect(emailTemplateService.generateWaitlistWelcome).toHaveBeenCalledWith({});
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Welcome to GitSink Waitlist',
        text: 'Welcome text',
        html: '<p>Welcome HTML</p>',
        messageId: expect.any(String),
      });
    });

    it('should send waitlist welcome email with custom data', async () => {
      const mockTemplate = {
        subject: 'Welcome John to GitSink Waitlist',
        text: 'Welcome John text',
        html: '<p>Welcome John HTML</p>',
      };
      const customData = { name: 'John' };
      emailTemplateService.generateWaitlistWelcome.mockReturnValue(mockTemplate);

      await service.sendWaitlistWelcome('test@example.com', customData);

      expect(emailTemplateService.generateWaitlistWelcome).toHaveBeenCalledWith(customData);
    });
  });

  describe('sendSignupEmail', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send signup confirmation email', async () => {
      const mockTemplate = {
        subject: 'Welcome to GitSink',
        text: 'Signup text',
        html: '<p>Signup HTML</p>',
      };
      emailTemplateService.generateSignupConfirmation.mockReturnValue(mockTemplate);

      await service.sendSignupEmail('test@example.com');

      expect(emailTemplateService.generateSignupConfirmation).toHaveBeenCalledWith({});
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Welcome to GitSink',
        text: 'Signup text',
        html: '<p>Signup HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendForgotPassword', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send password reset email', async () => {
      const mockTemplate = {
        subject: 'Reset Your Password',
        text: 'Reset text',
        html: '<p>Reset HTML</p>',
      };
      emailTemplateService.generatePasswordReset.mockReturnValue(mockTemplate);

      await service.sendForgotPassword('test@example.com', 'reset-token');

      expect(emailTemplateService.generatePasswordReset).toHaveBeenCalledWith({
        token: 'reset-token',
      });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Reset Your Password',
        text: 'Reset text',
        html: '<p>Reset HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendMagicLinkSignInEmail', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send magic link email', async () => {
      const mockTemplate = {
        subject: 'Sign in to GitSink',
        text: 'Magic link text',
        html: '<p>Magic link HTML</p>',
      };
      emailTemplateService.generateMagicLinkSignIn.mockReturnValue(mockTemplate);

      await service.sendMagicLinkSignInEmail('test@example.com', 'magic-token');

      expect(emailTemplateService.generateMagicLinkSignIn).toHaveBeenCalledWith({
        token: 'magic-token',
      });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Sign in to GitSink',
        text: 'Magic link text',
        html: '<p>Magic link HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendPasswordResetConfirmation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send password reset confirmation email', async () => {
      const mockTemplate = {
        subject: 'Password Reset Successful',
        text: 'Confirmation text',
        html: '<p>Confirmation HTML</p>',
      };
      emailTemplateService.generatePasswordResetConfirmation.mockReturnValue(mockTemplate);

      await service.sendPasswordResetConfirmation('test@example.com');

      expect(emailTemplateService.generatePasswordResetConfirmation).toHaveBeenCalledWith({});
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Password Reset Successful',
        text: 'Confirmation text',
        html: '<p>Confirmation HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendSigninEmail', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send signin notification email', async () => {
      const mockTemplate = {
        subject: 'New Sign-in Detected',
        text: 'Signin text',
        html: '<p>Signin HTML</p>',
      };
      emailTemplateService.generateSignInNotification.mockReturnValue(mockTemplate);

      await service.sendSigninEmail('test@example.com');

      expect(emailTemplateService.generateSignInNotification).toHaveBeenCalledWith({});
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'New Sign-in Detected',
        text: 'Signin text',
        html: '<p>Signin HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendApiKeyRegeneration', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send API key regeneration email', async () => {
      const mockTemplate = {
        subject: 'API Key Regenerated',
        text: 'API key text',
        html: '<p>API key HTML</p>',
      };
      const data = { username: 'testuser', reason: 'User request' };
      emailTemplateService.generateApiKeyRegeneration.mockReturnValue(mockTemplate);

      await service.sendApiKeyRegeneration('test@example.com', data);

      expect(emailTemplateService.generateApiKeyRegeneration).toHaveBeenCalledWith(data);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'API Key Regenerated',
        text: 'API key text',
        html: '<p>API key HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendAccountSuspension', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send account suspension email', async () => {
      const mockTemplate = {
        subject: 'Account Suspended',
        text: 'Suspension text',
        html: '<p>Suspension HTML</p>',
      };
      const data = { username: 'testuser', reason: 'Terms violation' };
      emailTemplateService.generateAccountSuspension.mockReturnValue(mockTemplate);

      await service.sendAccountSuspension('test@example.com', data);

      expect(emailTemplateService.generateAccountSuspension).toHaveBeenCalledWith(data);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Account Suspended',
        text: 'Suspension text',
        html: '<p>Suspension HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendSyncFailureNotification', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send sync failure notification email', async () => {
      const mockTemplate = {
        subject: 'Sync Failed',
        text: 'Sync failure text',
        html: '<p>Sync failure HTML</p>',
      };
      const data = {
        repositoryName: 'test-repo',
        errorMessage: 'Connection failed',
      };
      emailTemplateService.generateSyncFailureNotification.mockReturnValue(mockTemplate);

      await service.sendSyncFailureNotification('test@example.com', data);

      expect(emailTemplateService.generateSyncFailureNotification).toHaveBeenCalledWith(data);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Sync Failed',
        text: 'Sync failure text',
        html: '<p>Sync failure HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('sendWeeklyDigest', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('should send weekly digest email', async () => {
      const mockTemplate = {
        subject: 'Weekly Digest',
        text: 'Digest text',
        html: '<p>Digest HTML</p>',
      };
      const data = {
        username: 'testuser',
        stats: { repositoriesSynced: 5, apiCalls: 100 },
      };
      emailTemplateService.generateWeeklyDigest.mockReturnValue(mockTemplate);

      await service.sendWeeklyDigest('test@example.com', data);

      expect(emailTemplateService.generateWeeklyDigest).toHaveBeenCalledWith(data);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@gitsink.com',
        to: 'test@example.com',
        subject: 'Weekly Digest',
        text: 'Digest text',
        html: '<p>Digest HTML</p>',
        messageId: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle SMTP connection errors gracefully', async () => {
      const smtpError = new Error('SMTP connection failed') as any;
      smtpError.code = 'ECONNREFUSED';
      mockTransporter.sendMail.mockRejectedValue(smtpError);

      await expect(
        service.sendMail({
          to: 'test@example.com',
          subject: 'Test',
          text: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow('SMTP connection failed');
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      mockTransporter.sendMail.mockRejectedValue(rateLimitError);

      await expect(
        service.sendMail({
          to: 'test@example.com',
          subject: 'Test',
          text: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle bounce service errors gracefully', async () => {
      emailBounceService.isEmailSuppressed.mockRejectedValue(new Error('Database error'));
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      // Should still send email if bounce check fails
      const result = await service.sendMail({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });
});
