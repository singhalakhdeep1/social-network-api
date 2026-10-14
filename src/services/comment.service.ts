/**
 * Threaded comments with likes, mention / reply notifications and subtree deletion.
 */
import { HydratedDocument, Types } from 'mongoose';
import Comment, { IComment } from '../models/Comment';
import Post from '../models/Post';
import User from '../models/User';
import Like from '../models/Like';
import Reaction from '../models/Reaction';
import Notification from '../models/Notification';
import AnalyticsEvent from '../models/AnalyticsEvent';
import { extractMentions, moderateContent, sanitizeInput } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { Page, paginate, toObjectId } from '../utils/pagination';
import { getVisiblePost } from './post.service';
import { notify } from './notification.service';
import { emitDomainEvent, pubsub, TOPICS } from '../events/pubsub';

export type CommentDoc = HydratedDocument<IComment>;

export const addComment = async (userId: string, postId: string, rawContent: string, parentId?: string | null): Promise<CommentDoc> => {
  const post = await getVisiblePost(userId, postId);
  const content = sanitizeInput(rawContent);
  if (!content) throw badInput('Comment cannot be empty');
  const moderation = moderateContent(content);
  if (!moderation.isSafe) throw badInput(`Content moderation failed: ${moderation.reason}`);

  let parent: CommentDoc | null = null;
  if (parentId) {
    parent = await Comment.findOne({ _id: toObjectId(parentId), post: post._id });
    if (!parent) throw notFound('Parent comment');
  }

  const names = extractMentions(content);
  const mentioned = names.length ? await User.find({ username: { $in: names } }).select('_id') : [];

  const comment = await Comment.create({ content, author: userId, post: post._id, parent: parent?._id ?? null, mentions: mentioned.map((m) => m._id) });
  await Promise.all([Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } }), parent ? Comment.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } }) : null]);

  const author = await User.findById(userId).select('username');
  const name = author?.username ?? 'Someone';
  if (parent) void notify({ recipient: parent.author, sender: userId, type: 'reply', post: post._id, comment: comment._id, message: `${name} replied to your comment` });
  if (!parent || parent.author.toString() !== post.author.toString()) {
    void notify({ recipient: post.author, sender: userId, type: 'comment', post: post._id, comment: comment._id, message: `${name} commented on your post` });
  }
  for (const m of mentioned) void notify({ recipient: m._id, sender: userId, type: 'mention', post: post._id, comment: comment._id, message: `${name} mentioned you in a comment` });

  void pubsub.publish(TOPICS.COMMENT_ADDED(post.id), { id: comment.id });
  emitDomainEvent('webhook', { userId: post.author.toString(), event: 'post.commented', data: { postId: post.id, commentId: comment.id, userId } });
  void AnalyticsEvent.create({ user: userId, eventType: 'post_commented', post: post._id, targetUser: post.author });
  return comment;
};

export const listComments = async (viewerId: string | undefined, postId: string, opts: { cursor?: string | null; limit?: number | null }): Promise<Page<CommentDoc>> => {
  const post = await getVisiblePost(viewerId, postId);
  return paginate<CommentDoc, IComment>(Comment, { post: post._id, parent: null }, opts);
};

export const listReplies = (commentId: string, opts: { cursor?: string | null; limit?: number | null }): Promise<Page<CommentDoc>> =>
  paginate<CommentDoc, IComment>(Comment, { parent: toObjectId(commentId) }, { ...opts, direction: 'asc' });

export const deleteComment = async (actor: { id: string; role: string }, id: string): Promise<boolean> => {
  const comment = await Comment.findById(toObjectId(id));
  if (!comment) throw notFound('Comment');
  const post = await Post.findById(comment.post);
  const allowed = comment.author.toString() === actor.id || post?.author.toString() === actor.id || actor.role === 'admin';
  if (!allowed) throw forbidden();

  // collect the whole subtree
  const ids: Types.ObjectId[] = [comment._id];
  let frontier: Types.ObjectId[] = [comment._id];
  while (frontier.length) {
    const children = await Comment.find({ parent: { $in: frontier } }).select('_id');
    frontier = children.map((c) => c._id);
    ids.push(...frontier);
  }
  await Promise.all([
    Comment.deleteMany({ _id: { $in: ids } }),
    Like.deleteMany({ targetType: 'comment', target: { $in: ids } }),
    Reaction.deleteMany({ comment: { $in: ids } }),
    Notification.deleteMany({ comment: { $in: ids } }),
    post ? Post.updateOne({ _id: post._id }, { $inc: { commentCount: -ids.length } }) : null,
    comment.parent ? Comment.updateOne({ _id: comment.parent, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } }) : null
  ]);
  return true;
};

export const likeComment = async (userId: string, commentId: string): Promise<CommentDoc> => {
  const comment = await Comment.findById(toObjectId(commentId));
  if (!comment) throw notFound('Comment');
  await getVisiblePost(userId, comment.post.toString());
  let created = false;
  try {
    const res = await Like.findOneAndUpdate({ user: userId, targetType: 'comment', target: comment._id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true, includeResultMetadata: true });
    created = !res.lastErrorObject?.updatedExisting;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  if (created) {
    await Comment.updateOne({ _id: comment._id }, { $inc: { likeCount: 1 } });
    const liker = await User.findById(userId).select('username');
    void notify({ recipient: comment.author, sender: userId, type: 'like', post: comment.post, comment: comment._id, message: `${liker?.username ?? 'Someone'} liked your comment` });
  }
  return (await Comment.findById(comment._id)) as CommentDoc;
};

export const unlikeComment = async (userId: string, commentId: string): Promise<CommentDoc> => {
  const comment = await Comment.findById(toObjectId(commentId));
  if (!comment) throw notFound('Comment');
  const res = await Like.deleteOne({ user: userId, targetType: 'comment', target: comment._id });
  if (res.deletedCount === 1) await Comment.updateOne({ _id: comment._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  return (await Comment.findById(comment._id)) as CommentDoc;
};
