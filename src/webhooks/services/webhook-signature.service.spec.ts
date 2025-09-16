import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureService } from './webhook-signature.service';
import { PlatformRegistryService } from '../../platforms/services/platform-registry.service';
import * as crypto from 'crypto';

describe('WebhookSignatureService', () => {
  let service: WebhookSignatureService;
  let configService: jest.Mocked<ConfigService>;
  let platformRegistry: jest.Mocked<PlatformRegistryService>;

  const mockProvider = {
    validateWebhookSignature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PlatformRegistryService,
          useValue: {
            getProvider: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookSignatureService>(WebhookSignatureService);
    configService = module.get(ConfigService);
    platformRegistry = module.get(PlatformRegistryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSignature', () => {
    const payload = '{"test": "data"}';
    const secret = 'test-secret';

    beforeEach(() => {
      platformRegistry.getProvider.mockReturnValue(mockProvider as any);
      configService.get.mockReturnValue(secret);
    });

    it('should validate GitHub signature successfully', async () => {
      const signature = `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
      mockProvider.validateWebhookSignature.mockReturnValue(true);

      const result = await service.validateSignature(payload, signature, 'github');

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(platformRegistry.getProvider).toHaveBeenCalledWith('github');
      expect(mockProvider.validateWebhookSignature).toHaveBeenCalledWith(
        payload,
        signature,
        secret,
      );
    });

    it('should validate GitLab signature successfully', async () => {
      const signature = secret;
      mockProvider.validateWebhookSignature.mockReturnValue(true);

      const result = await service.validateSignature(payload, signature, 'gitlab');

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(platformRegistry.getProvider).toHaveBeenCalledWith('gitlab');
      expect(mockProvider.validateWebhookSignature).toHaveBeenCalledWith(
        payload,
        signature,
        secret,
      );
    });

    it('should validate Bitbucket signature successfully', async () => {
      const signature = `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
      mockProvider.validateWebhookSignature.mockReturnValue(true);

      const result = await service.validateSignature(payload, signature, 'bitbucket');

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(platformRegistry.getProvider).toHaveBeenCalledWith('bitbucket');
      expect(mockProvider.validateWebhookSignature).toHaveBeenCalledWith(
        payload,
        signature,
        secret,
      );
    });

    it('should return invalid for wrong signature', async () => {
      const signature = 'invalid-signature';
      mockProvider.validateWebhookSignature.mockReturnValue(false);

      const result = await service.validateSignature(payload, signature, 'github');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid webhook signature');
    });

    it('should return error when provider not found', async () => {
      platformRegistry.getProvider.mockReturnValue(null);

      const result = await service.validateSignature(payload, 'signature', 'github');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Provider not found for platform: github');
    });

    it('should return error when secret not configured', async () => {
      configService.get.mockReturnValue(null);

      const result = await service.validateSignature(payload, 'signature', 'github');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Webhook secret not configured for platform: github');
    });

    it('should handle validation errors gracefully', async () => {
      mockProvider.validateWebhookSignature.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const result = await service.validateSignature(payload, 'signature', 'github');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Validation error');
    });
  });

  describe('generateWebhookSecret', () => {
    it('should generate secret with default length', () => {
      const secret = service.generateWebhookSecret();
      expect(secret).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(secret).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate secret with custom length', () => {
      const secret = service.generateWebhookSecret(16);
      expect(secret).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(secret).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('validateTimestamp', () => {
    it('should validate recent timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = service.validateTimestamp(timestamp);
      expect(result).toBe(true);
    });

    it('should validate timestamp within tolerance', () => {
      const timestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const result = service.validateTimestamp(timestamp, 300);
      expect(result).toBe(true);
    });

    it('should reject old timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const result = service.validateTimestamp(timestamp, 300);
      expect(result).toBe(false);
    });

    it('should handle string timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const result = service.validateTimestamp(timestamp);
      expect(result).toBe(true);
    });

    it('should handle invalid timestamp gracefully', () => {
      const result = service.validateTimestamp('invalid');
      expect(result).toBe(false);
    });
  });

  describe('extractSignature', () => {
    it('should extract GitHub signature', () => {
      const headers = { 'x-hub-signature-256': 'sha256=abc123' };
      const signature = service.extractSignature(headers, 'github');
      expect(signature).toBe('sha256=abc123');
    });

    it('should extract GitLab signature', () => {
      const headers = { 'x-gitlab-token': 'secret-token' };
      const signature = service.extractSignature(headers, 'gitlab');
      expect(signature).toBe('secret-token');
    });

    it('should extract Bitbucket signature', () => {
      const headers = { 'x-hub-signature-256': 'sha256=def456' };
      const signature = service.extractSignature(headers, 'bitbucket');
      expect(signature).toBe('sha256=def456');
    });

    it('should handle case-insensitive headers', () => {
      const headers = { 'X-Hub-Signature-256': 'sha256=abc123' };
      const signature = service.extractSignature(headers, 'github');
      expect(signature).toBe('sha256=abc123');
    });

    it('should return null for unsupported platform', () => {
      const headers = { 'x-hub-signature-256': 'sha256=abc123' };
      const signature = service.extractSignature(headers, 'unsupported');
      expect(signature).toBeNull();
    });

    it('should return null when header not found', () => {
      const headers = { 'other-header': 'value' };
      const signature = service.extractSignature(headers, 'github');
      expect(signature).toBeNull();
    });
  });

  describe('extractEventType', () => {
    it('should extract GitHub event type', () => {
      const headers = { 'x-github-event': 'push' };
      const eventType = service.extractEventType(headers, 'github');
      expect(eventType).toBe('push');
    });

    it('should extract GitLab event type', () => {
      const headers = { 'x-gitlab-event': 'Push Hook' };
      const eventType = service.extractEventType(headers, 'gitlab');
      expect(eventType).toBe('Push Hook');
    });

    it('should extract Bitbucket event type', () => {
      const headers = { 'x-event-key': 'repo:push' };
      const eventType = service.extractEventType(headers, 'bitbucket');
      expect(eventType).toBe('repo:push');
    });

    it('should handle case-insensitive headers', () => {
      const headers = { 'X-GitHub-Event': 'push' };
      const eventType = service.extractEventType(headers, 'github');
      expect(eventType).toBe('push');
    });

    it('should return null for unsupported platform', () => {
      const headers = { 'x-github-event': 'push' };
      const eventType = service.extractEventType(headers, 'unsupported');
      expect(eventType).toBeNull();
    });

    it('should return null when header not found', () => {
      const headers = { 'other-header': 'value' };
      const eventType = service.extractEventType(headers, 'github');
      expect(eventType).toBeNull();
    });
  });
});
