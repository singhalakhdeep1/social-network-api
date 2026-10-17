/**
 * Nodemailer transport. With no EMAIL_HOST configured it uses the JSON transport, so messages
 * are rendered and logged instead of delivered (handy for development and CI).
 */
import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';
import logger from '../utils/logger';

const live = !!env.emailHost;

const transporter: Transporter = live
  ? nodemailer.createTransport({
      host: env.emailHost,
      port: env.emailPort,
      secure: env.emailPort === 465,
      auth: env.emailUser ? { user: env.emailUser, pass: env.emailPass } : undefined
    })
  : nodemailer.createTransport({ jsonTransport: true });

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const emailMode = (): 'smtp' | 'log' => (live ? 'smtp' : 'log');

export const testEmailConnection = async (): Promise<boolean> => {
  if (!live) {
    logger.info('Email: no EMAIL_HOST set, messages are logged instead of sent');
    return true;
  }
  try {
    await transporter.verify();
    logger.info('Email server connected');
    return true;
  } catch (error) {
    logger.warn(`Email server unreachable: ${(error as Error).message}`);
    return false;
  }
};

export const sendEmail = async (message: MailMessage): Promise<boolean> => {
  try {
    const info = await transporter.sendMail({ from: env.emailFrom, ...message });
    if (!live) {
      // Without SMTP the links (verification, password reset) are printed so local users can still finish those flows.
      const links = [...message.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      logger.info(`Email (log mode) to ${message.to}: ${message.subject}${links.length && !env.isProd ? ` | links: ${links.join(' ')}` : ''}`);
    }
    else logger.debug(`Email sent ${info.messageId}`);
    return true;
  } catch (error) {
    logger.warn(`Email to ${message.to} failed: ${(error as Error).message}`);
    return false;
  }
};

const layout = (title: string, body: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="margin:0 0 12px">${title}</h2>${body}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><p style="color:#888;font-size:12px">Social Network</p></div>`;

export const emailTemplates = {
  verifyEmail: (username: string, link: string) => ({
    subject: 'Verify your email',
    html: layout('Welcome, ' + username, `<p>Confirm your email address to finish setting up your account.</p><p><a href="${link}">Verify email</a></p>`)
  }),
  resetPassword: (username: string, link: string) => ({
    subject: 'Reset your password',
    html: layout('Password reset', `<p>Hi ${username}, use the link below within 10 minutes to choose a new password.</p><p><a href="${link}">Reset password</a></p><p>If this wasn't you, ignore this email.</p>`)
  }),
  notification: (title: string, message: string, link: string) => ({
    subject: title,
    html: layout(title, `<p>${message}</p><p><a href="${link}">Open</a></p>`)
  })
};
