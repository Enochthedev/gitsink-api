import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  BounceEvent,
  ComplaintEvent,
  DeliveryEvent,
  EmailBounceService,
} from './email-bounce.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface AWSBounceNotification {
  Type: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL: string;
}

interface SendGridEvent {
  email: string;
  timestamp: number;
  event: string;
  reason?: string;
  status?: string;
  response?: string;
  'smtp-id'?: string;
  sg_event_id?: string;
  sg_message_id?: string;
}

@ApiTags('Email Webhooks')
@Controller('webhooks/email')
export class EmailWebhookController {
  private readonly logger = new Logger(EmailWebhookController.name);

  constructor(
    private readonly emailBounceService: EmailBounceService,
    private readonly configService: ConfigService,
  ) {}

  @Post('aws-ses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle AWS SES bounce/complaint notifications' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleAWSSES(
    @Body() notification: AWSBounceNotification,
    @Headers() headers: Record<string, string>,
  ): Promise<{ success: boolean }> {
    try {
      this.logger.log('Received AWS SES notification', {
        type: notification.Type,
      });

      // Verify AWS SNS signature (optional but recommended)
      if (this.configService.get<boolean>('AWS_SNS_VERIFY_SIGNATURE', true)) {
        await this.verifyAWSSNSSignature(notification, headers);
      }

      const message = JSON.parse(notification.Message);

      switch (notification.Type) {
        case 'Notification':
          await this.handleAWSNotification(message);
          break;
        case 'SubscriptionConfirmation':
          this.logger.log('AWS SNS subscription confirmation received');
          // In production, you might want to automatically confirm the subscription
          break;
        default:
          this.logger.warn(`Unknown AWS SNS notification type: ${notification.Type}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process AWS SES webhook:', error);
      throw error;
    }
  }

  @Post('sendgrid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle SendGrid event webhooks' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleSendGrid(
    @Body() events: SendGridEvent[],
    @Headers() headers: Record<string, string>,
  ): Promise<{ success: boolean; processed: number }> {
    try {
      this.logger.log(`Received SendGrid webhook with ${events.length} events`);

      // Verify SendGrid signature
      if (this.configService.get<boolean>('SENDGRID_VERIFY_SIGNATURE', true)) {
        this.verifySendGridSignature(JSON.stringify(events), headers);
      }

      let processed = 0;
      for (const event of events) {
        try {
          await this.handleSendGridEvent(event);
          processed++;
        } catch (error) {
          this.logger.error(`Failed to process SendGrid event for ${event.email}:`, error);
        }
      }

      this.logger.log(`Processed ${processed}/${events.length} SendGrid events`);
      return { success: true, processed };
    } catch (error) {
      this.logger.error('Failed to process SendGrid webhook:', error);
      throw error;
    }
  }

  @Post('mailgun')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Mailgun event webhooks' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleMailgun(
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ): Promise<{ success: boolean }> {
    try {
      this.logger.log('Received Mailgun webhook');

      // Verify Mailgun signature
      if (this.configService.get<boolean>('MAILGUN_VERIFY_SIGNATURE', true)) {
        this.verifyMailgunSignature(body, headers);
      }

      const eventData = body['event-data'];
      if (eventData) {
        await this.handleMailgunEvent(eventData);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process Mailgun webhook:', error);
      throw error;
    }
  }

  private async handleAWSNotification(message: any): Promise<void> {
    const notificationType = message.notificationType;

    switch (notificationType) {
      case 'Bounce':
        await this.handleAWSBounce(message);
        break;
      case 'Complaint':
        await this.handleAWSComplaint(message);
        break;
      case 'Delivery':
        await this.handleAWSDelivery(message);
        break;
      default:
        this.logger.warn(`Unknown AWS notification type: ${notificationType}`);
    }
  }

  private async handleAWSBounce(message: any): Promise<void> {
    const bounce = message.bounce;
    const mail = message.mail;

    for (const recipient of bounce.bouncedRecipients) {
      const bounceEvent: BounceEvent = {
        messageId: mail.messageId,
        email: recipient.emailAddress,
        bounceType: bounce.bounceType.toLowerCase() as 'permanent' | 'transient',
        bounceSubType: bounce.bounceSubType,
        timestamp: new Date(bounce.timestamp),
        diagnosticCode: recipient.diagnosticCode,
        feedbackId: bounce.feedbackId,
      };

      await this.emailBounceService.handleBounce(bounceEvent);
    }
  }

  private async handleAWSComplaint(message: any): Promise<void> {
    const complaint = message.complaint;
    const mail = message.mail;

    for (const recipient of complaint.complainedRecipients) {
      const complaintEvent: ComplaintEvent = {
        messageId: mail.messageId,
        email: recipient.emailAddress,
        complaintType: complaint.complaintFeedbackType?.toLowerCase() || 'other',
        timestamp: new Date(complaint.timestamp),
        feedbackId: complaint.feedbackId,
        userAgent: complaint.userAgent,
      };

      await this.emailBounceService.handleComplaint(complaintEvent);
    }
  }

  private async handleAWSDelivery(message: any): Promise<void> {
    const delivery = message.delivery;
    const mail = message.mail;

    for (const recipient of delivery.recipients) {
      const deliveryEvent: DeliveryEvent = {
        messageId: mail.messageId,
        email: recipient,
        timestamp: new Date(delivery.timestamp),
        processingTimeMillis: delivery.processingTimeMillis,
        smtpResponse: delivery.smtpResponse,
      };

      await this.emailBounceService.handleDelivery(deliveryEvent);
    }
  }

  private async handleSendGridEvent(event: SendGridEvent): Promise<void> {
    const timestamp = new Date(event.timestamp * 1000);

    switch (event.event) {
      case 'bounce':
      case 'blocked':
        const bounceEvent: BounceEvent = {
          messageId: event['sg_message_id'] || event['smtp-id'] || '',
          email: event.email,
          bounceType: event.status?.includes('5.') ? 'permanent' : 'transient',
          bounceSubType: event.reason || 'unknown',
          timestamp,
          diagnosticCode: event.response,
        };
        await this.emailBounceService.handleBounce(bounceEvent);
        break;

      case 'spamreport':
        const complaintEvent: ComplaintEvent = {
          messageId: event['sg_message_id'] || event['smtp-id'] || '',
          email: event.email,
          complaintType: 'abuse',
          timestamp,
        };
        await this.emailBounceService.handleComplaint(complaintEvent);
        break;

      case 'delivered':
        const deliveryEvent: DeliveryEvent = {
          messageId: event['sg_message_id'] || event['smtp-id'] || '',
          email: event.email,
          timestamp,
          smtpResponse: event.response,
        };
        await this.emailBounceService.handleDelivery(deliveryEvent);
        break;

      default:
        this.logger.debug(`Unhandled SendGrid event: ${event.event}`);
    }
  }

  private async handleMailgunEvent(eventData: any): Promise<void> {
    const timestamp = new Date(eventData.timestamp * 1000);

    switch (eventData.event) {
      case 'failed':
        if (eventData.severity === 'permanent') {
          const bounceEvent: BounceEvent = {
            messageId: eventData['message-id'] || '',
            email: eventData.recipient,
            bounceType: 'permanent',
            bounceSubType: eventData.reason || 'unknown',
            timestamp,
            diagnosticCode: eventData['delivery-status']?.description,
          };
          await this.emailBounceService.handleBounce(bounceEvent);
        }
        break;

      case 'complained':
        const complaintEvent: ComplaintEvent = {
          messageId: eventData['message-id'] || '',
          email: eventData.recipient,
          complaintType: 'abuse',
          timestamp,
        };
        await this.emailBounceService.handleComplaint(complaintEvent);
        break;

      case 'delivered':
        const deliveryEvent: DeliveryEvent = {
          messageId: eventData['message-id'] || '',
          email: eventData.recipient,
          timestamp,
        };
        await this.emailBounceService.handleDelivery(deliveryEvent);
        break;

      default:
        this.logger.debug(`Unhandled Mailgun event: ${eventData.event}`);
    }
  }

  private async verifyAWSSNSSignature(
    notification: AWSBounceNotification,
    headers: Record<string, string>,
  ): Promise<void> {
    // AWS SNS signature verification implementation
    // This is a simplified version - in production, you should use the AWS SDK
    this.logger.debug('AWS SNS signature verification skipped (implement with AWS SDK)');
  }

  private verifySendGridSignature(payload: string, headers: Record<string, string>): void {
    const signature = headers['x-twilio-email-event-webhook-signature'];
    const timestamp = headers['x-twilio-email-event-webhook-timestamp'];

    if (!signature || !timestamp) {
      throw new Error('Missing SendGrid signature headers');
    }

    const webhookSecret = this.configService.get<string>('SENDGRID_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('SendGrid webhook secret not configured, skipping signature verification');
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(timestamp + payload)
      .digest('base64');

    if (signature !== expectedSignature) {
      throw new Error('Invalid SendGrid signature');
    }
  }

  private verifyMailgunSignature(body: any, headers: Record<string, string>): void {
    const signature = headers['x-mailgun-signature-v2'];
    const timestamp = headers['x-mailgun-timestamp'];
    const token = headers['x-mailgun-token'];

    if (!signature || !timestamp || !token) {
      throw new Error('Missing Mailgun signature headers');
    }

    const webhookSecret = this.configService.get<string>('MAILGUN_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('Mailgun webhook secret not configured, skipping signature verification');
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(timestamp + token)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new Error('Invalid Mailgun signature');
    }
  }
}
