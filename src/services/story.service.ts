/**
 * Stories (24 h), views, reactions, replies and highlights. Expired stories are archived by
 * the cron job (see jobs/index.ts) so owners keep them and highlights stay intact.
 */
import { HydratedDocument, Types } from 'mongoose';
import Story, { IStory } from '../models/Story';
import StoryReply, { IStoryReply } from '../models/StoryReply';
import StoryHighlight, { IStoryHighlight } from '../models/StoryHighlight';
import User from '../models/User';
import AnalyticsEvent from '../models/AnalyticsEvent';
import { IMedia } from '../models/Post';
import { extractHashtags, extractMentions, sanitizeInput } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { toObjectId } from '../utils/pagination';
import { REACTION_EMOJIS } from '../models/Reaction';
import { followingIds } from './follow.service';
import { canViewUserContent } from './visibility.service';
import { notify } from './notification.service';
import { pubsub, TOPICS } from '../events/pubsub';

export type StoryDoc = HydratedDocument<IStory>;
export type HighlightDoc = HydratedDocument<IStoryHighlight>;
export type StoryReplyDoc = HydratedDocument<IStoryReply>;

const activeFilter = () => ({ expiresAt: { $gt: new Date() }, isArchived: false });

export const createStory = async (userId: string, media: IMedia[], rawContent?: string | null): Promise<StoryDoc> => {
  if (!media.length) throw badInput('A story needs media');
  const content = rawContent ? sanitizeInput(rawContent).slice(0, 500) : undefined;
  const names = content ? extractMentions(content) : [];
  const mentioned = names.length ? await User.find({ username: { $in: names } }).select('_id') : [];
  const story = await Story.create({
    author: userId,
    media,
    content,
    hashtags: content ? extractHashtags(content) : [],
    mentions: mentioned.map((m) => m._id)
  });
  void pubsub.publish(TOPICS.STORY_CREATED, { id: story.id, authorId: userId });
  return story;
};

export const getStory = async (viewerId: string | undefined, id: string): Promise<StoryDoc> => {
  const story = await Story.findById(toObjectId(id));
  if (!story) throw notFound('Story');
  const owner = viewerId === story.author.toString();
  if (!owner) {
    if (story.isArchived || story.expiresAt.getTime() <= Date.now()) {
      // archived stories are only public through highlights
      const inHighlight = await StoryHighlight.exists({ stories: story._id });
      if (!inHighlight) throw notFound('Story');
    }
    if (!(await canViewUserContent(viewerId, story.author.toString()))) throw notFound('Story');
  }
  return story;
};

export const myStories = (userId: string): Promise<StoryDoc[]> => Story.find({ author: userId, ...activeFilter() }).sort({ createdAt: -1 }).exec();

export const archivedStories = (userId: string): Promise<StoryDoc[]> => Story.find({ author: userId, isArchived: true }).sort({ createdAt: -1 }).limit(100).exec();

export const userStories = async (viewerId: string | undefined, userId: string): Promise<StoryDoc[]> => {
  if (!(await canViewUserContent(viewerId, userId))) return [];
  return Story.find({ author: userId, ...activeFilter() }).sort({ createdAt: 1 });
};

export interface StoryTrayItem {
  author: Types.ObjectId;
  stories: StoryDoc[];
  hasUnseen: boolean;
}

/** Instagram-style tray: one entry per author with active stories, unseen first. */
export const storyTray = async (viewerId: string): Promise<StoryTrayItem[]> => {
  const following = await followingIds(viewerId);
  const stories = await Story.find({ author: { $in: [...following, viewerId] }, ...activeFilter() }).sort({ createdAt: 1 });
  const groups = new Map<string, StoryDoc[]>();
  for (const s of stories) {
    const key = s.author.toString();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const tray = [...groups.entries()].map(([author, list]) => ({
    author: new Types.ObjectId(author),
    stories: list,
    hasUnseen: author !== viewerId && list.some((s) => !s.viewers.some((v) => v.toString() === viewerId))
  }));
  return tray.sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen) || b.stories[b.stories.length - 1].createdAt.getTime() - a.stories[a.stories.length - 1].createdAt.getTime());
};

export const viewStory = async (viewerId: string, id: string): Promise<StoryDoc> => {
  const story = await getStory(viewerId, id);
  if (story.author.toString() === viewerId) return story;
  const res = await Story.updateOne({ _id: story._id, viewers: { $ne: viewerId } }, { $addToSet: { viewers: viewerId }, $inc: { viewerCount: 1 } });
  if (res.modifiedCount === 1) {
    const viewer = await User.findById(viewerId).select('username');
    void notify({ recipient: story.author, sender: viewerId, type: 'story_view', message: `${viewer?.username ?? 'Someone'} viewed your story` });
    void AnalyticsEvent.create({ user: viewerId, eventType: 'story_viewed', targetUser: story.author });
    void pubsub.publish(TOPICS.STORY_VIEWED(story.id), { id: story.id });
  }
  return (await Story.findById(story._id)) as StoryDoc;
};

export const reactToStory = async (userId: string, storyId: string, emoji: string) => {
  if (!REACTION_EMOJIS.includes(emoji)) throw badInput('Unsupported emoji');
  const story = await getStory(userId, storyId);
  await Story.updateOne({ _id: story._id }, { $pull: { reactions: { userId } } });
  await Story.updateOne({ _id: story._id }, { $push: { reactions: { emoji, userId } } });
  const reactor = await User.findById(userId).select('username');
  void notify({ recipient: story.author, sender: userId, type: 'reaction', message: `${reactor?.username ?? 'Someone'} reacted ${emoji} to your story` });
  void pubsub.publish(TOPICS.STORY_REACTION(story.id), { id: story.id, userId, emoji });
  return { emoji, user: new Types.ObjectId(userId) };
};

export const replyToStory = async (userId: string, storyId: string, rawContent: string): Promise<StoryReplyDoc> => {
  const story = await getStory(userId, storyId);
  const content = sanitizeInput(rawContent).slice(0, 500);
  if (!content) throw badInput('Reply cannot be empty');
  const reply = await StoryReply.create({ story: story._id, author: userId, content });
  const sender = await User.findById(userId).select('username');
  void notify({ recipient: story.author, sender: userId, type: 'story_reply', message: `${sender?.username ?? 'Someone'} replied to your story` });
  return reply;
};

export const storyReplies = (story: IStory & { _id: Types.ObjectId }) => StoryReply.find({ story: story._id }).sort({ createdAt: -1 }).limit(100).exec();

export const deleteStory = async (userId: string, id: string): Promise<boolean> => {
  const story = await Story.findById(toObjectId(id));
  if (!story) throw notFound('Story');
  if (story.author.toString() !== userId) throw forbidden();
  await Promise.all([StoryReply.deleteMany({ story: story._id }), StoryHighlight.updateMany({ stories: story._id }, { $pull: { stories: story._id } }), story.deleteOne()]);
  return true;
};

// ---------- highlights ----------

const ownedStories = async (userId: string, ids: string[]): Promise<Types.ObjectId[]> => {
  const oids = ids.map(toObjectId);
  const count = await Story.countDocuments({ _id: { $in: oids }, author: userId });
  if (count !== oids.length) throw forbidden('You can only highlight your own stories');
  return oids;
};

export const createHighlight = async (userId: string, title: string, coverUrl: string, storyIds: string[]): Promise<HighlightDoc> => {
  const clean = sanitizeInput(title).slice(0, 50);
  if (!clean) throw badInput('Highlight needs a title');
  const stories = await ownedStories(userId, storyIds);
  return StoryHighlight.create({ author: userId, title: clean, coverUrl, stories });
};

const ownedHighlight = async (userId: string, id: string): Promise<HighlightDoc> => {
  const h = await StoryHighlight.findById(toObjectId(id));
  if (!h) throw notFound('Highlight');
  if (h.author.toString() !== userId) throw forbidden();
  return h;
};

export const deleteHighlight = async (userId: string, id: string): Promise<boolean> => {
  const h = await ownedHighlight(userId, id);
  await h.deleteOne();
  return true;
};

export const addToHighlight = async (userId: string, highlightId: string, storyId: string): Promise<HighlightDoc> => {
  const h = await ownedHighlight(userId, highlightId);
  const [oid] = await ownedStories(userId, [storyId]);
  if (!h.stories.some((s) => s.equals(oid))) h.stories.push(oid);
  return h.save();
};

export const removeFromHighlight = async (userId: string, highlightId: string, storyId: string): Promise<HighlightDoc> => {
  const h = await ownedHighlight(userId, highlightId);
  h.stories = h.stories.filter((s) => s.toString() !== storyId);
  return h.save();
};

export const userHighlights = async (viewerId: string | undefined, userId: string): Promise<HighlightDoc[]> =>
  (await canViewUserContent(viewerId, userId)) ? StoryHighlight.find({ author: userId }).sort({ createdAt: -1 }) : [];

export const archiveExpiredStories = async (): Promise<number> => {
  const res = await Story.updateMany({ expiresAt: { $lte: new Date() }, isArchived: false }, { isArchived: true });
  return res.modifiedCount;
};
