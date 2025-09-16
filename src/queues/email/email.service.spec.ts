import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { EnqueueService } from './enqueue/enqueue.service';

describe('EmailService', () => {
  let service: EmailService;
  let enqueueService: jest.Mocked<EnqueueService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: EnqueueService,
          useValue: {
            enqueueWaitlistWelcome: jest.fn(),
            enqueueSignupEmail: jest.fn(),
            enqueueForgotPassword: jest.fn(),
            enqueueSigninEmail: jest.fn(),
            enqueueMagicLinkSignInEmail: jest.fn(),
            enqueuePasswordResetConfirmation: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    enqueueService = module.get(EnqueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue waitlist welcome email', async () => {
    await service.sendWaitlistWelcome('test@example.com');
    expect(enqueueService.enqueueWaitlistWelcome).toHaveBeenCalledWith('test@example.com');
  });

  it('should enqueue signup email', async () => {
    await service.sendSignupEmail('test@example.com');
    expect(enqueueService.enqueueSignupEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('should enqueue forgot password email', async () => {
    await service.sendForgotPassword('test@example.com', 'token123');
    expect(enqueueService.enqueueForgotPassword).toHaveBeenCalledWith(
      'test@example.com',
      'token123',
    );
  });

  it('should enqueue signin email', async () => {
    await service.sendSigninEmail('test@example.com');
    expect(enqueueService.enqueueSigninEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('should enqueue magic link signin email', async () => {
    await service.sendMagicLinkSignInEmail('test@example.com', 'magic123');
    expect(enqueueService.enqueueMagicLinkSignInEmail).toHaveBeenCalledWith(
      'test@example.com',
      'magic123',
    );
  });

  it('should enqueue password reset confirmation email', async () => {
    await service.sendPasswordResetConfirmation('test@example.com');
    expect(enqueueService.enqueuePasswordResetConfirmation).toHaveBeenCalledWith(
      'test@example.com',
    );
  });
});
