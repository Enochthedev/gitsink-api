import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EmailWorkerService } from './email-worker.service';
import { QueueConfigService } from '../config/queue.config';
import { MetricsService } from '../../metrics/metrics.service';
import { MailService } from '../../mail/mail.service';
import { MailJob } from '../../types/queue.types';

describe('EmailWorkerService', () => {
  let service: EmailWorkerService;
  let mailService: MailService;
  let mockJob: jest.Mocked<Job<MailJob>>;

  const mockQueueConfig = {
    getWorkerOptions: jest.fn().mockReturnValue({
      connection: { host: 'localhost', port: 6379 },
      concurrency: 5,
    }),
  };

  const mockMetricsService = {
    recordQueueJob: jest.fn(),
  };

  const mockMailService = {
    sendWaitlistWelcome: jest.fn(),
    sendForgotPassword: jest.fn(),
    sendSignupEmail: jest.fn(),
    sendSigninEmail: jest.fn(),
    sendPasswordResetConfirmation: jest.fn(),
    sendMagicLinkSignInEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailWorkerService,
        {
          provide: QueueConfigService,
          useValue: mockQueueConfig,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<EmailWorkerService>(EmailWorkerService);
    mailService = module.get<MailService>(MailService);

    // Create mock job
    mockJob = {
      id: '123',
      name: 'sendEmail',
      data: {
        type: 'waitlistWelcome',
        email: 'test@example.com',
      },
      updateProgress: jest.fn(),
      attemptsMade: 0,
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getWorkerName', () => {
    it('should return correct worker name', () => {
      expect((service as any).getWorkerName()).toBe('EmailWorker');
    });
  });

  describe('processJob', () => {
    const createJobContext = () => ({
      job: mockJob,
      worker: {} as any,
      startTime: Date.now(),
      retryCount: 0,
    });

    it('should process waitlist welcome email successfully', async () => {
      mockJob.data = { type: 'waitlistWelcome', email: 'test@example.com' };
      mockMailService.sendWaitlistWelcome.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendWaitlistWelcome).toHaveBeenCalledWith('test@example.com');
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(30);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(80);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process forgot password email successfully', async () => {
      mockJob.data = {
        type: 'forgotPassword',
        email: 'test@example.com',
        token: 'reset-token',
      };
      mockMailService.sendForgotPassword.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendForgotPassword).toHaveBeenCalledWith(
        'test@example.com',
        'reset-token',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process signup email successfully', async () => {
      mockJob.data = { type: 'signup', email: 'test@example.com' };
      mockMailService.sendSignupEmail.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendSignupEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process signin email successfully', async () => {
      mockJob.data = { type: 'signin', email: 'test@example.com' };
      mockMailService.sendSigninEmail.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendSigninEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process password reset confirmation email successfully', async () => {
      mockJob.data = {
        type: 'passwordResetConfirmation',
        email: 'test@example.com',
      };
      mockMailService.sendPasswordResetConfirmation.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendPasswordResetConfirmation).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process magic link signin email successfully', async () => {
      mockJob.data = {
        type: 'magicLinkSignIn',
        email: 'test@example.com',
        token: 'magic-token',
      };
      mockMailService.sendMagicLinkSignInEmail.mockResolvedValue(undefined);

      await (service as any).processJob(mockJob, createJobContext());

      expect(mockMailService.sendMagicLinkSignInEmail).toHaveBeenCalledWith(
        'test@example.com',
        'magic-token',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should throw error for forgot password without token', async () => {
      mockJob.data = { type: 'forgotPassword', email: 'test@example.com' };

      await expect((service as any).processJob(mockJob, createJobContext())).rejects.toThrow(
        'Token is required for forgotPassword email',
      );
    });

    it('should throw error for magic link signin without token', async () => {
      mockJob.data = { type: 'magicLinkSignIn', email: 'test@example.com' };

      await expect((service as any).processJob(mockJob, createJobContext())).rejects.toThrow(
        'Token is required for magicLinkSignIn email',
      );
    });

    it('should throw error for unknown email type', async () => {
      mockJob.data = { type: 'unknown' as any, email: 'test@example.com' };

      await expect((service as any).processJob(mockJob, createJobContext())).rejects.toThrow(
        'Unknown email job type: unknown',
      );
    });

    it('should handle mail service errors', async () => {
      mockJob.data = { type: 'waitlistWelcome', email: 'test@example.com' };
      mockMailService.sendWaitlistWelcome.mockRejectedValue(new Error('Mail service error'));

      await expect((service as any).processJob(mockJob, createJobContext())).rejects.toThrow(
        'Mail service error',
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true for healthy worker', () => {
      // Set up healthy metrics
      (service as any).metrics = {
        processed: 100,
        completed: 95,
        failed: 5,
        active: 2,
        stalled: 1,
        averageProcessingTime: 1000,
      };

      // Mock worker to exist
      (service as any).worker = { isRunning: () => true };

      expect(service.isHealthy()).toBe(true);
    });

    it('should return false for unhealthy worker with high failure rate', () => {
      // Set up unhealthy metrics (high failure rate)
      (service as any).metrics = {
        processed: 100,
        completed: 50,
        failed: 50,
        active: 2,
        stalled: 1,
        averageProcessingTime: 1000,
      };

      expect(service.isHealthy()).toBe(false);
    });

    it('should return false for worker with too many stalled jobs', () => {
      // Set up unhealthy metrics (too many stalled jobs)
      (service as any).metrics = {
        processed: 100,
        completed: 95,
        failed: 5,
        active: 2,
        stalled: 15,
        averageProcessingTime: 1000,
      };

      expect(service.isHealthy()).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const expectedMetrics = {
        processed: 50,
        completed: 45,
        failed: 5,
        active: 1,
        stalled: 2,
        averageProcessingTime: 1500,
      };

      (service as any).metrics = expectedMetrics;

      const metrics = service.getMetrics();
      expect(metrics).toEqual(expectedMetrics);
      expect(metrics).not.toBe(expectedMetrics); // Should be a copy
    });
  });
});
