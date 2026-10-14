/**
 * Notifications: persistence, real-time push (pub/sub), preference gating, email and webhooks.
 */
import { HydratedDocument, Types } from 'mongoose';
import Notification, { INotification, NotificationType } from '../models/Notification';
import User, { INotificationPreferences } from '../models/User';
import { EMAILED_TYPES, sendNotificationEmail } from './emailNotification';
import { pubsub, TOPICS, emitDomainEvent } from '../events/pubsub';
import { forbidden, notFound } from '../utils/errors';
import { Page, paginate } from '../utils/pagination';
import logger from '../utils/logger';

/** Which preference switch (if any) gates each notification type. */
const PREFERENCE_FOR: Partial<Record<NotificationType, keyof INotificationPreferences>> = {
  like: 'likes',
  reaction: 'likes',
  comment: 'comments',
  reply: 'comments',
  follow: 'follows',
  mention: 'mentions',
  message: 'messages'
};

export interface NotifyInput {
  recipient: string | Types.ObjectId;
  sender?: string | Types.ObjectId;
  type: NotificationType;
  message: string;
  post?: string | Types.ObjectId;
  comment?: string | Types.ObjectId;
}

export const notify = async (input: NotifyInput): Promise<HydratedDocument<INotification> | null> => {
  try {
    if (input.sender && String(input.sender) === String(input.recipient)) return null;
    const recipient = await User.findById(input.recipient).select('email username notificationPreferences');
    if (!recipient) return null;

    const prefs = recipient.notificationPreferences;
    const prefKey = PREFERENCE_FOR[input.type];
    if (prefKey && prefs[prefKey] === false) return null;

    const notification = await Notification.create({
      recipient: recipient._id,
      sender: input.sender,
      type: input.type,
      message: input.message,
      post: input.post,
      comment: input.comment
    });

    if (prefs.push !== false) void pubsub.publish(TOPICS.NOTIFICATION(recipient.id), { id: notification.id });
    emitDomainEvent('webhook', { userId: recipient.id, event: 'notification.created', data: { id: notification.id, type: input.type, message: input.message } });

    if (prefs.email !== false && EMAILED_TYPES.includes(input.type)) void sendNotificationEmail(recipient.email, input.type, input.message);
    return notification;
  } catch (err) {
    logger.warn(`notify failed: ${(err as Error).message}`);
    return null;
  }
};

export const listNotifications = (userId: string, opts: { unreadOnly?: boolean | null; limit?: number | null; cursor?: string | null }): Promise<Page<HydratedDocument<INotification>>> => {
  const filter: Record<string, unknown> = { recipient: userId };
  if (opts.unreadOnly) filter.read = false;
  return paginate(Notification, filter, opts);
};

export const unreadCount = (userId: string): Promise<number> => Notification.countDocuments({ recipient: userId, read: false });

export const markRead = async (userId: string, id: string): Promise<HydratedDocument<INotification>> => {
  const notification = await Notification.findById(id);
  if (!notification) throw notFound('Notification');
  if (notification.recipient.toString() !== userId) throw forbidden();
  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
};

export const markAllRead = async (userId: string): Promise<boolean> => {
  await Notification.updateMany({ recipient: userId, read: false }, { read: true, readAt: new Date() });
  return true;
};
