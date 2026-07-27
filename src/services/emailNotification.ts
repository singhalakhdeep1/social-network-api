/**
 * EMAIL NOTIFICATION SERVICE
 * 
 * Integrates email sending with the notification system
 */

import { sendEmail, emailTemplates } from '../config/email';
import User from '../models/User';
import Notification from '../models/Notification';

/**
 * Send email notification based on notification type
 */
export const sendNotificationEmail = async (notification: any) => {
  try {
    const recipient = await User.findById(notification.recipient);
    if (!recipient || !recipient.email) return;

    let emailTemplate;

    switch (notification.type) {
      case 'follow':
        const follower = await User.findById(notification.sender);
        if (follower) {
          emailTemplate = emailTemplates.follow(follower.name || follower.username, follower.username);
        }
        break;

      case 'like':
        const liker = await User.findById(notification.sender);
        const post = await (await import('../models/Post')).default.findById(notification.post);
        if (liker && post) {
          emailTemplate = emailTemplates.like(liker.name || liker.username, post.content);
        }
        break;

      case 'comment':
        const commenter = await User.findById(notification.sender);
        const commentPost = await (await import('../models/Post')).default.findById(notification.post);
        const comment = await (await import('../models/Comment')).default.findById(notification.comment);
        if (commenter && commentPost && comment) {
          emailTemplate = emailTemplates.comment(commenter.name || commenter.username, commentPost.content, comment.content);
        }
        break;

      case 'mention':
        const mentioner = await User.findById(notification.sender);
        const mentionPost = await (await import('../models/Post')).default.findById(notification.post);
        if (mentioner && mentionPost) {
          emailTemplate = emailTemplates.mention(mentioner.name || mentioner.username, mentionPost.content);
        }
        break;

      case 'story_view':
        const viewer = await User.findById(notification.sender);
        if (viewer) {
          emailTemplate = emailTemplates.storyView(viewer.name || viewer.username);
        }
        break;

      case 'event_rsvp':
        const event = await (await import('../models/Event')).default.findById(notification.post);
        if (event) {
          emailTemplate = emailTemplates.eventRSVP(event.name, event.attendees?.length || 0);
        }
        break;

      case 'tip_received':
        const tipper = await User.findById(notification.sender);
        const tip = await (await import('../models/Tip')).default.findById(notification.post);
        if (tipper && tip) {
          emailTemplate = emailTemplates.tipReceived(tipper.name || tipper.username, tip.amount, tip.currency);
        }
        break;

      case 'subscription':
        const subscriber = await User.findById(notification.sender);
        const subscription = await (await import('../models/Subscription')).default.findById(notification.post);
        if (subscriber && subscription) {
          emailTemplate = emailTemplates.subscriptionNew(subscriber.name || subscriber.username, subscription.tier);
        }
        break;

      default:
        return;
    }

    if (emailTemplate) {
      await sendEmail(recipient.email, emailTemplate.subject, emailTemplate.html);
    }
  } catch (error) {
    console.error('❌ Error sending notification email:', error);
  }
};

/**
 * Send welcome email to new user
 */
export const sendWelcomeEmail = async (userId: string) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.email) return;

    const emailTemplate = emailTemplates.welcome(user.name || user.username);
    await sendEmail(user.email, emailTemplate.subject, emailTemplate.html);
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email: string, resetUrl: string) => {
  try {
    const emailTemplate = emailTemplates.passwordReset(resetUrl);
    await sendEmail(email, emailTemplate.subject, emailTemplate.html);
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
  }
};

/**
 * Process pending email notifications
 * Can be run as a cron job
 */
export const processPendingEmailNotifications = async () => {
  try {
    const pendingNotifications = await Notification.find({
      emailSent: false,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).limit(100);

    for (const notification of pendingNotifications) {
      await sendNotificationEmail(notification);
      await Notification.findByIdAndUpdate(notification._id, { emailSent: true });
    }

    console.log(`✅ Processed ${pendingNotifications.length} email notifications`);
  } catch (error) {
    console.error('❌ Error processing email notifications:', error);
  }
};

export default {
  sendNotificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  processPendingEmailNotifications
};
