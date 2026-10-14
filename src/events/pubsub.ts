/**
 * Event bus for GraphQL subscriptions and cross-cutting domain events.
 * Uses Redis pub/sub (multi-instance safe) when Redis is up, otherwise an in-process PubSub.
 * Payloads are small id references: subscription `resolve` functions reload the entity, which
 * keeps messages JSON-serialisable and re-applies authorisation at delivery time.
 */
import { PubSub, PubSubEngine } from 'graphql-subscriptions';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { EventEmitter } from 'events';
import { createRedisConnection, isRedisReady } from '../config/redis';
import logger from '../utils/logger';

export const TOPICS = {
  POST_CREATED: 'POST_CREATED',
  POST_LIKED: (postId: string) => `POST_LIKED:${postId}`,
  COMMENT_ADDED: (postId: string) => `COMMENT_ADDED:${postId}`,
  REACTION_ADDED: (postId: string) => `REACTION_ADDED:${postId}`,
  NOTIFICATION: (userId: string) => `NOTIFICATION:${userId}`,
  FEED_UPDATED: (userId: string) => `FEED_UPDATED:${userId}`,
  MESSAGE_SENT: (conversationId: string) => `MESSAGE_SENT:${conversationId}`,
  TYPING: (conversationId: string) => `TYPING:${conversationId}`,
  CONVERSATION_UPDATED: (userId: string) => `CONVERSATION_UPDATED:${userId}`,
  STORY_CREATED: 'STORY_CREATED',
  STORY_VIEWED: (storyId: string) => `STORY_VIEWED:${storyId}`,
  STORY_REACTION: (storyId: string) => `STORY_REACTION:${storyId}`,
  EVENT_RSVP: (eventId: string) => `EVENT_RSVP:${eventId}`,
  USER_FOLLOWED: (userId: string) => `USER_FOLLOWED:${userId}`
};

let engine: PubSubEngine = new PubSub();

/** Process-local bus for server-side listeners (webhooks, graph sync, search indexing). */
export const domainEvents = new EventEmitter();
domainEvents.setMaxListeners(50);

export const initPubSub = (): void => {
  if (!isRedisReady()) {
    logger.info('PubSub: using in-process engine');
    return;
  }
  const opts = { lazyConnect: false, enableOfflineQueue: true, maxRetriesPerRequest: null as unknown as number };
  const publisher = createRedisConnection(opts);
  const subscriber = createRedisConnection(opts);
  publisher.on('error', () => undefined);
  subscriber.on('error', () => undefined);
  engine = new RedisPubSub({ publisher, subscriber });
  logger.info('PubSub: using Redis engine');
};

export const pubsub = {
  publish: (topic: string, payload: Record<string, unknown>): Promise<void> =>
    engine.publish(topic, payload).catch((err: Error) => {
      logger.warn(`pubsub publish failed: ${err.message}`);
    }),
  asyncIterator: <T = unknown>(topics: string | string[]): AsyncIterator<T> => engine.asyncIterator<T>(topics)
};

/** Typed helper for server-side domain events. */
export const emitDomainEvent = (event: string, payload: Record<string, unknown>): void => {
  domainEvents.emit(event, payload);
};
