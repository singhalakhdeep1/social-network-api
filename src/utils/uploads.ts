/**
 * Media uploads (GraphQL multipart). Files are validated by MIME type and written to
 * UPLOAD_DIR, served from /uploads. Swap `saveUpload` for an S3 driver to go off-disk.
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import { env } from '../config/env';
import { IMedia } from '../models/Post';
import { badInput } from './errors';

export interface UploadedFile {
  filename: string;
  mimetype: string;
  createReadStream(): NodeJS.ReadableStream;
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };

export const uploadRoot = (): string => path.resolve(env.uploadDir);

export const ensureUploadDir = (): void => {
  fs.mkdirSync(uploadRoot(), { recursive: true });
};

/** Accepts a relative `/uploads/..` path or an absolute http(s) URL pointing at media. */
export const mediaFromUrl = (url: string): IMedia => {
  const isLocal = url.startsWith('/uploads/');
  if (!isLocal && !/^https?:\/\//i.test(url)) throw badInput('Media URL must be http(s) or an /uploads path');
  const lower = url.split('?')[0].toLowerCase();
  const isVideo = /\.(mp4|webm|mov)$/.test(lower);
  return { url, type: isVideo ? 'video' : 'image' };
};

export const saveUpload = async (upload: Promise<UploadedFile> | UploadedFile): Promise<IMedia> => {
  const file = await upload;
  const mime = file.mimetype.toLowerCase();
  const ext = IMAGE_TYPES[mime] ?? VIDEO_TYPES[mime];
  if (!ext) throw badInput(`Unsupported file type ${file.mimetype}. Allowed: images (jpeg, png, gif, webp) and video (mp4, webm, mov)`);

  const now = new Date();
  const sub = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
  const dir = path.join(uploadRoot(), sub);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = `${randomBytes(12).toString('hex')}${ext}`;
  const target = path.join(dir, name);
  try {
    await pipeline(file.createReadStream(), fs.createWriteStream(target));
  } catch (err) {
    await fs.promises.rm(target, { force: true });
    throw badInput(`Upload failed: ${(err as Error).message}`);
  }
  return { url: `/uploads/${sub.replace(/\\/g, '/')}/${name}`, type: IMAGE_TYPES[mime] ? 'image' : 'video' };
};

/** Resolves any mix of uploads and URLs into media records. */
export const resolveMedia = async (uploads?: (Promise<UploadedFile> | UploadedFile | null | undefined)[] | null, urls?: string[] | null): Promise<IMedia[]> => {
  const out: IMedia[] = [];
  for (const u of uploads ?? []) if (u) out.push(await saveUpload(u));
  for (const url of urls ?? []) out.push(mediaFromUrl(url));
  if (out.length > 10) throw badInput('At most 10 media items are allowed');
  return out;
};
