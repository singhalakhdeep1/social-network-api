/**
 * EMAIL CONFIGURATION
 * 
 * Nodemailer setup for email notifications
 */

import nodemailer from 'nodemailer';

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@socialnetwork.com';

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

/**
 * Test email connection
 */
export const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email Server Connected');
    return true;
  } catch (error) {
    console.error('❌ Email Server Connection Failed:', error);
    return false;
  }
};

/**
 * Send email
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html
    });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    return false;
  }
};

/**
 * Email templates
 */
export const emailTemplates = {
  welcome: (username: string) => ({
    subject: 'Welcome to Social Network!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Social Network, ${username}!</h2>
        <p style="color: #666;">We're excited to have you join our community.</p>
        <p style="color: #666;">Start connecting with friends, sharing your thoughts, and discovering new content.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">Get Started</a>
      </div>
    `
  }),

  follow: (followerName: string, followerUsername: string) => ({
    subject: `${followerName} started following you`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Follower!</h2>
        <p style="color: #666;"><strong>${followerName}</strong> (@${followerUsername}) started following you.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/profile/${followerUsername}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Profile</a>
      </div>
    `
  }),

  like: (likerName: string, postContent: string) => ({
    subject: `${likerName} liked your post`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your post got a like!</h2>
        <p style="color: #666;"><strong>${likerName}</strong> liked your post:</p>
        <p style="color: #999; font-style: italic;">"${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}"</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/notifications" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Notifications</a>
      </div>
    `
  }),

  comment: (commenterName: string, postContent: string, commentContent: string) => ({
    subject: `${commenterName} commented on your post`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New comment on your post!</h2>
        <p style="color: #666;"><strong>${commenterName}</strong> commented:</p>
        <p style="color: #999; font-style: italic;">"${commentContent}"</p>
        <p style="color: #666;">On your post:</p>
        <p style="color: #999; font-style: italic;">"${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}"</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/notifications" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Comment</a>
      </div>
    `
  }),

  mention: (mentionerName: string, postContent: string) => ({
    subject: `${mentionerName} mentioned you`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You were mentioned!</h2>
        <p style="color: #666;"><strong>${mentionerName}</strong> mentioned you in a post:</p>
        <p style="color: #999; font-style: italic;">"${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}"</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/notifications" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Post</a>
      </div>
    `
  }),

  storyView: (viewerName: string) => ({
    subject: `${viewerName} viewed your story`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Story View!</h2>
        <p style="color: #666;"><strong>${viewerName}</strong> viewed your story.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/stories" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Story Stats</a>
      </div>
    `
  }),

  eventRSVP: (eventName: string, rsvpCount: number) => ({
    subject: `RSVP Update for ${eventName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Event RSVP Update!</h2>
        <p style="color: #666;">Your event <strong>${eventName}</strong> has ${rsvpCount} RSVPs.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/events" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Event</a>
      </div>
    `
  }),

  tipReceived: (tipperName: string, amount: number, currency: string) => ({
    subject: `You received a ${currency} ${amount} tip!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You received a tip!</h2>
        <p style="color: #666;"><strong>${tipperName}</strong> sent you a tip of ${currency} ${amount}.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/earnings" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Earnings</a>
      </div>
    `
  }),

  subscriptionNew: (subscriberName: string, tier: string) => ({
    subject: `New ${tier} subscriber!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Subscriber!</h2>
        <p style="color: #666;"><strong>${subscriberName}</strong> subscribed to your ${tier} tier.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/subscribers" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">View Subscribers</a>
      </div>
    `
  }),

  passwordReset: (resetUrl: string) => ({
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reset Your Password</h2>
        <p style="color: #666;">Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">Reset Password</a>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">This link will expire in 1 hour.</p>
      </div>
    `
  })
};

export default transporter;
