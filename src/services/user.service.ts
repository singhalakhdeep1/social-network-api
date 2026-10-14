/**
 * Profiles and account settings.
 */
import { HydratedDocument } from 'mongoose';
import User, { INotificationPreferences, IUser } from '../models/User';
import AnalyticsEvent from '../models/AnalyticsEvent';
import { assertUrl, sanitizeInput } from '../middleware/validation';
import { badInput, notFound } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import { indexUser } from './search.service';
import { graph } from './graph/graph.service';
import { cache } from './cache/cache.service';

export type UserDoc = HydratedDocument<IUser>;

export const getUser = async (id: string): Promise<UserDoc> => {
  const user = await User.findById(toObjectId(id));
  if (!user) throw notFound('User');
  return user;
};

export const getUserByUsername = async (username: string): Promise<UserDoc> => {
  const user = await User.findOne({ username: username.trim().toLowerCase().replace(/^@/, '') });
  if (!user) throw notFound('User');
  return user;
};

export interface ProfileInput {
  displayName?: string | null;
  bio?: string | null;
  avatar?: string | null;
  website?: string | null;
  location?: string | null;
  isPrivate?: boolean | null;
  interests?: string[] | null;
  birthYear?: number | null;
}

export const updateProfile = async (userId: string, input: ProfileInput): Promise<UserDoc> => {
  const user = await getUser(userId);
  if (input.displayName !== undefined && input.displayName !== null) user.displayName = sanitizeInput(input.displayName).slice(0, 60);
  if (input.bio !== undefined && input.bio !== null) user.bio = sanitizeInput(input.bio).slice(0, 500);
  if (input.avatar !== undefined && input.avatar !== null) {
    if (input.avatar && !/^\/uploads\//.test(input.avatar) && !input.avatar.startsWith(process.env.PUBLIC_URL ?? '\u0000')) assertUrl(input.avatar, 'Avatar');
    user.avatar = input.avatar;
  }
  if (input.website !== undefined && input.website !== null) {
    if (input.website) assertUrl(input.website, 'Website');
    user.website = input.website;
  }
  if (input.location !== undefined && input.location !== null) user.location = sanitizeInput(input.location).slice(0, 100);
  if (typeof input.isPrivate === 'boolean') user.isPrivate = input.isPrivate;
  if (input.interests) user.interests = [...new Set(input.interests.map((i) => sanitizeInput(i).toLowerCase()).filter(Boolean))].slice(0, 20);
  if (input.birthYear !== undefined && input.birthYear !== null) {
    if (input.birthYear < 1900 || input.birthYear > new Date().getFullYear() - 13) throw badInput('Invalid birth year');
    user.birthYear = input.birthYear;
  }
  await user.save();
  await cache.delete(`visibility:${userId}`);
  await cache.invalidatePattern('visibility:*'); // privacy toggles change what everyone else may see
  indexUser(user);
  void graph.upsertUser({ id: user.id, username: user.username, displayName: user.displayName });
  return user;
};

export const updateNotificationPreferences = async (userId: string, prefs: Partial<INotificationPreferences>): Promise<UserDoc> => {
  const user = await getUser(userId);
  for (const key of Object.keys(prefs) as (keyof INotificationPreferences)[]) {
    if (typeof prefs[key] === 'boolean') user.notificationPreferences[key] = prefs[key] as boolean;
  }
  user.markModified('notificationPreferences');
  return user.save();
};

export const setVerified = async (userId: string, verified: boolean): Promise<UserDoc> => {
  const user = await getUser(userId);
  user.isVerified = verified;
  return user.save();
};

export const recordProfileView = async (viewerId: string, profileUserId: string): Promise<void> => {
  if (viewerId === profileUserId) return;
  await AnalyticsEvent.create({ user: viewerId, eventType: 'profile_viewed', targetUser: profileUserId });
};
