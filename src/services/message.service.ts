/**
 * Direct & group messaging: conversations, encrypted-at-rest messages, read receipts,
 * reactions, typing indicators (ephemeral, cached) and per-user archive / mute.
 */
import { HydratedDocument, Types } from 'mongoose';
import Conversation, { IConversation } from '../models/Conversation';
import Message, { IMessage } from '../models/Message';
import User from '../models/User';
import { IMedia } from '../models/Post';
import { sanitizeInput } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { decryptText, encryptText } from '../utils/crypto';
import { Page, clampLimit, decodeCursor, encodeCursor, toObjectId } from '../utils/pagination';
import { cache } from './cache/cache.service';
import { notify } from './notification.service';
import { emitDomainEvent, pubsub, TOPICS } from '../events/pubsub';

export type ConversationDoc = HydratedDocument<IConversation>;
export type MessageDoc = HydratedDocument<IMessage>;

const TYPING_TTL = 6;

const isMember = (c: IConversation, userId: string): boolean => c.participants.some((p) => p.toString() === userId);
const isAdmin = (c: IConversation, userId: string): boolean => c.admins.some((a) => a.toString() === userId);

export const getConversation = async (userId: string, id: string): Promise<ConversationDoc> => {
  const conversation = await Conversation.findById(toObjectId(id));
  if (!conversation) throw notFound('Conversation');
  if (!isMember(conversation, userId)) throw forbidden('You are not part of this conversation');
  return conversation;
};

export const createConversation = async (userId: string, participantIds: string[], opts: { isGroup?: boolean | null; groupName?: string | null; groupDescription?: string | null } = {}): Promise<ConversationDoc> => {
  const others = [...new Set(participantIds.filter((id) => id !== userId))];
  if (others.length === 0) throw badInput('Pick at least one other participant');
  const found = await User.countDocuments({ _id: { $in: others.map(toObjectId) } });
  if (found !== others.length) throw notFound('One or more participants');

  const isGroup = !!opts.isGroup || others.length > 1;
  const everyone = [userId, ...others];
  if (!isGroup) {
    const key = [...everyone].sort().join(':');
    const existing = await Conversation.findOne({ participantsKey: key });
    if (existing) return existing;
    try {
      return await Conversation.create({ participants: everyone, participantsKey: key, isGroup: false, createdBy: userId });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return (await Conversation.findOne({ participantsKey: key }))!;
      throw err;
    }
  }
  if (!opts.groupName?.trim()) throw badInput('Group conversations need a name');
  const conversation = await Conversation.create({
    participants: everyone,
    isGroup: true,
    groupName: sanitizeInput(opts.groupName).slice(0, 100),
    groupDescription: opts.groupDescription ? sanitizeInput(opts.groupDescription).slice(0, 500) : undefined,
    createdBy: userId,
    admins: [userId]
  });
  await publishConversationUpdate(conversation);
  return conversation;
};

const publishConversationUpdate = async (c: ConversationDoc): Promise<void> => {
  await Promise.all(c.participants.map((p) => pubsub.publish(TOPICS.CONVERSATION_UPDATED(p.toString()), { id: c.id })));
};

export const listConversations = (userId: string, opts: { archived?: boolean | null; limit?: number | null } = {}): Promise<ConversationDoc[]> =>
  Conversation.find({ participants: userId, archivedBy: opts.archived ? userId : { $ne: userId } })
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(clampLimit(opts.limit, 30, 100)).exec();

export const sendMessage = async (userId: string, conversationId: string, input: { content?: string | null; media?: IMedia[]; replyTo?: string | null }): Promise<MessageDoc> => {
  const conversation = await getConversation(userId, conversationId);
  const text = sanitizeInput(input.content ?? '');
  if (!text && !input.media?.length) throw badInput('Message cannot be empty');
  if (text.length > 4000) throw badInput('Message is too long (4000 characters max)');

  if (input.replyTo) {
    const parent = await Message.findOne({ _id: toObjectId(input.replyTo), conversation: conversation._id });
    if (!parent) throw notFound('Message to reply to');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: userId,
    content: conversation.encrypted && text ? encryptText(text) : text,
    isEncrypted: conversation.encrypted && !!text,
    media: input.media ?? [],
    replyTo: input.replyTo ?? undefined,
    readBy: [userId]
  });

  const others = conversation.participants.filter((p) => p.toString() !== userId);
  const inc: Record<string, number> = {};
  for (const o of others) inc[`unreadCount.${o.toString()}`] = 1;
  const wasUnread = new Set(others.filter((o) => (conversation.unreadCount?.get(o.toString()) ?? 0) > 0).map(String));
  const update: Record<string, unknown> = { lastMessage: message._id, lastMessageAt: message.createdAt };
  if (others.length) {
    update.$inc = inc;
    update.$pull = { archivedBy: { $in: others } }; // a new message resurfaces an archived chat for recipients
  }
  const updated = await Conversation.findByIdAndUpdate(conversation._id, update, { new: true });

  await cache.delete(`typing:${conversation.id}:${userId}`);
  void pubsub.publish(TOPICS.MESSAGE_SENT(conversation.id), { id: message.id });
  if (updated) void publishConversationUpdate(updated);

  const sender = await User.findById(userId).select('username');
  const now = Date.now();
  for (const o of others) {
    const muted = conversation.mutedBy.find((m) => m.user.toString() === o.toString());
    emitDomainEvent('webhook', { userId: o.toString(), event: 'message.received', data: { conversationId: conversation.id, messageId: message.id, senderId: userId } });
    if (muted && (!muted.until || muted.until.getTime() > now)) continue;
    if (!wasUnread.has(String(o))) {
      void notify({ recipient: o, sender: userId, type: 'message', message: `${sender?.username ?? 'Someone'} sent you a message` });
    }
  }
  return message;
};

/** Plain-text view of a message for clients (decrypts, blanks deleted messages). */
export const messageText = (m: IMessage): string => (m.isDeleted ? '' : m.isEncrypted ? decryptText(m.content) : m.content);

export const listMessages = async (userId: string, conversationId: string, opts: { cursor?: string | null; limit?: number | null }): Promise<Page<MessageDoc>> => {
  const conversation = await getConversation(userId, conversationId);
  const limit = clampLimit(opts.limit, 50, 100);
  const after = decodeCursor(opts.cursor);
  const docs = await Message.find({ conversation: conversation._id, ...(after ? { _id: { $lt: new Types.ObjectId(after) } } : {}) })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const hasMore = docs.length > limit;
  const nodes = hasMore ? docs.slice(0, limit) : docs;
  return { nodes, hasMore, nextCursor: hasMore ? encodeCursor(nodes[nodes.length - 1]._id) : null };
};

export const getMessage = async (userId: string, messageId: string): Promise<MessageDoc> => {
  const message = await Message.findById(toObjectId(messageId));
  if (!message) throw notFound('Message');
  await getConversation(userId, message.conversation.toString());
  return message;
};

/** Newest-first scan: messages are encrypted at rest, so matching happens after decryption. */
export const searchMessages = async (userId: string, query: string, conversationId?: string | null): Promise<MessageDoc[]> => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const convoIds = conversationId ? [(await getConversation(userId, conversationId))._id] : await Conversation.find({ participants: userId }).distinct('_id');
  const recent = await Message.find({ conversation: { $in: convoIds }, isDeleted: false }).sort({ _id: -1 }).limit(1000);
  return recent.filter((m) => messageText(m).toLowerCase().includes(needle)).slice(0, 50);
};

export const markRead = async (userId: string, conversationId: string): Promise<boolean> => {
  const conversation = await getConversation(userId, conversationId);
  await Message.updateMany({ conversation: conversation._id, sender: { $ne: userId }, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } });
  const updated = await Conversation.findByIdAndUpdate(conversation._id, { $set: { [`unreadCount.${userId}`]: 0 } }, { new: true });
  if (updated) await pubsub.publish(TOPICS.CONVERSATION_UPDATED(userId), { id: updated.id });
  return true;
};

export const deleteMessage = async (userId: string, messageId: string): Promise<boolean> => {
  const message = await getMessage(userId, messageId);
  if (message.sender.toString() !== userId) throw forbidden('You can only delete your own messages');
  message.isDeleted = true;
  message.content = '';
  message.media = [];
  message.isEncrypted = false;
  await message.save();
  void pubsub.publish(TOPICS.MESSAGE_SENT(message.conversation.toString()), { id: message.id });
  return true;
};

/** Reacting with the same emoji twice removes it; a different emoji replaces the previous one. */
export const reactToMessage = async (userId: string, messageId: string, emoji: string): Promise<MessageDoc> => {
  if (!emoji || emoji.length > 8) throw badInput('Invalid emoji');
  const message = await getMessage(userId, messageId);
  const existing = message.reactions.find((r) => r.user.toString() === userId);
  message.reactions = message.reactions.filter((r) => r.user.toString() !== userId);
  if (!existing || existing.emoji !== emoji) message.reactions.push({ emoji, user: new Types.ObjectId(userId) });
  await message.save();
  void pubsub.publish(TOPICS.MESSAGE_SENT(message.conversation.toString()), { id: message.id });
  return message;
};

export const setTyping = async (userId: string, conversationId: string, isTyping: boolean): Promise<boolean> => {
  const conversation = await getConversation(userId, conversationId);
  const key = `typing:${conversation.id}:${userId}`;
  if (isTyping) await cache.set(key, '1', TYPING_TTL);
  else await cache.delete(key);
  void pubsub.publish(TOPICS.TYPING(conversation.id), { userId, conversationId: conversation.id, isTyping });
  return true;
};

export const typingUsers = async (conversation: { id: string; participants: Types.ObjectId[] }): Promise<string[]> => {
  const flags = await Promise.all(conversation.participants.map(async (p) => ((await cache.get(`typing:${conversation.id}:${p}`)) ? p.toString() : null)));
  return flags.filter((f): f is string => !!f);
};

export const setArchived = async (userId: string, conversationId: string, archived: boolean): Promise<boolean> => {
  const conversation = await getConversation(userId, conversationId);
  await Conversation.updateOne({ _id: conversation._id }, archived ? { $addToSet: { archivedBy: userId } } : { $pull: { archivedBy: userId } });
  return true;
};

export const muteConversation = async (userId: string, conversationId: string, until?: string | null): Promise<boolean> => {
  const conversation = await getConversation(userId, conversationId);
  const untilDate = until ? new Date(until) : undefined;
  if (untilDate && Number.isNaN(untilDate.getTime())) throw badInput('Invalid mute date');
  await Conversation.updateOne({ _id: conversation._id }, { $pull: { mutedBy: { user: userId } } });
  await Conversation.updateOne({ _id: conversation._id }, { $push: { mutedBy: { user: userId, until: untilDate } } });
  return true;
};

export const unmuteConversation = async (userId: string, conversationId: string): Promise<boolean> => {
  const conversation = await getConversation(userId, conversationId);
  await Conversation.updateOne({ _id: conversation._id }, { $pull: { mutedBy: { user: userId } } });
  return true;
};

// ---------- group management ----------

const groupOnly = (c: IConversation) => {
  if (!c.isGroup) throw badInput('This is not a group conversation');
};

export const updateGroupInfo = async (userId: string, conversationId: string, patch: { groupName?: string | null; groupDescription?: string | null; groupAvatar?: string | null }): Promise<ConversationDoc> => {
  const c = await getConversation(userId, conversationId);
  groupOnly(c);
  if (!isAdmin(c, userId)) throw forbidden('Only group admins can edit the group');
  if (patch.groupName) c.groupName = sanitizeInput(patch.groupName).slice(0, 100);
  if (patch.groupDescription !== undefined && patch.groupDescription !== null) c.groupDescription = sanitizeInput(patch.groupDescription).slice(0, 500);
  if (patch.groupAvatar) c.groupAvatar = patch.groupAvatar;
  await c.save();
  await publishConversationUpdate(c);
  return c;
};

export const addMember = async (userId: string, conversationId: string, memberId: string): Promise<ConversationDoc> => {
  const c = await getConversation(userId, conversationId);
  groupOnly(c);
  if (!isAdmin(c, userId)) throw forbidden('Only group admins can add members');
  if (!(await User.exists({ _id: toObjectId(memberId) }))) throw notFound('User');
  if (!isMember(c, memberId)) {
    c.participants.push(new Types.ObjectId(memberId));
    await c.save();
  }
  await publishConversationUpdate(c);
  return c;
};

export const removeMember = async (userId: string, conversationId: string, memberId: string): Promise<ConversationDoc> => {
  const c = await getConversation(userId, conversationId);
  groupOnly(c);
  if (memberId !== userId && !isAdmin(c, userId)) throw forbidden('Only group admins can remove members');
  if (!isMember(c, memberId)) return c;
  c.participants = c.participants.filter((p) => p.toString() !== memberId);
  c.admins = c.admins.filter((a) => a.toString() !== memberId);
  if (c.admins.length === 0 && c.participants.length > 0) c.admins = [c.participants[0]]; // never leave a group without an admin
  await c.save();
  await publishConversationUpdate(c);
  await pubsub.publish(TOPICS.CONVERSATION_UPDATED(memberId), { id: c.id });
  return c;
};

export const leaveConversation = async (userId: string, conversationId: string): Promise<boolean> => {
  const c = await getConversation(userId, conversationId);
  groupOnly(c);
  await removeMember(userId, conversationId, userId);
  return true;
};

export const setAdmin = async (userId: string, conversationId: string, targetId: string, makeAdmin: boolean): Promise<ConversationDoc> => {
  const c = await getConversation(userId, conversationId);
  groupOnly(c);
  if (!isAdmin(c, userId)) throw forbidden('Only group admins can change admins');
  if (!isMember(c, targetId)) throw badInput('That user is not in the group');
  if (makeAdmin && !isAdmin(c, targetId)) c.admins.push(new Types.ObjectId(targetId));
  if (!makeAdmin) {
    if (c.admins.length <= 1 && isAdmin(c, targetId)) throw badInput('A group needs at least one admin');
    c.admins = c.admins.filter((a) => a.toString() !== targetId);
  }
  await c.save();
  await publishConversationUpdate(c);
  return c;
};
