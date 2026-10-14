/**
 * Small crypto helpers: token hashing, HMAC signing and AES-256-GCM text encryption
 * (used for chat messages at rest).
 */
import crypto from 'crypto';
import { env } from '../config/env';

export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('hex');

export const hmacSha256 = (secret: string, payload: string): string => crypto.createHmac('sha256', secret).update(payload).digest('hex');

export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const encryptionKey = (): Buffer => crypto.createHash('sha256').update(env.messageEncryptionKey).digest();

/** Returns `iv.tag.ciphertext` (base64 parts). */
export const encryptText = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
};

export const decryptText = (payload: string): string => {
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || data === undefined) return payload;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '[unable to decrypt message]';
  }
};
