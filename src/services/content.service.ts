/**
 * Content management: drafts, scheduled posts and the content calendar.
 */
import { HydratedDocument } from 'mongoose';
import DraftPost, { IDraftPost } from '../models/DraftPost';
import ScheduledPost, { IScheduledPost } from '../models/ScheduledPost';
import { IMedia, IPost } from '../models/Post';
import { moderateContent, sanitizeInput } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import { createPost } from './post.service';
import logger from '../utils/logger';

export type DraftDoc = HydratedDocument<IDraftPost>;
export type ScheduledDoc = HydratedDocument<IScheduledPost>;

const ownedDraft = async (userId: string, id: string): Promise<DraftDoc> => {
  const d = await DraftPost.findById(toObjectId(id));
  if (!d) throw notFound('Draft');
  if (d.author.toString() !== userId) throw forbidden();
  return d;
};

const ownedScheduled = async (userId: string, id: string): Promise<ScheduledDoc> => {
  const s = await ScheduledPost.findById(toObjectId(id));
  if (!s) throw notFound('Scheduled post');
  if (s.author.toString() !== userId) throw forbidden();
  return s;
};

export const createDraft = async (userId: string, content: string | null | undefined, media: IMedia[] = []): Promise<DraftDoc> => {
  const text = sanitizeInput(content ?? '');
  if (!text && !media.length) throw badInput('A draft needs text or media');
  if ((await DraftPost.countDocuments({ author: userId })) >= 100) throw badInput('Draft limit reached (100)');
  return DraftPost.create({ author: userId, content: text, media });
};

export const updateDraft = async (userId: string, id: string, patch: { content?: string | null; media?: IMedia[] }): Promise<DraftDoc> => {
  const d = await ownedDraft(userId, id);
  if (patch.content !== undefined && patch.content !== null) d.content = sanitizeInput(patch.content);
  if (patch.media) d.media = patch.media;
  return d.save();
};

export const deleteDraft = async (userId: string, id: string): Promise<boolean> => {
  const d = await ownedDraft(userId, id);
  await d.deleteOne();
  return true;
};

export const publishDraft = async (userId: string, id: string): Promise<HydratedDocument<IPost>> => {
  const d = await ownedDraft(userId, id);
  const post = await createPost(userId, { content: d.content, media: d.media });
  await d.deleteOne();
  return post;
};

export const listDrafts = (userId: string): Promise<DraftDoc[]> => DraftPost.find({ author: userId }).sort({ updatedAt: -1 });

const parseFuture = (iso: string): Date => {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) throw badInput('Invalid date');
  if (when.getTime() < Date.now() + 30_000) throw badInput('Schedule a time at least 30 seconds in the future');
  if (when.getTime() > Date.now() + 366 * 24 * 3600 * 1000) throw badInput('Cannot schedule more than a year ahead');
  return when;
};

export const schedulePost = async (userId: string, content: string | null | undefined, media: IMedia[], scheduledFor: string): Promise<ScheduledDoc> => {
  const text = sanitizeInput(content ?? '');
  if (!text && !media.length) throw badInput('A scheduled post needs text or media');
  const moderation = moderateContent(text);
  if (!moderation.isSafe) throw badInput(`Content moderation failed: ${moderation.reason}`);
  return ScheduledPost.create({ author: userId, content: text, media, scheduledFor: parseFuture(scheduledFor) });
};

export const updateScheduledPost = async (userId: string, id: string, patch: { scheduledFor?: string | null; content?: string | null }): Promise<ScheduledDoc> => {
  const s = await ownedScheduled(userId, id);
  if (s.status !== 'pending') throw badInput('Only pending posts can be edited');
  if (patch.scheduledFor) s.scheduledFor = parseFuture(patch.scheduledFor);
  if (patch.content !== undefined && patch.content !== null) {
    const text = sanitizeInput(patch.content);
    const moderation = moderateContent(text);
    if (!moderation.isSafe) throw badInput(`Content moderation failed: ${moderation.reason}`);
    s.content = text;
  }
  return s.save();
};

export const deleteScheduledPost = async (userId: string, id: string): Promise<boolean> => {
  const s = await ownedScheduled(userId, id);
  await s.deleteOne();
  return true;
};

/** Claims the row atomically (so two API instances never double-publish), then creates the post. */
const publishClaimed = async (s: ScheduledDoc): Promise<HydratedDocument<IPost> | null> => {
  const claimed = await ScheduledPost.findOneAndUpdate({ _id: s._id, status: 'pending' }, { status: 'published', publishedAt: new Date() }, { new: true });
  if (!claimed) return null;
  try {
    const post = await createPost(claimed.author.toString(), { content: claimed.content, media: claimed.media });
    await ScheduledPost.updateOne({ _id: claimed._id }, { post: post._id });
    return post;
  } catch (err) {
    await ScheduledPost.updateOne({ _id: claimed._id }, { status: 'failed', errorMessage: (err as Error).message.slice(0, 300) });
    logger.warn(`scheduled post ${claimed.id} failed: ${(err as Error).message}`);
    return null;
  }
};

export const publishScheduledPostNow = async (userId: string, id: string): Promise<HydratedDocument<IPost>> => {
  const s = await ownedScheduled(userId, id);
  if (s.status !== 'pending') throw badInput('This post was already processed');
  const post = await publishClaimed(s);
  if (!post) throw badInput('Publishing failed; see the scheduled post for details');
  return post;
};

export const processDueScheduledPosts = async (): Promise<number> => {
  const due = await ScheduledPost.find({ status: 'pending', scheduledFor: { $lte: new Date() } })
    .sort({ scheduledFor: 1 })
    .limit(100);
  let published = 0;
  for (const s of due) if (await publishClaimed(s)) published++;
  return published;
};

export const listScheduled = (userId: string, includeProcessed = false): Promise<ScheduledDoc[]> =>
  ScheduledPost.find({ author: userId, ...(includeProcessed ? {} : { status: 'pending' }) }).sort({ scheduledFor: 1 });

export const contentCalendar = async (userId: string) => {
  const [posts, drafts] = await Promise.all([listScheduled(userId), listDrafts(userId)]);
  return { posts, drafts, totalScheduled: posts.length, totalDrafts: drafts.length };
};
