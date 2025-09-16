import { Provider } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

// Create a properly typed PubSub instance
const pubSub = new PubSub();

export const PubSubProvider: Provider = {
  provide: 'PUB_SUB',
  useValue: pubSub,
};

// Export the type for proper typing
export type PubSubType = typeof pubSub;
