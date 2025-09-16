import {
  Controller,
  Post,
  Body,
  Headers,
  HttpStatus,
  Logger,
  Res,
  Param,
  Get,
  Query,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { WebhookHandlerService } from '../services/webhook-handler.service';
import { WebhookSignatureService } from '../services/webhook-signature.service';
import { WebhookStorageService } from '../services/webhook-storage.service';
import { WebhookJobData, WebhookEventFilter } from '../types/webhook.types';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookHandler: WebhookHandlerService,
    private readonly signatureService: WebhookSignatureService,
    private readonly storageService: WebhookStorageService,
  ) {}

  @Post(':platform')
  @ApiOperation({ summary: 'Handle webhook from any supported platform' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab', 'bitbucket'] })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook payload' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async handleWebhook(
    @Param('platform') platform: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Res() res: Response,
  ) {
    try {
      this.logger.debug(`Received webhook from ${platform}`, {
        platform,
        headers: Object.keys(headers),
        payloadSize: JSON.stringify(payload).length,
      });

      // Validate platform
      if (!['github', 'gitlab', 'bitbucket'].includes(platform)) {
        throw new BadRequestException(`Unsupported platform: ${platform}`);
      }

      // Extract signature and event type from headers
      const signature = this.signatureService.extractSignature(headers, platform);
      const eventType = this.signatureService.extractEventType(headers, platform);

      if (!signature) {
        throw new BadRequestException('Missing webhook signature');
      }

      if (!eventType) {
        throw new BadRequestException('Missing event type header');
      }

      // Validate signature
      const payloadString = JSON.stringify(payload);
      const signatureValidation = await this.webhookHandler.validateSignature(
        payloadString,
        signature,
        platform,
        headers,
      );

      if (!signatureValidation.isValid) {
        this.logger.warn(`Invalid webhook signature for ${platform}`, {
          platform,
          eventType,
          error: signatureValidation.error,
        });
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Extract repository URL
      const repositoryUrl = this.extractRepositoryUrl(payload, platform);
      if (!repositoryUrl) {
        throw new BadRequestException('Could not extract repository URL from payload');
      }

      // Create webhook job data
      const webhookJobData: WebhookJobData = {
        eventId: '', // Will be set by the handler
        platform: platform as 'github' | 'gitlab' | 'bitbucket',
        eventType,
        repositoryUrl,
        payload,
        signature,
        timestamp: new Date(),
      };

      // Queue webhook for processing
      await this.webhookHandler.queueWebhook(webhookJobData, {
        priority: this.getEventPriority(eventType),
        immediate: false,
      });

      this.logger.log(`Webhook queued successfully: ${platform}:${eventType}`, {
        platform,
        eventType,
        repositoryUrl,
      });

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook received and queued for processing',
        platform,
        eventType,
      });
    } catch (error) {
      this.logger.error(`Webhook processing failed for ${platform}:`, error);

      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }

      throw new InternalServerErrorException('Webhook processing failed');
    }
  }

  @Get('events')
  @ApiOperation({ summary: 'Get webhook events with filtering' })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['github', 'gitlab', 'bitbucket'],
  })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'repositoryId', required: false })
  @ApiQuery({ name: 'processed', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getWebhookEvents(
    @Query('platform') platform?: string,
    @Query('eventType') eventType?: string,
    @Query('repositoryId') repositoryId?: string,
    @Query('processed') processed?: boolean,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    try {
      const filter: WebhookEventFilter = {};

      if (platform) filter.platform = platform;
      if (eventType) filter.eventType = eventType;
      if (repositoryId) filter.repositoryId = repositoryId;
      if (processed !== undefined) filter.processed = processed;

      const events = await this.storageService.getEvents(filter, limit, offset);

      return {
        success: true,
        data: events,
        pagination: {
          limit,
          offset,
          total: events.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get webhook events:', error);
      throw new InternalServerErrorException('Failed to retrieve webhook events');
    }
  }

  @Get('events/:eventId')
  @ApiOperation({ summary: 'Get specific webhook event by ID' })
  @ApiParam({ name: 'eventId', description: 'Webhook event ID' })
  async getWebhookEvent(@Param('eventId') eventId: string) {
    try {
      const event = await this.storageService.getEvent(eventId);

      if (!event) {
        return {
          success: false,
          message: 'Webhook event not found',
        };
      }

      return {
        success: true,
        data: event,
      };
    } catch (error) {
      this.logger.error(`Failed to get webhook event ${eventId}:`, error);
      throw new InternalServerErrorException('Failed to retrieve webhook event');
    }
  }

  @Post('events/:eventId/retry')
  @ApiOperation({ summary: 'Retry failed webhook event' })
  @ApiParam({ name: 'eventId', description: 'Webhook event ID' })
  async retryWebhookEvent(@Param('eventId') eventId: string) {
    try {
      const result = await this.webhookHandler.retryWebhook(eventId);

      return {
        success: result.success,
        message: result.success ? 'Webhook retried successfully' : 'Webhook retry failed',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to retry webhook event ${eventId}:`, error);
      throw new InternalServerErrorException('Failed to retry webhook event');
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get webhook processing metrics' })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['github', 'gitlab', 'bitbucket'],
  })
  @ApiQuery({ name: 'fromDate', required: false, type: Date })
  @ApiQuery({ name: 'toDate', required: false, type: Date })
  async getWebhookMetrics(
    @Query('platform') platform?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    try {
      const filter: WebhookEventFilter = {};

      if (platform) filter.platform = platform;
      if (fromDate) filter.fromDate = new Date(fromDate);
      if (toDate) filter.toDate = new Date(toDate);

      const metrics = await this.webhookHandler.getMetrics(filter);

      return {
        success: true,
        data: metrics,
      };
    } catch (error) {
      this.logger.error('Failed to get webhook metrics:', error);
      throw new InternalServerErrorException('Failed to retrieve webhook metrics');
    }
  }

  private extractRepositoryUrl(payload: any, platform: string): string | null {
    switch (platform) {
      case 'github':
        return payload.repository?.html_url || null;
      case 'gitlab':
        return payload.project?.web_url || null;
      case 'bitbucket':
        return payload.repository?.links?.html?.href || null;
      default:
        return null;
    }
  }

  private getEventPriority(eventType: string): 'low' | 'normal' | 'high' {
    // High priority events that should be processed immediately
    const highPriorityEvents = ['push', 'merge_request', 'pull_request'];

    // Low priority events that can be processed later
    const lowPriorityEvents = ['star', 'fork', 'watch'];

    if (highPriorityEvents.includes(eventType)) {
      return 'high';
    } else if (lowPriorityEvents.includes(eventType)) {
      return 'low';
    } else {
      return 'normal';
    }
  }
}
