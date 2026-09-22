import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookHandlerService } from './webhook-handler.service';
import { WebhookStorageService } from './webhook-storage.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { WebhookEvent, WebhookJobData } from '../types/webhook.types';

describe('WebhookHandlerService', () => {
  let service: WebhookHandlerService;
  let storageService: jest.Mocked<WebhookStorageService>;
  let signatureService: jest.Mocked<WebhookSignatureService>;
  let queueService: jest.Mocked<WebhookQueueService>;
  let processorService: jest.Mocked<WebhookProcessorService>;
  let configService: jest.Mocked<ConfigService>;

  const mockEvent: WebhookEvent = {
    id: 'event-123',
    platform: 'github',
    eventType: 'push',
    repositoryUrl: 'https://github.com/user/repo',
    repositoryId: 'repo-123',
    repositoryName: 'repo',
    repositoryFullName: 'user/repo',
    ownerId: 'user-123',
    ownerName: 'user',
    payload: { test: 'data' },
    signature: 'sha256=abc123',
    timestamp: new Date(),
    processed: false,
    retryCount: 0,
  };

  const mockJobData: WebhookJobData = {
    eventId: 'event-123',
    platform: 'github',
    eventType: 'push',
    repositoryUrl: 'https://github.com/user/repo',
    payload: { test: 'data' },
    signature: 'sha256=abc123',
    timestamp: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookHandlerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: WebhookStorageService,
          useValue: {
            storeEvent: jest.fn(),
            getEvent: jest.fn(),
            markAsProcessed: jest.fn(),
            getEvents: jest.fn(),
            incrementRetryCount: jest.fn(),
          },
        },
        {
          provide: WebhookSignatureService,
          useValue: {
            validateSignature: jest.fn(),
          },
        },
        {
          provide: WebhookQueueService,
          useValue: {
            addJob: jest.fn(),
            addRetryJob: jest.fn(),
          },
        },
        {
          provide: WebhookProcessorService,
          useValue: {
            process: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookHandlerService>(WebhookHandlerService);
    storageService = module.get(WebhookStorageService);
    signatureService = module.get(WebhookSignatureService);
    queueService = module.get(WebhookQueueService);
    processorService = module.get(WebhookProcessorService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        WEBHOOK_MAX_RETRIES: 3,
        WEBHOOK_BASE_DELAY: 1000,
        WEBHOOK_MAX_DELAY: 30000,
        WEBHOOK_BACKOFF_MULTIPLIER: 2,
      };
      return config[key] || defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processWebhook', () => {
    it('should process webhook successfully', async () => {
      storageService.getEvent.mockResolvedValue(mockEvent);
      processorService.process.mockResolvedValue({
        success: true,
        eventId: 'event-123',
        processed: true,
      });

      const result = await service.processWebhook(mockJobData);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(storageService.markAsProcessed).toHaveBeenCalledWith('event-123', true, undefined);
    });

    it('should handle already processed event', async () => {
      const processedEvent = { ...mockEvent, processed: true };
      storageService.getEvent.mockResolvedValue(processedEvent);

      const result = await service.processWebhook(mockJobData);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(processorService.process).not.toHaveBeenCalled();
    });

    it('should handle event not found', async () => {
      storageService.getEvent.mockResolvedValue(null);

      const result = await service.processWebhook(mockJobData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found in storage');
    });

    it('should schedule retry on processing failure', async () => {
      storageService.getEvent.mockResolvedValue(mockEvent);
      processorService.process.mockResolvedValue({
        success: false,
        eventId: 'event-123',
        processed: false,
        error: 'Processing failed',
      });

      const result = await service.processWebhook(mockJobData);

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(queueService.addRetryJob).toHaveBeenCalled();
      expect(storageService.markAsProcessed).toHaveBeenCalledWith(
        'event-123',
        false,
        'Processing failed',
      );
    });

    it('should not retry when max retries exceeded', async () => {
      const jobDataWithRetries = { ...mockJobData, retryCount: 3 };
      storageService.getEvent.mockResolvedValue(mockEvent);
      processorService.process.mockResolvedValue({
        success: false,
        eventId: 'event-123',
        processed: false,
        error: 'Processing failed',
      });

      const result = await service.processWebhook(jobDataWithRetries);

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeUndefined();
      expect(queueService.addRetryJob).not.toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      storageService.getEvent.mockResolvedValue(mockEvent);
      processorService.process.mockRejectedValue(new Error('Processing error'));

      const result = await service.processWebhook(mockJobData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Processing error');
      expect(storageService.markAsProcessed).toHaveBeenCalledWith(
        'event-123',
        false,
        'Processing error',
      );
    });
  });

  describe('validateSignature', () => {
    it('should validate signature successfully', async () => {
      signatureService.validateSignature.mockResolvedValue({
        isValid: true,
      });

      const result = await service.validateSignature('payload', 'signature', 'github');

      expect(result.isValid).toBe(true);
      expect(signatureService.validateSignature).toHaveBeenCalledWith(
        'payload',
        'signature',
        'github',
        undefined,
      );
    });

    it('should handle invalid signature', async () => {
      signatureService.validateSignature.mockResolvedValue({
        isValid: false,
        error: 'Invalid signature',
      });

      const result = await service.validateSignature('payload', 'signature', 'github');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('queueWebhook', () => {
    it('should queue webhook successfully', async () => {
      storageService.storeEvent.mockResolvedValue(mockEvent);

      await service.queueWebhook(mockJobData);

      expect(storageService.storeEvent).toHaveBeenCalled();
      expect(queueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
          platform: 'github',
          eventType: 'push',
        }),
        {},
      );
    });

    it('should handle storage errors', async () => {
      storageService.storeEvent.mockRejectedValue(new Error('Storage error'));

      await expect(service.queueWebhook(mockJobData)).rejects.toThrow('Storage error');
    });

    it('should handle queue errors', async () => {
      storageService.storeEvent.mockResolvedValue(mockEvent);
      queueService.addJob.mockRejectedValue(new Error('Queue error'));

      await expect(service.queueWebhook(mockJobData)).rejects.toThrow('Queue error');
    });
  });

  describe('retryWebhook', () => {
    it('should retry webhook successfully', async () => {
      storageService.getEvent.mockResolvedValue(mockEvent);
      storageService.incrementRetryCount.mockResolvedValue();
      processorService.process.mockResolvedValue({
        success: true,
        eventId: 'event-123',
        processed: true,
      });

      const result = await service.retryWebhook('event-123');

      expect(result.success).toBe(true);
      expect(storageService.incrementRetryCount).toHaveBeenCalledWith('event-123');
    });

    it('should handle event not found for retry', async () => {
      storageService.getEvent.mockResolvedValue(null);

      const result = await service.retryWebhook('event-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });

    it('should handle retry errors', async () => {
      storageService.getEvent.mockRejectedValue(new Error('Storage error'));

      const result = await service.retryWebhook('event-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('getMetrics', () => {
    it('should return webhook metrics', async () => {
      const mockEvents = [
        { ...mockEvent, processed: true },
        { ...mockEvent, id: 'event-456', processed: false, error: 'Failed' },
        { ...mockEvent, id: 'event-789', retryCount: 1, processed: false },
      ];
      storageService.getEvents.mockResolvedValue(mockEvents);

      const metrics = await service.getMetrics();

      expect(metrics.totalEvents).toBe(3);
      expect(metrics.processedEvents).toBe(1);
      expect(metrics.failedEvents).toBe(1);
      expect(metrics.retryingEvents).toBe(1);
      expect(metrics.eventsByPlatform.github).toBe(3);
      expect(metrics.eventsByType.push).toBe(3);
    });

    it('should handle metrics errors gracefully', async () => {
      storageService.getEvents.mockRejectedValue(new Error('Storage error'));

      const metrics = await service.getMetrics();

      expect(metrics.totalEvents).toBe(0);
      expect(metrics.processedEvents).toBe(0);
      expect(metrics.failedEvents).toBe(0);
      expect(metrics.retryingEvents).toBe(0);
    });
  });
});
