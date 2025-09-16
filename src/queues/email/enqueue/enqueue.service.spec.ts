import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnqueueService } from './enqueue.service';
import { Queue } from 'bullmq';

// Mock BullMQ
jest.mock('bullmq');
const MockQueue = Queue as jest.MockedClass<typeof Queue>;

describe('EnqueueService', () => {
  let service: EnqueueService;
  let configService: jest.Mocked<ConfigService>;
  let mockQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
    } as any;

    MockQueue.mockImplementation(() => mockQueue);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnqueueService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EnqueueService>(EnqueueService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        EMAIL_REMOVE_ON_COMPLETE: 100,
        EMAIL_REMOVE_ON_FAIL: 50,
        EMAIL_MAX_ATTEMPTS: 5,
        EMAIL_RETRY_DELAY: 2000,
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue waitlist welcome email', async () => {
    await service.enqueueWaitlistWelcome('test@example.com');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sendEmail',
      {
        type: 'waitlistWelcome',
        email: 'test@example.com',
      },
      expect.objectContaining({
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }),
    );
  });

  it('should enqueue forgot password email with high priority', async () => {
    await service.enqueueForgotPassword('test@example.com', 'token123');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sendEmail',
      {
        type: 'forgotPassword',
        email: 'test@example.com',
        token: 'token123',
      },
      expect.objectContaining({
        priority: 5,
        attempts: 5,
      }),
    );
  });

  it('should enqueue signup email with medium priority', async () => {
    await service.enqueueSignupEmail('test@example.com');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sendEmail',
      {
        type: 'signup',
        email: 'test@example.com',
      },
      expect.objectContaining({
        priority: 3,
      }),
    );
  });

  it('should enqueue magic link email with high priority', async () => {
    await service.enqueueMagicLinkSignInEmail('test@example.com', 'magic123');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sendEmail',
      {
        type: 'magicLinkSignIn',
        email: 'test@example.com',
        token: 'magic123',
      },
      expect.objectContaining({
        priority: 5,
      }),
    );
  });

  it('should accept custom options', async () => {
    await service.enqueueWaitlistWelcome('test@example.com', { delay: 5000 });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'sendEmail',
      {
        type: 'waitlistWelcome',
        email: 'test@example.com',
      },
      expect.objectContaining({
        delay: 5000,
      }),
    );
  });
});
