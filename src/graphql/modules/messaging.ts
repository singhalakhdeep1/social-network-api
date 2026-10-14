/**
 * Direct & group messaging over GraphQL, with real-time subscriptions.
 */
import { HydratedDocument } from 'mongoose';
import { withFilter } from 'graphql-subscriptions';
import { Context, authed } from '../context';
import { IConversation } from '../../models/Conversation';
import { IMessage } from '../../models/Message';
import * as messages from '../../services/message.service';
import { resolveMedia, UploadedFile } from '../../utils/uploads';
import { pubsub, TOPICS } from '../../events/pubsub';

type ConvDoc = HydratedDocument<IConversation>;
type MsgDoc = HydratedDocument<IMessage>;
type MaybeUpload = Promise<UploadedFile>;

export const typeDefs = /* GraphQL */ `
  type MessageReaction {
    emoji: String!
    user: User!
  }

  type Message {
    id: ID!
    conversation: Conversation!
    sender: User!
    "Decrypted for participants; empty when deleted"
    content: String!
    media: [Media!]!
    replyTo: Message
    "Read by at least one other participant"
    isRead: Boolean!
    readBy: [User!]!
    isEncrypted: Boolean!
    reactions: [MessageReaction!]!
    isDeleted: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type MessagePage {
    nodes: [Message!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type Conversation {
    id: ID!
    participants: [User!]!
    isGroup: Boolean!
    groupName: String
    groupAvatar: String
    groupDescription: String
    createdBy: User!
    admins: [User!]!
    lastMessage: Message
    lastMessageAt: DateTime
    typingUsers: [User!]!
    isArchived: Boolean!
    isMuted: Boolean!
    unreadCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TypingIndicator {
    userId: ID!
    conversationId: ID!
    isTyping: Boolean!
  }

  extend type Query {
    conversations(archived: Boolean, limit: Int): [Conversation!]!
    conversation(id: ID!): Conversation!
    messages(conversationId: ID!, cursor: String, limit: Int): MessagePage!
    "Searches your recent messages (they are encrypted at rest, so matching happens after decryption)"
    searchMessages(query: String!, conversationId: ID): [Message!]!
  }

  extend type Mutation {
    createConversation(participantIds: [ID!]!, isGroup: Boolean, groupName: String, groupDescription: String): Conversation!
    sendMessage(conversationId: ID!, content: String, media: [Upload!], mediaUrls: [String!], replyTo: ID): Message!
    markConversationRead(conversationId: ID!): Boolean!
    deleteMessage(messageId: ID!): Boolean!
    "Reacting with the same emoji again removes it"
    reactToMessage(messageId: ID!, emoji: String!): Message!
    setTypingIndicator(conversationId: ID!, isTyping: Boolean!): Boolean!
    archiveConversation(conversationId: ID!, archived: Boolean = true): Boolean!
    muteConversation(conversationId: ID!, until: String): Boolean!
    unmuteConversation(conversationId: ID!): Boolean!
    updateGroupInfo(conversationId: ID!, groupName: String, groupDescription: String, groupAvatar: String): Conversation!
    addConversationMember(conversationId: ID!, userId: ID!): Conversation!
    removeConversationMember(conversationId: ID!, userId: ID!): Conversation!
    addConversationAdmin(conversationId: ID!, userId: ID!): Conversation!
    removeConversationAdmin(conversationId: ID!, userId: ID!): Conversation!
    leaveConversation(conversationId: ID!): Boolean!
  }

  extend type Subscription {
    messageSent(conversationId: ID!): Message!
    typingIndicator(conversationId: ID!): TypingIndicator!
    conversationUpdated: Conversation!
  }
`;

export const resolvers = {
  Query: {
    conversations: (_: unknown, args: { archived?: boolean; limit?: number }, ctx: Context) => messages.listConversations(authed(ctx).id, args),
    conversation: (_: unknown, { id }: { id: string }, ctx: Context) => messages.getConversation(authed(ctx).id, id),
    messages: (_: unknown, { conversationId, ...page }: { conversationId: string; cursor?: string; limit?: number }, ctx: Context) => messages.listMessages(authed(ctx).id, conversationId, page),
    searchMessages: (_: unknown, { query, conversationId }: { query: string; conversationId?: string }, ctx: Context) => messages.searchMessages(authed(ctx).id, query, conversationId)
  },

  Mutation: {
    createConversation: (_: unknown, { participantIds, ...opts }: { participantIds: string[]; isGroup?: boolean; groupName?: string; groupDescription?: string }, ctx: Context) =>
      messages.createConversation(authed(ctx).id, participantIds, opts),
    sendMessage: async (_: unknown, args: { conversationId: string; content?: string; media?: MaybeUpload[]; mediaUrls?: string[]; replyTo?: string }, ctx: Context) => {
      const user = authed(ctx);
      const media = await resolveMedia(args.media, args.mediaUrls);
      return messages.sendMessage(user.id, args.conversationId, { content: args.content, media, replyTo: args.replyTo });
    },
    markConversationRead: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) => messages.markRead(authed(ctx).id, conversationId),
    deleteMessage: (_: unknown, { messageId }: { messageId: string }, ctx: Context) => messages.deleteMessage(authed(ctx).id, messageId),
    reactToMessage: (_: unknown, { messageId, emoji }: { messageId: string; emoji: string }, ctx: Context) => messages.reactToMessage(authed(ctx).id, messageId, emoji),
    setTypingIndicator: (_: unknown, { conversationId, isTyping }: { conversationId: string; isTyping: boolean }, ctx: Context) => messages.setTyping(authed(ctx).id, conversationId, isTyping),
    archiveConversation: (_: unknown, { conversationId, archived }: { conversationId: string; archived: boolean }, ctx: Context) => messages.setArchived(authed(ctx).id, conversationId, archived),
    muteConversation: (_: unknown, { conversationId, until }: { conversationId: string; until?: string }, ctx: Context) => messages.muteConversation(authed(ctx).id, conversationId, until),
    unmuteConversation: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) => messages.unmuteConversation(authed(ctx).id, conversationId),
    updateGroupInfo: (_: unknown, { conversationId, ...patch }: { conversationId: string; groupName?: string; groupDescription?: string; groupAvatar?: string }, ctx: Context) =>
      messages.updateGroupInfo(authed(ctx).id, conversationId, patch),
    addConversationMember: (_: unknown, { conversationId, userId }: { conversationId: string; userId: string }, ctx: Context) => messages.addMember(authed(ctx).id, conversationId, userId),
    removeConversationMember: (_: unknown, { conversationId, userId }: { conversationId: string; userId: string }, ctx: Context) => messages.removeMember(authed(ctx).id, conversationId, userId),
    addConversationAdmin: (_: unknown, { conversationId, userId }: { conversationId: string; userId: string }, ctx: Context) => messages.setAdmin(authed(ctx).id, conversationId, userId, true),
    removeConversationAdmin: (_: unknown, { conversationId, userId }: { conversationId: string; userId: string }, ctx: Context) => messages.setAdmin(authed(ctx).id, conversationId, userId, false),
    leaveConversation: (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) => messages.leaveConversation(authed(ctx).id, conversationId)
  },

  Subscription: {
    messageSent: {
      subscribe: async (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) => {
        await messages.getConversation(authed(ctx).id, conversationId); // membership check at subscribe time
        return pubsub.asyncIterator(TOPICS.MESSAGE_SENT(conversationId));
      },
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.message.load(p.id)
    },
    typingIndicator: {
      subscribe: withFilter(
        (async (_: unknown, { conversationId }: { conversationId: string }, ctx: Context) => {
          await messages.getConversation(authed(ctx).id, conversationId);
          return pubsub.asyncIterator(TOPICS.TYPING(conversationId));
        }) as never,
        (payload: { userId: string }, _args: unknown, ctx: Context) => payload.userId !== ctx.user?.id
      ),
      resolve: (p: { userId: string; conversationId: string; isTyping: boolean }) => p
    },
    conversationUpdated: {
      subscribe: (_: unknown, __: unknown, ctx: Context) => pubsub.asyncIterator(TOPICS.CONVERSATION_UPDATED(authed(ctx).id)),
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.conversation.load(p.id)
    }
  },

  Conversation: {
    participants: (c: ConvDoc, _: unknown, ctx: Context) => Promise.all(c.participants.map((p) => ctx.loaders.user.load(p.toString()))).then((l) => l.filter(Boolean)),
    createdBy: (c: ConvDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(c.createdBy.toString()),
    admins: (c: ConvDoc, _: unknown, ctx: Context) => Promise.all(c.admins.map((a) => ctx.loaders.user.load(a.toString()))).then((l) => l.filter(Boolean)),
    lastMessage: (c: ConvDoc, _: unknown, ctx: Context) => (c.lastMessage ? ctx.loaders.message.load(c.lastMessage.toString()) : null),
    typingUsers: async (c: ConvDoc, _: unknown, ctx: Context) => {
      const ids = await messages.typingUsers({ id: c.id, participants: c.participants });
      return Promise.all(ids.filter((i) => i !== ctx.user?.id).map((i) => ctx.loaders.user.load(i))).then((l) => l.filter(Boolean));
    },
    isArchived: (c: ConvDoc, _: unknown, ctx: Context) => !!ctx.user && c.archivedBy.some((a) => a.toString() === ctx.user!.id),
    isMuted: (c: ConvDoc, _: unknown, ctx: Context) => {
      const m = ctx.user && c.mutedBy.find((x) => x.user.toString() === ctx.user!.id);
      return !!m && (!m.until || m.until.getTime() > Date.now());
    },
    unreadCount: (c: ConvDoc, _: unknown, ctx: Context) => (ctx.user ? c.unreadCount?.get(ctx.user.id) ?? 0 : 0)
  },

  Message: {
    conversation: (m: MsgDoc, _: unknown, ctx: Context) => ctx.loaders.conversation.load(m.conversation.toString()),
    sender: (m: MsgDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(m.sender.toString()),
    content: (m: MsgDoc) => messages.messageText(m),
    replyTo: (m: MsgDoc, _: unknown, ctx: Context) => (m.replyTo ? ctx.loaders.message.load(m.replyTo.toString()) : null),
    isRead: (m: MsgDoc) => m.readBy.some((r) => r.toString() !== m.sender.toString()),
    readBy: (m: MsgDoc, _: unknown, ctx: Context) => Promise.all(m.readBy.map((r) => ctx.loaders.user.load(r.toString()))).then((l) => l.filter(Boolean)),
    reactions: (m: MsgDoc) => m.reactions.map((r) => ({ emoji: r.emoji, user: r.user })),
    createdAt: (m: MsgDoc) => m.createdAt
  },

  MessageReaction: {
    user: (r: { user: { toString(): string } }, _: unknown, ctx: Context) => ctx.loaders.user.load(r.user.toString())
  }
};
