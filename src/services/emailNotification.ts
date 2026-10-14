/**
 * Email delivery for notifications (called by notification.service after preference checks).
 */
import validator from 'validator';
import { emailTemplates, sendEmail } from '../config/email';
import { env } from '../config/env';
import { NotificationType } from '../models/Notification';

const SUBJECTS: Partial<Record<NotificationType, string>> = {
  follow: 'You have a new follower',
  mention: 'You were mentioned',
  comment: 'New comment on your post',
  reply: 'New reply to your comment',
  tip: 'You received a tip',
  subscription: 'Subscription update'
};

export const EMAILED_TYPES = Object.keys(SUBJECTS) as NotificationType[];

export const sendNotificationEmail = (to: string, type: NotificationType, message: string): Promise<boolean> =>
  sendEmail({ to, ...emailTemplates.notification(SUBJECTS[type] ?? 'New activity', validator.escape(message), `${env.frontendUrl}/notifications`) });
