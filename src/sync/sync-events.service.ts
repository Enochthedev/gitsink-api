import { Inject, Injectable, Logger } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { v4 as uuidv4 } from 'uuid';
import {
  SYNC_EVENTS,
  SyncEvent,
  SyncEventType,
  SyncProgress,
  SyncedProject,
} from './sync-events.resolver';

@Injectable()
export class SyncEventsService {
  private readonly logger = new Logger(SyncEventsService.name);

  constructor(@Inject('PUB_SUB') private readonly pubSub: PubSub) {}

  /**
   * Publish a sync started event
   */
  async publishSyncStarted(userId: string, message?: string): Promise<void> {
    const event: SyncEvent = {
      id: uuidv4(),
      type: SyncEventType.SYNC_STARTED,
      userId,
      timestamp: new Date(),
      message: message || 'Sync started',
    };

    await this.publish(event);
    this.logger.log(`Sync started event published for user ${userId}`);
  }

  /**
   * Publish a sync progress event
   */
  async publishSyncProgress(
    userId: string,
    current: number,
    total: number,
    message?: string,
  ): Promise<void> {
    const progress: SyncProgress = {
      current,
      total,
      percentage: Math.round((current / total) * 100),
    };

    const event: SyncEvent = {
      id: uuidv4(),
      type: SyncEventType.SYNC_PROGRESS,
      userId,
      timestamp: new Date(),
      message: message || `Syncing repository ${current} of ${total}`,
      progress,
    };

    await this.publish(event);
    this.logger.debug(`Sync progress: ${current}/${total} for user ${userId}`);
  }

  /**
   * Publish a sync completed event
   */
  async publishSyncCompleted(
    userId: string,
    projects: SyncedProject[],
    duration: number,
  ): Promise<void> {
    const event: SyncEvent = {
      id: uuidv4(),
      type: SyncEventType.SYNC_COMPLETED,
      userId,
      timestamp: new Date(),
      message: `Sync completed! ${projects.length} projects synced.`,
      projects,
      duration,
    };

    await this.publish(event);
    this.logger.log(
      `Sync completed for user ${userId}: ${projects.length} projects in ${duration}ms`,
    );
  }

  /**
   * Publish a sync failed event
   */
  async publishSyncFailed(userId: string, error: string): Promise<void> {
    const event: SyncEvent = {
      id: uuidv4(),
      type: SyncEventType.SYNC_FAILED,
      userId,
      timestamp: new Date(),
      message: 'Sync failed',
      error,
    };

    await this.publish(event);
    this.logger.error(`Sync failed for user ${userId}: ${error}`);
  }

  private async publish(event: SyncEvent): Promise<void> {
    try {
      await this.pubSub.publish(SYNC_EVENTS, { syncEvents: event });
    } catch (error) {
      this.logger.error('Failed to publish sync event', {
        error: error instanceof Error ? error.message : String(error),
        event,
      });
    }
  }
}
