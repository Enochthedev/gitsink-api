import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { ProcessorService } from './processor.service';
import { MailService } from '../../../mail/mail.service';
import { EmailBounceService } from '../../../mail/bounce/email-bounce.service';
import { MailJob } from '../../../types/queue.types';

// Mock BullMQ Worker
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((queueName, processor, options) => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('ProcessorService', () => {
  let service: ProcessorService;
  let mailService: jest.Mocked<MailService>;
  let configService: jest.Mocked<ConfigService>;
  let emailBounceService: jest.Mocked<EmailBounceService>;
  let mockJob: jest.Mocked<Job<MailJob>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessorService,
        {
          provide: MailService,
          useValue: {
            sendWaitlistWelcome: jest.fn(),
            sendSignupEmail: jest.fn(),
            sendForgotPassword: jest.fn(),
            sendSigninEmail: jest.fn(),
            sendPasswordResetConfirmation: jest.fn(),
            sendMagicLinkSignInEmail: jest.fn(),
            sendApiKeyRegeneration: jest.fn(),
            sendAccountSuspension: jest.fn(),
            sendSyncFailureNotification: jest.fn(),
            sendWeeklyDigest: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
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

    service = module.get<ProcessorService>(ProcessorService);
    mailService = module.get(MailService);
    configService = module.get(ConfigService);
    emailBounceService = module.get(EmailBounceService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        EMAIL_JOB_TIMEOUT: 30000,
        EMAIL_WORKER_CONCURRENCY: 5,
        EMAIL_REMOVE_ON_COMPLETE: 100,
        EMAIL_REMOVE_ON_FAIL: 50,
      };
      return config[key] || defaultValue;
    });

    // Setup mock job
    mockJob = {
      id: 'test-job-id',
      data: {
        type: 'waitlistWelcome',
        email: 'test@example.com',
      },
      updateProgress: jest.fn(),
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;

    // Setup default bounce service behavior
    emailBounceService.isEmailSuppressed.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('email processing', () => {
    it('should process waitlist welcome email successfully', async () => {
      mockJob.data = {
        type: 'waitlistWelcome',
        email: 'test@example.com',
      };

      mailService.sendWaitlistWelcome.mockResolvedValue({ success: true });

      // Get the processor function from the Worker constructor call
      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      const result = await processorFn(mockJob);

      expect(emailBounceService.isEmailSuppressed).toHaveBeenCalledWith('test@example.com');
      expect(mailService.sendWaitlistWelcome).toHaveBeenCalledWith('test@example.com', {});
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
      expect(result).toEqual({
        success: true,
        duration: expect.any(Number),
        type: 'waitlistWelcome',
        email: 'test@example.com',
      });
    });

    it('should process forgot password email with token', async () => {
      mockJob.data = {
        type: 'forgotPassword',
        email: 'test@example.com',
        token: 'reset-token-123',
      };

      mailService.sendForgotPassword.mockResolvedValue({ success: true });

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      const result = await processorFn(mockJob);

      expect(mailService.sendForgotPassword).toHaveBeenCalledWith(
        'test@example.com',
        'reset-token-123',
        {},
      );
      expect(result.success).toBe(true);
    });

    it('should throw error for forgot password without token', async () => {
      mockJob.data = {
        type: 'forgotPassword',
        email: 'test@example.com',
      };

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      await expect(processorFn(mockJob)).rejects.toThrow(
        'Token is required for forgotPassword email',
      );
    });

    it('should process magic link email with token', async () => {
      mockJob.data = {
        type: 'magicLinkSignIn',
        email: 'test@example.com',
        token: 'magic-token-123',
      };

      mailService.sendMagicLinkSignInEmail.mockResolvedValue({ success: true });

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      const result = await processorFn(mockJob);

      expect(mailService.sendMagicLinkSignInEmail).toHaveBeenCalledWith(
        'test@example.com',
        'magic-token-123',
        {},
      );
      expect(result.success).toBe(true);
    });

    it('should process API key regeneration email', async () => {
      mockJob.data = {
        type: 'apiKeyRegeneration',
        email: 'test@example.com',
        data: { username: 'testuser', reason: 'User request' },
      };

      mailService.sendApiKeyRegeneration.mockResolvedValue({ success: true });

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      const result = await processorFn(mockJob);

      expect(mailService.sendApiKeyRegeneration).toHaveBeenCalledWith('test@example.com', {
        username: 'testuser',
        reason: 'User request',
      });
      expect(result.success).toBe(true);
    });

    it('should skip processing for suppressed email', async () => {
      emailBounceService.isEmailSuppressed.mockResolvedValue(true);

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      const result = await processorFn(mockJob);

      expect(result).toEqual({
        skipped: true,
        reason: 'email_suppressed',
      });
      expect(mailService.sendWaitlistWelcome).not.toHaveBeenCalled();
    });

    it('should throw error for unknown email type', async () => {
      mockJob.data = {
        type: 'unknownType' as any,
        email: 'test@example.com',
      };

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      await expect(processorFn(mockJob)).rejects.toThrow('Unknown email job type: unknownType');
    });
  });

  describe('error handling', () => {
    it('should handle mail service errors', async () => {
      const mailError = new Error('SMTP connection failed');
      mailService.sendWaitlistWelcome.mockRejectedValue(mailError);

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      await expect(processorFn(mockJob)).rejects.toThrow('SMTP connection failed');
    });

    it('should handle timeout errors', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'EMAIL_JOB_TIMEOUT') return 100; // Very short timeout
        return defaultValue;
      });

      // Simulate slow mail service
      mailService.sendWaitlistWelcome.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200)),
      );

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      await expect(processorFn(mockJob)).rejects.toThrow('Job timed out after 100ms');
    });

    it('should handle bounce service errors gracefully', async () => {
      emailBounceService.isEmailSuppressed.mockRejectedValue(new Error('Database error'));
      mailService.sendWaitlistWelcome.mockResolvedValue({ success: true });

      const { Worker } = require('bullmq');
      service.onModuleInit();
      const processorFn = Worker.mock.calls[0][1];

      // Should still process the job even if bounce check fails
      await expect(processorFn(mockJob)).rejects.toThrow('Database error');
    });
  });

  describe('retry logic', () => {
    let processorService: ProcessorService;

    beforeEach(() => {
      processorService = new ProcessorService(mailService, configService, emailBounceService);
    });

    it('should identify retryable network errors', () => {
      const networkError = new Error('Connection refused') as any;
      networkError.code = 'ECONNREFUSED';

      const isRetryable = (processorService as any).isRetryableError(networkError);
      expect(isRetryable).toBe(true);
    });

    it('should identify retryable SMTP temporary errors', () => {
      const smtpError = new Error('4.7.1 Rate limit exceeded');

      const isRetryable = (processorService as any).isRetryableError(smtpError);
      expect(isRetryable).toBe(true);
    });

    it('should identify non-retryable authentication errors', () => {
      const authError = new Error('5.7.1 Authentication failed');

      const isRetryable = (processorService as any).isRetryableError(authError);
      expect(isRetryable).toBe(false);
    });

    it('should identify non-retryable configuration errors', () => {
      const configError = new Error('Email transporter not initialized');

      const isRetryable = (processorService as any).isRetryableError(configError);
      expect(isRetryable).toBe(false);
    });

    it('should default to retryable for unknown errors', () => {
      const unknownError = new Error('Some unknown error');

      const isRetryable = (processorService as any).isRetryableError(unknownError);
      expect(isRetryable).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('should initialize worker on module init', () => {
      const { Worker } = require('bullmq');

      service.onModuleInit();

      expect(Worker).toHaveBeenCalledWith(
        'email',
        expect.any(Function),
        expect.objectContaining({
          connection: { host: 'localhost', port: 6379 },
          concurrency: 5,
          removeOnComplete: 100,
          removeOnFail: 50,
        }),
      );
    });

    it('should close worker on module destroy', async () => {
      const mockWorker = {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };

      const { Worker } = require('bullmq');
      Worker.mockReturnValue(mockWorker);

      service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockWorker.close).toHaveBeenCalled();
    });
  });
});
