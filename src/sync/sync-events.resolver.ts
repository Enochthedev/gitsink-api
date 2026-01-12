import {
    Resolver,
    Subscription,
    Query,
    Args,
    ObjectType,
    Field,
    ID,
    registerEnumType,
} from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

// Define sync event types
export enum SyncEventType {
    SYNC_STARTED = 'SYNC_STARTED',
    SYNC_PROGRESS = 'SYNC_PROGRESS',
    SYNC_COMPLETED = 'SYNC_COMPLETED',
    SYNC_FAILED = 'SYNC_FAILED',
}

registerEnumType(SyncEventType, {
    name: 'SyncEventType',
    description: 'Type of sync event',
});

@ObjectType()
export class SyncProgress {
    @Field(() => Number)
    current!: number;

    @Field(() => Number)
    total!: number;

    @Field(() => Number)
    percentage!: number;
}

@ObjectType()
export class SyncedProject {
    @Field(() => ID)
    id!: string;

    @Field()
    title!: string;

    @Field()
    repoUrl!: string;

    @Field({ nullable: true })
    language?: string;

    @Field(() => Number)
    starCount!: number;

    @Field(() => Boolean)
    isPrivate!: boolean;
}

@ObjectType()
export class SyncEvent {
    @Field(() => ID)
    id!: string;

    @Field(() => SyncEventType)
    type!: SyncEventType;

    @Field(() => ID)
    userId!: string;

    @Field()
    timestamp!: Date;

    @Field({ nullable: true })
    message?: string;

    @Field(() => SyncProgress, { nullable: true })
    progress?: SyncProgress;

    @Field(() => [SyncedProject], { nullable: true })
    projects?: SyncedProject[];

    @Field({ nullable: true })
    error?: string;

    @Field(() => Number, { nullable: true })
    duration?: number;
}

// Subscription topics
export const SYNC_EVENTS = 'syncEvents';

@Resolver()
export class SyncEventsResolver {
    constructor(@Inject('PUB_SUB') private readonly pubSub: PubSub) { }

    @Query(() => String)
    syncEventsInfo(): string {
        return 'Subscribe to syncEvents to receive real-time sync notifications';
    }

    @Subscription(() => SyncEvent, {
        name: 'syncEvents',
        description: 'Subscribe to sync events for real-time updates',
        filter: (payload, variables) => {
            // Only send events to the user who owns them
            return payload.syncEvents.userId === variables.userId;
        },
    })
    syncEvents(@Args('userId', { type: () => ID }) userId: string) {
        return this.pubSub.asyncIterableIterator(SYNC_EVENTS);
    }
}
