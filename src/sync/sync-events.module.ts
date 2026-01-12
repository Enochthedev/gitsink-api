import { Module } from '@nestjs/common';
import { SyncEventsResolver } from './sync-events.resolver';
import { SyncEventsService } from './sync-events.service';
import { PubSubProvider } from '../common/providers/pubsub.provider';

@Module({
    providers: [SyncEventsResolver, SyncEventsService, PubSubProvider],
    exports: [SyncEventsService],
})
export class SyncEventsModule { }
