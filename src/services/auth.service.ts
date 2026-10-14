/**
 * Authentication: registration, login (lockout + TOTP 2FA), refresh-token rotation with reuse
 * detection, email verification, password reset / change.
 */
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import User, { IUser } from '../models/User';
import { signAccessToken } from '../middleware/auth';
import { sanitizeInput, validateEmail, validatePassword, validateUsername } from '../middleware/validation';
import { AppError, badInput, conflict, notFound, unauthenticated } from '../utils/errors';
import { randomToken, sha256 } from '../utils/crypto';
import { emailTemplates, sendEmail } from '../config/email';
import { emitDomainEvent } from '../events/pubsub';
import logger from '../utils/logger';

const MAX_SESSIONS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MS = 2 * 60 * 60 * 1000;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: HydratedDocument<IUser>;
}

const refreshTtlMs = (): number => {
  const m = /^(\d+)([smhd])$/.exec(env.jwtRefreshExpire);
  if (!m) return 7 * 24 * 3600 * 1000;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * unit;
};

/** Mints an access/refresh pair and persists the hashed refresh token as a session on the user. */
const issueSession = async (user: HydratedDocument<IUser>, userAgent?: string): Promise<AuthResult> => {
  const full = await User.findById(user.id).select('+refreshSessions');
  if (!full) throw notFound('User');
  const now = Date.now();
  full.refreshSessions = (full.refreshSessions || []).filter((s) => s.expiresAt.getTime() > now);
  const sessionId = randomToken(8);
  const refreshToken = jwt.sign({ sub: full.id, sid: sessionId }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpire as jwt.SignOptions['expiresIn']
  });
  full.refreshSessions.push({
    hash: sha256(refreshToken),
    expiresAt: new Date(now + refreshTtlMs()),
    userAgent: userAgent?.slice(0, 200),
    createdAt: new Date()
  } as IUser['refreshSessions'][number]);
  if (full.refreshSessions.length > MAX_SESSIONS) full.refreshSessions = full.refreshSessions.slice(-MAX_SESSIONS);
  await full.save();
  return { accessToken: signAccessToken({ id: full.id, username: full.username }), refreshToken, user: full };
};

const sendVerificationEmail = async (user: HydratedDocument<IUser>): Promise<void> => {
  const raw = randomToken();
  await User.updateOne({ _id: user._id }, { verificationToken: sha256(raw), verificationTokenExpire: new Date(Date.now() + 24 * 3600 * 1000) });
  const link = `${env.frontendUrl}/verify-email?token=${raw}`;
  void sendEmail({ to: user.email, ...emailTemplates.verifyEmail(user.username, link) });
};

export const register = async (input: { username: string; email: string; password: string; displayName?: string }, userAgent?: string): Promise<AuthResult> => {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!validateUsername(username)) throw badInput('Username must be 3-30 characters: letters, numbers, underscore');
  if (!validateEmail(email)) throw badInput('Invalid email address');
  if (!validatePassword(input.password)) throw badInput('Password must be at least 8 characters');

  const existing = await User.findOne({ $or: [{ email }, { username }] }).select('email username');
  if (existing) throw conflict(existing.email === email ? 'Email already registered' : 'Username already taken');

  const user = await User.create({
    username,
    email,
    password: input.password,
    displayName: input.displayName ? sanitizeInput(input.displayName) : undefined,
    role: env.adminEmails.includes(email) ? 'admin' : 'user'
  });
  void sendVerificationEmail(user);
  emitDomainEvent('user.created', { userId: user.id });
  return issueSession(user);
};

export const login = async (input: { email: string; password: string; twoFactorCode?: string | null }, userAgent?: string): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() }).select('+password +twoFactorSecret');
  if (!user) throw unauthenticated('Invalid credentials');

  if (user.isLocked()) {
    throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked after too many failed attempts. Try again later.');
  }

  if (!(await user.comparePassword(input.password))) {
    const attempts = (user.lockUntil && user.lockUntil.getTime() < Date.now() ? 0 : user.loginAttempts) + 1;
    const update: Record<string, unknown> = { loginAttempts: attempts };
    if (attempts >= MAX_LOGIN_ATTEMPTS) update.lockUntil = new Date(Date.now() + LOCK_MS);
    await User.updateOne({ _id: user._id }, update);
    throw unauthenticated('Invalid credentials');
  }

  if (user.twoFactorEnabled) {
    if (!input.twoFactorCode) throw new AppError('TWO_FACTOR_REQUIRED', 'Two-factor code required');
    if (!user.twoFactorSecret || !authenticator.check(input.twoFactorCode.replace(/\s/g, ''), user.twoFactorSecret)) {
      throw unauthenticated('Invalid two-factor code');
    }
  }

  await User.updateOne({ _id: user._id }, { loginAttempts: 0, lastLogin: new Date(), $unset: { lockUntil: 1 } });
  return issueSession(user, userAgent);
};

/** Rotates the refresh token. Presenting an already-rotated token revokes every session (theft signal). */
export const refresh = async (refreshToken: string, userAgent?: string): Promise<AuthResult> => {
  let payload: { sub: string };
  try {
    payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as { sub: string };
  } catch {
    throw unauthenticated('Invalid refresh token');
  }
  const user = await User.findById(payload.sub).select('+refreshSessions');
  if (!user) throw unauthenticated('Invalid refresh token');

  const hash = sha256(refreshToken);
  const session = user.refreshSessions.find((s) => s.hash === hash);
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (!session) {
      logger.warn(`Refresh token reuse detected for user ${user.id}; revoking all sessions`);
      user.refreshSessions = [];
      await user.save();
    }
    throw unauthenticated('Invalid refresh token');
  }
  user.refreshSessions = user.refreshSessions.filter((s) => s.hash !== hash);
  await user.save();
  return issueSession(user, userAgent);
};

export const logout = async (userId: string, refreshToken?: string | null): Promise<boolean> => {
  if (refreshToken) {
    await User.updateOne({ _id: userId }, { $pull: { refreshSessions: { hash: sha256(refreshToken) } } });
  } else {
    await User.updateOne({ _id: userId }, { $set: { refreshSessions: [] } });
  }
  return true;
};

export const verifyEmail = async (token: string): Promise<boolean> => {
  const user = await User.findOne({ verificationToken: sha256(token), verificationTokenExpire: { $gt: new Date() } });
  if (!user) throw badInput('Verification link is invalid or has expired');
  await User.updateOne({ _id: user._id }, { emailVerified: true, $unset: { verificationToken: 1, verificationTokenExpire: 1 } });
  return true;
};

export const resendVerification = async (userId: string): Promise<boolean> => {
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  if (user.emailVerified) return true;
  await sendVerificationEmail(user);
  return true;
};

/** Always resolves true so the endpoint cannot be used to enumerate accounts. */
export const forgotPassword = async (email: string): Promise<boolean> => {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (user) {
    const raw = randomToken();
    await User.updateOne({ _id: user._id }, { resetPasswordToken: sha256(raw), resetPasswordExpire: new Date(Date.now() + 10 * 60 * 1000) });
    void sendEmail({ to: user.email, ...emailTemplates.resetPassword(user.username, `${env.frontendUrl}/reset-password?token=${raw}`) });
  }
  return true;
};

export const resetPassword = async (token: string, password: string): Promise<boolean> => {
  if (!validatePassword(password)) throw badInput('Password must be at least 8 characters');
  const user = await User.findOne({ resetPasswordToken: sha256(token), resetPasswordExpire: { $gt: new Date() } }).select('+password +refreshSessions');
  if (!user) throw badInput('Reset link is invalid or has expired');
  user.password = password;
  user.refreshSessions = [];
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  return true;
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<boolean> => {
  if (!validatePassword(newPassword)) throw badInput('Password must be at least 8 characters');
  const user = await User.findById(userId).select('+password +refreshSessions');
  if (!user) throw notFound('User');
  if (!(await user.comparePassword(currentPassword))) throw unauthenticated('Current password is incorrect');
  user.password = newPassword;
  user.refreshSessions = [];
  await user.save();
  return true;
};

export const beginTwoFactorSetup = async (userId: string): Promise<{ secret: string; otpauthUrl: string }> => {
  const user = await User.findById(userId).select('+twoFactorSecret');
  if (!user) throw notFound('User');
  if (user.twoFactorEnabled) throw conflict('Two-factor authentication is already enabled');
  const secret = authenticator.generateSecret();
  await User.updateOne({ _id: userId }, { twoFactorSecret: secret });
  return { secret, otpauthUrl: authenticator.keyuri(user.email, 'Social Network', secret) };
};

export const enableTwoFactor = async (userId: string, code: string): Promise<boolean> => {
  const user = await User.findById(userId).select('+twoFactorSecret');
  if (!user?.twoFactorSecret) throw badInput('Start two-factor setup first');
  if (!authenticator.check(code.replace(/\s/g, ''), user.twoFactorSecret)) throw badInput('Invalid code');
  await User.updateOne({ _id: userId }, { twoFactorEnabled: true });
  return true;
};

export const disableTwoFactor = async (userId: string, password: string, code: string): Promise<boolean> => {
  const user = await User.findById(userId).select('+password +twoFactorSecret');
  if (!user) throw notFound('User');
  if (!(await user.comparePassword(password))) throw unauthenticated('Password is incorrect');
  if (user.twoFactorEnabled && (!user.twoFactorSecret || !authenticator.check(code.replace(/\s/g, ''), user.twoFactorSecret))) {
    throw badInput('Invalid code');
  }
  await User.updateOne({ _id: userId }, { twoFactorEnabled: false, $unset: { twoFactorSecret: 1 } });
  return true;
};
