import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IWebhookStorage } from '../interfaces/webhook.interface';
import { WebhookEvent, WebhookEventFilter } from '../types/webhook.types';
import * as crypto from 'crypto';

@Injectable()
export class WebhookStorageService implements IWebhookStorage {
  private readonly logger = new Logger(WebhookStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async storeEvent(event: Omit<WebhookEvent, 'id'>): Promise<WebhookEvent> {
    try {
      // Check for duplicates first
      const isDuplicate = await this.isDuplicateEvent(
        event.platform,
        event.eventType,
        event.repositoryId,
        event.payload,
      );

      if (isDuplicate) {
        this.logger.debug(
          `Duplicate webhook event detected for ${event.platform}:${event.eventType}:${event.repositoryId}`,
        );
        // Return existing event instead of creating duplicate
        const existingEvent = await this.findExistingEvent(event);
        if (existingEvent) {
          return existingEvent;
        }
      }

      const storedEvent = await this.prisma.webhookEvent.create({
        data: {
          platform: event.platform,
          eventType: event.eventType,
          repositoryUrl: event.repositoryUrl,
          repositoryId: event.repositoryId,
          repositoryName: event.repositoryName,
          repositoryFullName: event.repositoryFullName,
          ownerId: event.ownerId,
          ownerName: event.ownerName,
          payload: event.payload,
          signature: event.signature,
          timestamp: event.timestamp,
          processed: event.processed,
          retryCount: event.retryCount,
          lastRetryAt: event.lastRetryAt,
          error: event.error,
        },
      });

      return {
        id: storedEvent.id,
        platform: storedEvent.platform as 'github' | 'gitlab' | 'bitbucket',
        eventType: storedEvent.eventType,
        repositoryUrl: storedEvent.repositoryUrl,
        repositoryId: storedEvent.repositoryId,
        repositoryName: storedEvent.repositoryName,
        repositoryFullName: storedEvent.repositoryFullName,
        ownerId: storedEvent.ownerId,
        ownerName: storedEvent.ownerName,
        payload: storedEvent.payload,
        signature: storedEvent.signature,
        timestamp: storedEvent.timestamp,
        processed: storedEvent.processed,
        retryCount: storedEvent.retryCount,
        lastRetryAt: storedEvent.lastRetryAt || undefined,
        error: storedEvent.error || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to store webhook event:', error);
      throw error;
    }
  }

  async getEvent(eventId: string): Promise<WebhookEvent | null> {
    try {
      const event = await this.prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return null;
      }

      return {
        id: event.id,
        platform: event.platform as 'github' | 'gitlab' | 'bitbucket',
        eventType: event.eventType,
        repositoryUrl: event.repositoryUrl,
        repositoryId: event.repositoryId,
        repositoryName: event.repositoryName,
        repositoryFullName: event.repositoryFullName,
        ownerId: event.ownerId,
        ownerName: event.ownerName,
        payload: event.payload,
        signature: event.signature,
        timestamp: event.timestamp,
        processed: event.processed,
        retryCount: event.retryCount,
        lastRetryAt: event.lastRetryAt || undefined,
        error: event.error || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to get webhook event ${eventId}:`, error);
      throw error;
    }
  }

  async updateEvent(eventId: string, updates: Partial<WebhookEvent>): Promise<WebhookEvent> {
    try {
      const updatedEvent = await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          ...(updates.processed !== undefined && {
            processed: updates.processed,
          }),
          ...(updates.retryCount !== undefined && {
            retryCount: updates.retryCount,
          }),
          ...(updates.lastRetryAt !== undefined && {
            lastRetryAt: updates.lastRetryAt,
          }),
          ...(updates.error !== undefined && { error: updates.error }),
        },
      });

      return {
        id: updatedEvent.id,
        platform: updatedEvent.platform as 'github' | 'gitlab' | 'bitbucket',
        eventType: updatedEvent.eventType,
        repositoryUrl: updatedEvent.repositoryUrl,
        repositoryId: updatedEvent.repositoryId,
        repositoryName: updatedEvent.repositoryName,
        repositoryFullName: updatedEvent.repositoryFullName,
        ownerId: updatedEvent.ownerId,
        ownerName: updatedEvent.ownerName,
        payload: updatedEvent.payload,
        signature: updatedEvent.signature,
        timestamp: updatedEvent.timestamp,
        processed: updatedEvent.processed,
        retryCount: updatedEvent.retryCount,
        lastRetryAt: updatedEvent.lastRetryAt || undefined,
        error: updatedEvent.error || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to update webhook event ${eventId}:`, error);
      throw error;
    }
  }

  async getEvents(filter: WebhookEventFilter, limit = 100, offset = 0): Promise<WebhookEvent[]> {
    try {
      const where: any = {};

      if (filter.platform) {
        where.platform = filter.platform;
      }
      if (filter.eventType) {
        where.eventType = filter.eventType;
      }
      if (filter.repositoryId) {
        where.repositoryId = filter.repositoryId;
      }
      if (filter.ownerId) {
        where.ownerId = filter.ownerId;
      }
      if (filter.processed !== undefined) {
        where.processed = filter.processed;
      }
      if (filter.fromDate || filter.toDate) {
        where.timestamp = {};
        if (filter.fromDate) {
          where.timestamp.gte = filter.fromDate;
        }
        if (filter.toDate) {
          where.timestamp.lte = filter.toDate;
        }
      }

      const events = await this.prisma.webhookEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      });

      return events.map(event => ({
        id: event.id,
        platform: event.platform as 'github' | 'gitlab' | 'bitbucket',
        eventType: event.eventType,
        repositoryUrl: event.repositoryUrl,
        repositoryId: event.repositoryId,
        repositoryName: event.repositoryName,
        repositoryFullName: event.repositoryFullName,
        ownerId: event.ownerId,
        ownerName: event.ownerName,
        payload: event.payload,
        signature: event.signature,
        timestamp: event.timestamp,
        processed: event.processed,
        retryCount: event.retryCount,
        lastRetryAt: event.lastRetryAt || undefined,
        error: event.error || undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to get webhook events:', error);
      throw error;
    }
  }

  async markAsProcessed(eventId: string, success: boolean, error?: string): Promise<void> {
    try {
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processed: success,
          error: error || null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to mark webhook event ${eventId} as processed:`, error);
      throw error;
    }
  }

  async incrementRetryCount(eventId: string): Promise<void> {
    try {
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to increment retry count for webhook event ${eventId}:`, error);
      throw error;
    }
  }

  async cleanupOldEvents(olderThan: Date): Promise<number> {
    try {
      const result = await this.prisma.webhookEvent.deleteMany({
        where: {
          timestamp: { lt: olderThan },
          processed: true,
        },
      });

      this.logger.log(`Cleaned up ${result.count} old webhook events`);
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup old webhook events:', error);
      throw error;
    }
  }

  async isDuplicateEvent(
    platform: string,
    eventType: string,
    repositoryId: string,
    payload: any,
  ): Promise<boolean> {
    try {
      // Create a hash of the payload for comparison
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      // Look for events with same platform, eventType, repositoryId within last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const existingEvent = await this.prisma.webhookEvent.findFirst({
        where: {
          platform,
          eventType,
          repositoryId,
          timestamp: { gte: fiveMinutesAgo },
        },
        select: { payload: true },
      });

      if (!existingEvent) {
        return false;
      }

      // Compare payload hashes
      const existingPayloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(existingEvent.payload))
        .digest('hex');

      return payloadHash === existingPayloadHash;
    } catch (error) {
      this.logger.error('Failed to check for duplicate webhook event:', error);
      return false;
    }
  }

  private async findExistingEvent(event: Omit<WebhookEvent, 'id'>): Promise<WebhookEvent | null> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const existingEvent = await this.prisma.webhookEvent.findFirst({
        where: {
          platform: event.platform,
          eventType: event.eventType,
          repositoryId: event.repositoryId,
          timestamp: { gte: fiveMinutesAgo },
        },
      });

      if (!existingEvent) {
        return null;
      }

      return {
        id: existingEvent.id,
        platform: existingEvent.platform as 'github' | 'gitlab' | 'bitbucket',
        eventType: existingEvent.eventType,
        repositoryUrl: existingEvent.repositoryUrl,
        repositoryId: existingEvent.repositoryId,
        repositoryName: existingEvent.repositoryName,
        repositoryFullName: existingEvent.repositoryFullName,
        ownerId: existingEvent.ownerId,
        ownerName: existingEvent.ownerName,
        payload: existingEvent.payload,
        signature: existingEvent.signature,
        timestamp: existingEvent.timestamp,
        processed: existingEvent.processed,
        retryCount: existingEvent.retryCount,
        lastRetryAt: existingEvent.lastRetryAt || undefined,
        error: existingEvent.error || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to find existing webhook event:', error);
      return null;
    }
  }
}
