/**
 * Notifications (query / mark-read / real-time).
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { INotification } from '../../models/Notification';
import * as notifications from '../../services/notification.service';
import { pubsub, TOPICS } from '../../events/pubsub';

type NotificationDoc = HydratedDocument<INotification>;

export const typeDefs = /* GraphQL */ `
  type Notification {
    id: ID!
    recipient: User!
    sender: User
    type: String!
    post: Post
    comment: Comment
    message: String!
    read: Boolean!
    readAt: DateTime
    createdAt: DateTime!
  }

  type NotificationPage {
    nodes: [Notification!]!
    nextCursor: String
    hasMore: Boolean!
  }

  extend type Query {
    notifications(unreadOnly: Boolean, limit: Int, cursor: String): NotificationPage!
    unreadNotificationCount: Int!
  }

  extend type Mutation {
    markNotificationAsRead(notificationId: ID!): Notification!
    markAllNotificationsAsRead: Boolean!
  }

  extend type Subscription {
    "Your own new notifications, delivered over the WebSocket"
    notificationAdded: Notification!
  }
`;

export const resolvers = {
  Query: {
    notifications: (_: unknown, args: { unreadOnly?: boolean; limit?: number; cursor?: string }, ctx: Context) => notifications.listNotifications(authed(ctx).id, args),
    unreadNotificationCount: (_: unknown, __: unknown, ctx: Context) => notifications.unreadCount(authed(ctx).id)
  },
  Mutation: {
    markNotificationAsRead: (_: unknown, { notificationId }: { notificationId: string }, ctx: Context) => notifications.markRead(authed(ctx).id, notificationId),
    markAllNotificationsAsRead: (_: unknown, __: unknown, ctx: Context) => notifications.markAllRead(authed(ctx).id)
  },
  Subscription: {
    notificationAdded: {
      subscribe: (_: unknown, __: unknown, ctx: Context) => pubsub.asyncIterator(TOPICS.NOTIFICATION(authed(ctx).id)),
      resolve: async (p: { id: string }) => (await import('../../models/Notification')).default.findById(p.id)
    }
  },
  Notification: {
    recipient: (n: NotificationDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(n.recipient.toString()),
    sender: (n: NotificationDoc, _: unknown, ctx: Context) => (n.sender ? ctx.loaders.user.load(n.sender.toString()) : null),
    post: (n: NotificationDoc, _: unknown, ctx: Context) => (n.post ? ctx.loaders.post.load(n.post.toString()) : null),
    comment: (n: NotificationDoc, _: unknown, ctx: Context) => (n.comment ? ctx.loaders.comment.load(n.comment.toString()) : null)
  }
};
