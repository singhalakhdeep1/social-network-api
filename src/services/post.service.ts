/**
 * Posts: lifecycle, likes, reactions, shares, hashtags and trending. All reads go through
 * the visibility filter so private accounts / groups are enforced in one place.
 */
import { HydratedDocument, Types } from 'mongoose';
import Post, { IMedia, IPost } from '../models/Post';
import User from '../models/User';
import Comment from '../models/Comment';
import Like from '../models/Like';
import Reaction, { REACTION_EMOJIS } from '../models/Reaction';
import Notification from '../models/Notification';
import Poll from '../models/Poll';
import Group from '../models/Group';
import Page from '../models/Page';
import Follow from '../models/Follow';
import AnalyticsEvent from '../models/AnalyticsEvent';
import { extractHashtags, extractMentions, moderateContent, sanitizeInput } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { Page as PageResult, paginate, toObjectId } from '../utils/pagination';
import { notify } from './notification.service';
import { visibilityFilter } from './visibility.service';
import { indexPost, removePostFromIndex } from './search.service';
import { graph } from './graph/graph.service';
import { cache } from './cache/cache.service';
import { emitDomainEvent, pubsub, TOPICS } from '../events/pubsub';

export type PostDoc = HydratedDocument<IPost>;

export interface CreatePostInput {
  content?: string | null;
  media?: IMedia[];
  groupId?: string | null;
  pageId?: string | null;
  sharedFrom?: string | null;
  /** Skip moderation / analytics side effects when republishing a scheduled post that already passed them. */
  silent?: boolean;
}

const MAX_PINNED = 3;

/** Returns the post if the viewer may see it, otherwise throws NOT_FOUND (never leaks existence). */
export const getVisiblePost = async (viewerId: string | undefined, id: string, opts: { allowArchivedOwner?: boolean } = {}): Promise<PostDoc> => {
  const post = await Post.findById(toObjectId(id));
  if (!post) throw notFound('Post');
  const isOwner = !!viewerId && post.author.toString() === viewerId;
  if (isOwner) return post;
  if (post.isArchived && !opts.allowArchivedOwner) throw notFound('Post');
  const visible = await Post.exists({ _id: post._id, ...(await visibilityFilter(viewerId)) });
  if (!visible) throw notFound('Post');
  return post;
};

export const createPost = async (authorId: string, input: CreatePostInput): Promise<PostDoc> => {
  const content = sanitizeInput(input.content ?? '');
  if (!content && !input.media?.length && !input.sharedFrom) throw badInput('A post needs text or media');
  if (content) {
    const moderation = moderateContent(content);
    if (!moderation.isSafe) throw badInput(`Content moderation failed: ${moderation.reason}`);
  }

  let group: Types.ObjectId | undefined;
  let page: Types.ObjectId | undefined;
  if (input.groupId) {
    const g = await Group.findById(input.groupId);
    if (!g) throw notFound('Group');
    if (!g.members.some((m) => m.toString() === authorId)) throw forbidden('Join the group to post in it');
    group = g._id;
  }
  if (input.pageId) {
    const p = await Page.findById(input.pageId);
    if (!p) throw notFound('Page');
    if (p.owner.toString() !== authorId && !p.admins.some((a) => a.toString() === authorId)) throw forbidden('Only page admins can post as the page');
    page = p._id;
  }

  const hashtags = extractHashtags(content);
  const mentionNames = extractMentions(content);
  const mentionedUsers = mentionNames.length ? await User.find({ username: { $in: mentionNames } }).select('_id username') : [];

  const post = await Post.create({
    content,
    author: authorId,
    media: input.media ?? [],
    hashtags,
    mentions: mentionedUsers.map((u) => u._id),
    sharedFrom: input.sharedFrom ?? undefined,
    group,
    page
  });

  await Promise.all([
    User.updateOne({ _id: authorId }, { $inc: { postCount: 1 } }),
    group ? Group.updateOne({ _id: group }, { $inc: { postCount: 1 } }) : null,
    page ? Page.updateOne({ _id: page }, { $inc: { postCount: 1 } }) : null,
    cache.delete(`feed:${authorId}`)
  ]);

  const author = await User.findById(authorId).select('username');
  indexPost(post, author?.username);
  void graph.upsertPost({ id: post.id, authorId, createdAt: post.createdAt });
  void pubsub.publish(TOPICS.POST_CREATED, { id: post.id, authorId });
  emitDomainEvent('webhook', { userId: authorId, event: 'post.created', data: { id: post.id, content: post.content } });
  if (!input.silent) void AnalyticsEvent.create({ user: authorId, eventType: 'post_created', post: post._id });

  for (const mentioned of mentionedUsers) {
    void notify({ recipient: mentioned._id, sender: authorId, type: 'mention', post: post._id, message: `${author?.username ?? 'Someone'} mentioned you in a post` });
  }
  void fanOutFeedUpdate(authorId, post.id);
  return post;
};

/** Pushes a lightweight "feed updated" event to (up to) the author's 1000 most recent followers. */
const fanOutFeedUpdate = async (authorId: string, postId: string): Promise<void> => {
  const edges = await Follow.find({ following: authorId }).sort({ _id: -1 }).limit(1000).select('follower').lean();
  await Promise.all(edges.map((e) => pubsub.publish(TOPICS.FEED_UPDATED(String(e.follower)), { id: postId })));
};

export const updatePost = async (userId: string, id: string, rawContent: string): Promise<PostDoc> => {
  const post = await Post.findById(toObjectId(id));
  if (!post) throw notFound('Post');
  if (post.author.toString() !== userId) throw forbidden();
  const content = sanitizeInput(rawContent);
  if (!content && !post.media.length && !post.sharedFrom) throw badInput('Post cannot be empty');
  const moderation = moderateContent(content);
  if (!moderation.isSafe) throw badInput(`Content moderation failed: ${moderation.reason}`);
  post.content = content;
  post.hashtags = extractHashtags(content);
  const names = extractMentions(content);
  post.mentions = names.length ? (await User.find({ username: { $in: names } }).select('_id')).map((u) => u._id) : [];
  await post.save();
  const author = await User.findById(userId).select('username');
  indexPost(post, author?.username);
  return post;
};

export const deletePost = async (actor: { id: string; role: string }, id: string): Promise<boolean> => {
  const post = await Post.findById(toObjectId(id));
  if (!post) throw notFound('Post');
  if (post.author.toString() !== actor.id && actor.role !== 'admin') throw forbidden();
  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Like.deleteMany({ targetType: 'post', target: post._id }),
    Reaction.deleteMany({ post: post._id }),
    Notification.deleteMany({ post: post._id }),
    Poll.deleteMany({ post: post._id }),
    User.updateOne({ _id: post.author }, { $inc: { postCount: -1 } }),
    post.group ? Group.updateOne({ _id: post.group }, { $inc: { postCount: -1 } }) : null,
    post.page ? Page.updateOne({ _id: post.page }, { $inc: { postCount: -1 } }) : null,
    post.sharedFrom ? Post.updateOne({ _id: post.sharedFrom }, { $inc: { sharesCount: -1 } }) : null
  ]);
  await post.deleteOne();
  removePostFromIndex(post.id);
  void graph.removePost(post.id);
  return true;
};

// ---------- reads ----------

export const explorePosts = async (viewerId: string | undefined, opts: { cursor?: string | null; limit?: number | null }): Promise<PageResult<PostDoc>> =>
  paginate<PostDoc, IPost>(Post, await visibilityFilter(viewerId), opts);

export const userPosts = async (viewerId: string | undefined, authorId: string, opts: { cursor?: string | null; limit?: number | null }): Promise<PageResult<PostDoc>> => {
  const isOwner = viewerId === authorId;
  // $and keeps the visibility `author: {$nin: [...]}` clause alongside the equality, so a private author yields nothing.
  const filter = isOwner
    ? { author: toObjectId(authorId), moderationStatus: { $ne: 'rejected' }, isArchived: false }
    : { $and: [await visibilityFilter(viewerId), { author: toObjectId(authorId) }] };
  const page = await paginate<PostDoc, IPost>(Post, filter, opts);
  if (!opts.cursor) page.nodes.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.getTime() - a.createdAt.getTime());
  return page;
};

export const archivedPosts = (userId: string, opts: { cursor?: string | null; limit?: number | null }) =>
  paginate<PostDoc, IPost>(Post, { author: toObjectId(userId), isArchived: true }, opts);

export const groupPosts = async (viewerId: string | undefined, groupId: string, opts: { cursor?: string | null; limit?: number | null }): Promise<PageResult<PostDoc>> => {
  const group = await Group.findById(groupId);
  if (!group) throw notFound('Group');
  if (group.isPrivate && !(viewerId && group.members.some((m) => m.toString() === viewerId))) throw forbidden('This group is private');
  return paginate<PostDoc, IPost>(Post, { group: group._id, isArchived: false, moderationStatus: 'approved' }, opts);
};

export const pagePosts = (pageId: string, opts: { cursor?: string | null; limit?: number | null }) =>
  paginate<PostDoc, IPost>(Post, { page: toObjectId(pageId), isArchived: false, moderationStatus: 'approved' }, opts);

export const postsByHashtag = async (viewerId: string | undefined, hashtag: string, opts: { cursor?: string | null; limit?: number | null }) =>
  paginate<PostDoc, IPost>(Post, { ...(await visibilityFilter(viewerId)), hashtags: hashtag.replace(/^#/, '').toLowerCase() }, opts);

export const trendingHashtags = async (limit = 10): Promise<{ tag: string; count: number }[]> =>
  cache.getOrSetJSON(
    `trending:hashtags:${limit}`,
    async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const rows = await Post.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since }, isArchived: false, hashtags: { $exists: true, $ne: [] } } },
        { $unwind: '$hashtags' },
        { $group: { _id: '$hashtags', count: { $sum: 1 }, engagement: { $sum: { $add: ['$likeCount', { $multiply: ['$commentCount', 2] }] } } } },
        { $addFields: { score: { $add: ['$count', { $multiply: ['$engagement', 0.2] }] } } },
        { $sort: { score: -1, _id: 1 } },
        { $limit: Math.min(limit, 50) }
      ]);
      return rows.map((r) => ({ tag: r._id, count: r.count }));
    },
    60
  );

export const trendingPosts = async (viewerId: string | undefined, limit = 10): Promise<PostDoc[]> => {
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const candidates = await Post.find({ ...(await visibilityFilter(viewerId)), createdAt: { $gte: since } })
    .sort({ likeCount: -1, commentCount: -1 })
    .limit(100);
  const score = (p: PostDoc) => {
    const ageH = (Date.now() - p.createdAt.getTime()) / 3.6e6;
    return (p.likeCount + p.commentCount * 2 + p.sharesCount * 3 + p.reactionCount) / Math.pow(ageH + 2, 1.5);
  };
  return candidates.sort((a, b) => score(b) - score(a)).slice(0, Math.min(limit, 50));
};

// ---------- likes ----------

export const likePost = async (userId: string, postId: string): Promise<PostDoc> => {
  const post = await getVisiblePost(userId, postId);
  let created = false;
  try {
    const res = await Like.findOneAndUpdate({ user: userId, targetType: 'post', target: post._id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true, includeResultMetadata: true });
    created = !res.lastErrorObject?.updatedExisting;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  if (created) {
    await Post.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
    const liker = await User.findById(userId).select('username');
    void notify({ recipient: post.author, sender: userId, type: 'like', post: post._id, message: `${liker?.username ?? 'Someone'} liked your post` });
    void pubsub.publish(TOPICS.POST_LIKED(post.id), { id: post.id });
    void graph.like(userId, post.id);
    emitDomainEvent('webhook', { userId: post.author.toString(), event: 'post.liked', data: { postId: post.id, userId } });
    void AnalyticsEvent.create({ user: userId, eventType: 'post_liked', post: post._id, targetUser: post.author });
  }
  return (await Post.findById(post._id)) as PostDoc;
};

export const unlikePost = async (userId: string, postId: string): Promise<PostDoc> => {
  const post = await getVisiblePost(userId, postId);
  const res = await Like.deleteOne({ user: userId, targetType: 'post', target: post._id });
  if (res.deletedCount === 1) {
    await Post.updateOne({ _id: post._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
    void graph.unlike(userId, post.id);
  }
  return (await Post.findById(post._id)) as PostDoc;
};

export const postLikers = async (postId: string, limit = 20): Promise<HydratedDocument<import('../models/User').IUser>[]> => {
  const likes = await Like.find({ targetType: 'post', target: toObjectId(postId) }).sort({ _id: -1 }).limit(Math.min(limit, 100));
  return User.find({ _id: { $in: likes.map((l) => l.user) } });
};

// ---------- reactions ----------

export const addReaction = async (userId: string, postId: string, emoji: string, commentId?: string | null) => {
  if (!REACTION_EMOJIS.includes(emoji)) throw badInput(`Unsupported emoji. Allowed: ${REACTION_EMOJIS.join(' ')}`);
  const post = await getVisiblePost(userId, postId);
  let commentOid: Types.ObjectId | null = null;
  if (commentId) {
    const comment = await Comment.findOne({ _id: toObjectId(commentId), post: post._id });
    if (!comment) throw notFound('Comment');
    commentOid = comment._id;
  }
  const res = await Reaction.findOneAndUpdate(
    { user: userId, post: post._id, comment: commentOid },
    { $set: { emoji } },
    { upsert: true, new: true, includeResultMetadata: true, setDefaultsOnInsert: true }
  );
  const reaction = res.value!;
  const wasNew = !res.lastErrorObject?.updatedExisting;
  if (wasNew && !commentOid) {
    await Post.updateOne({ _id: post._id }, { $inc: { reactionCount: 1 } });
    const reactor = await User.findById(userId).select('username');
    void notify({ recipient: post.author, sender: userId, type: 'reaction', post: post._id, message: `${reactor?.username ?? 'Someone'} reacted ${emoji} to your post` });
  }
  void pubsub.publish(TOPICS.REACTION_ADDED(post.id), { id: reaction.id });
  return reaction;
};

export const removeReaction = async (userId: string, postId: string, commentId?: string | null): Promise<boolean> => {
  const res = await Reaction.deleteOne({ user: userId, post: toObjectId(postId), comment: commentId ? toObjectId(commentId) : null });
  if (res.deletedCount === 1 && !commentId) await Post.updateOne({ _id: toObjectId(postId), reactionCount: { $gt: 0 } }, { $inc: { reactionCount: -1 } });
  return true;
};

// ---------- share / pin / archive ----------

export const sharePost = async (userId: string, postId: string, comment?: string | null): Promise<PostDoc> => {
  const original = await getVisiblePost(userId, postId);
  const originalAuthor = await User.findById(original.author).select('isPrivate username');
  if (originalAuthor?.isPrivate && original.author.toString() !== userId) throw forbidden('Posts from private accounts cannot be shared');
  const target = original.sharedFrom ? await Post.findById(original.sharedFrom) : original; // share the root, not a chain of reposts
  if (!target) throw notFound('Post');
  const repost = await createPost(userId, { content: comment ?? '', sharedFrom: target.id, silent: true });
  await Post.updateOne({ _id: target._id }, { $inc: { sharesCount: 1 } });
  const sharer = await User.findById(userId).select('username');
  void notify({ recipient: target.author, sender: userId, type: 'share', post: target._id, message: `${sharer?.username ?? 'Someone'} shared your post` });
  void AnalyticsEvent.create({ user: userId, eventType: 'post_shared', post: target._id, targetUser: target.author });
  return repost;
};

const ownedPost = async (userId: string, id: string): Promise<PostDoc> => {
  const post = await Post.findById(toObjectId(id));
  if (!post) throw notFound('Post');
  if (post.author.toString() !== userId) throw forbidden();
  return post;
};

export const setPinned = async (userId: string, id: string, pinned: boolean): Promise<PostDoc> => {
  const post = await ownedPost(userId, id);
  if (pinned && !post.isPinned) {
    const count = await Post.countDocuments({ author: userId, isPinned: true });
    if (count >= MAX_PINNED) throw badInput(`You can pin at most ${MAX_PINNED} posts`);
  }
  post.isPinned = pinned;
  return post.save();
};

export const setArchived = async (userId: string, id: string, archived: boolean): Promise<PostDoc> => {
  const post = await ownedPost(userId, id);
  post.isArchived = archived;
  if (archived) post.isPinned = false;
  await post.save();
  if (archived) removePostFromIndex(post.id);
  else {
    const author = await User.findById(userId).select('username');
    indexPost(post, author?.username);
  }
  return post;
};
