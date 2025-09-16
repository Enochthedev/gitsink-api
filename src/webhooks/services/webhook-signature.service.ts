import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRegistryService } from '../../platforms/services/platform-registry.service';
import { WebhookSignatureValidation } from '../types/webhook.types';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureService {
  private readonly logger = new Logger(WebhookSignatureService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly platformRegistry: PlatformRegistryService,
  ) {}

  async validateSignature(
    payload: string,
    signature: string,
    platform: 'github' | 'gitlab' | 'bitbucket',
    headers?: Record<string, string>,
  ): Promise<WebhookSignatureValidation> {
    const validationStart = Date.now();

    try {
      // Enhanced input validation
      if (!payload) {
        return {
          isValid: false,
          error: 'Payload is required for signature validation',
        };
      }

      if (!signature) {
        return {
          isValid: false,
          error: 'Signature is required for validation',
        };
      }

      if (!platform || !['github', 'gitlab', 'bitbucket'].includes(platform)) {
        return {
          isValid: false,
          error: `Unsupported platform: ${platform}`,
        };
      }

      const secret = this.getWebhookSecret(platform);
      if (!secret) {
        this.logger.warn(`Webhook secret not configured for platform: ${platform}`);
        return {
          isValid: false,
          error: `Webhook secret not configured for platform: ${platform}`,
        };
      }

      // Validate timestamp to prevent replay attacks
      if (headers) {
        const timestampValid = this.validateWebhookTimestamp(headers, platform);
        if (!timestampValid) {
          this.logger.warn(`Webhook timestamp validation failed for ${platform}`, {
            platform,
            headers: Object.keys(headers),
          });
          return {
            isValid: false,
            error: 'Webhook timestamp validation failed - possible replay attack',
          };
        }
      }

      // Use platform-specific validation with enhanced error handling
      let isValid = false;
      try {
        switch (platform) {
          case 'github':
            isValid = this.validateGitHubSignature(payload, signature, secret);
            break;
          case 'gitlab':
            isValid = this.validateGitLabSignature(payload, signature, secret);
            break;
          case 'bitbucket':
            isValid = this.validateBitbucketSignature(payload, signature, secret);
            break;
          default:
            throw new Error(`Unsupported platform: ${platform}`);
        }
      } catch (validationError) {
        this.logger.error(`Platform-specific validation failed for ${platform}`, {
          platform,
          error:
            validationError instanceof Error ? validationError.message : String(validationError),
        });
        return {
          isValid: false,
          error: `Signature validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
        };
      }

      const validationDuration = Date.now() - validationStart;

      if (!isValid) {
        this.logger.warn(`Invalid webhook signature for ${platform}`, {
          platform,
          signatureLength: signature?.length || 0,
          payloadLength: payload?.length || 0,
          validationDuration,
        });
      } else {
        this.logger.debug(`Valid webhook signature for ${platform}`, {
          platform,
          validationDuration,
        });
      }

      return {
        isValid,
        error: isValid ? undefined : 'Invalid webhook signature',
      };
    } catch (error) {
      const validationDuration = Date.now() - validationStart;
      this.logger.error(`Error validating webhook signature for ${platform}:`, {
        platform,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        validationDuration,
      });
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Signature validation failed',
      };
    }
  }

  /**
   * Validate GitHub webhook signature
   */
  private validateGitHubSignature(payload: string, signature: string, secret: string): boolean {
    try {
      if (!signature.startsWith('sha256=')) {
        return false;
      }

      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (error) {
      this.logger.error('Failed to validate GitHub webhook signature:', error);
      return false;
    }
  }

  /**
   * Validate GitLab webhook signature
   */
  private validateGitLabSignature(payload: string, signature: string, secret: string): boolean {
    try {
      // GitLab uses X-Gitlab-Token header for webhook authentication
      return signature === secret;
    } catch (error) {
      this.logger.error('Failed to validate GitLab webhook signature:', error);
      return false;
    }
  }

  /**
   * Validate Bitbucket webhook signature
   */
  private validateBitbucketSignature(payload: string, signature: string, secret: string): boolean {
    try {
      if (!signature.startsWith('sha256=')) {
        return false;
      }

      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (error) {
      this.logger.error('Failed to validate Bitbucket webhook signature:', error);
      return false;
    }
  }

  /**
   * Get webhook secret for platform
   */
  private getWebhookSecret(platform: string): string | null {
    const secretMap = {
      github: 'GITHUB_WEBHOOK_SECRET',
      gitlab: 'GITLAB_WEBHOOK_SECRET',
      bitbucket: 'BITBUCKET_WEBHOOK_SECRET',
    };

    const envVar = secretMap[platform];
    if (!envVar) {
      return null;
    }

    return this.config.get<string>(envVar) || null;
  }

  /**
   * Generate a secure webhook secret
   */
  generateWebhookSecret(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate webhook timestamp to prevent replay attacks
   */
  validateTimestamp(timestamp: string | number, toleranceSeconds = 300): boolean {
    try {
      const webhookTime = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(currentTime - webhookTime);

      return timeDiff <= toleranceSeconds;
    } catch (error) {
      this.logger.error('Failed to validate webhook timestamp:', error);
      return false;
    }
  }

  /**
   * Enhanced webhook timestamp validation with platform-specific headers
   */
  private validateWebhookTimestamp(headers: Record<string, string>, platform: string): boolean {
    try {
      let timestamp: string | null = null;

      switch (platform) {
        case 'github':
          // GitHub doesn't provide timestamp in headers, but we can check delivery ID freshness
          const deliveryId = this.getHeaderValue(headers, 'x-github-delivery');
          if (deliveryId) {
            // GitHub delivery IDs are UUIDs, we can't extract timestamp
            // For GitHub, we rely on signature validation only
            return true;
          }
          break;
        case 'gitlab':
          // GitLab doesn't provide timestamp in standard headers
          // For GitLab, we rely on signature validation only
          return true;
        case 'bitbucket':
          // Bitbucket may provide timestamp in custom headers
          timestamp = this.getHeaderValue(headers, 'x-event-time');
          if (timestamp) {
            const eventTime = new Date(timestamp).getTime() / 1000;
            return this.validateTimestamp(eventTime);
          }
          break;
      }

      // If no timestamp available, allow the request (rely on signature validation)
      return true;
    } catch (error) {
      this.logger.error(`Failed to validate webhook timestamp for ${platform}:`, error);
      return false;
    }
  }

  /**
   * Extract signature from headers based on platform
   */
  extractSignature(headers: Record<string, string>, platform: string): string | null {
    const headerMap = {
      github: 'x-hub-signature-256',
      gitlab: 'x-gitlab-token',
      bitbucket: 'x-hub-signature-256',
    };

    const headerName = headerMap[platform];
    if (!headerName) {
      return null;
    }

    return this.getHeaderValue(headers, headerName);
  }

  /**
   * Extract event type from headers based on platform
   */
  extractEventType(headers: Record<string, string>, platform: string): string | null {
    const headerMap = {
      github: 'x-github-event',
      gitlab: 'x-gitlab-event',
      bitbucket: 'x-event-key',
    };

    const headerName = headerMap[platform];
    if (!headerName) {
      return null;
    }

    return this.getHeaderValue(headers, headerName);
  }

  /**
   * Helper method to get header value with case-insensitive lookup
   */
  private getHeaderValue(headers: Record<string, string>, headerName: string): string | null {
    // Check all possible case variations
    const lowerHeaderName = headerName.toLowerCase();
    const upperHeaderName = headerName.toUpperCase();
    const titleCaseHeaderName = this.toTitleCase(headerName);

    return (
      headers[headerName] ||
      headers[lowerHeaderName] ||
      headers[upperHeaderName] ||
      headers[titleCaseHeaderName] ||
      null
    );
  }

  /**
   * Convert header name to title case (e.g., 'x-hub-signature-256' -> 'X-Hub-Signature-256')
   */
  private toTitleCase(str: string): string {
    return str
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('-');
  }
}
