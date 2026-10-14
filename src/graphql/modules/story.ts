/**
 * Stories, reactions, replies and highlights.
 */
import { HydratedDocument, Types } from 'mongoose';
import { withFilter } from 'graphql-subscriptions';
import { Context, authed } from '../context';
import { IStory } from '../../models/Story';
import { IStoryHighlight } from '../../models/StoryHighlight';
import { IStoryReply } from '../../models/StoryReply';
import * as storySvc from '../../services/story.service';
import { followingIds } from '../../services/follow.service';
import { resolveMedia, UploadedFile } from '../../utils/uploads';
import { pubsub, TOPICS } from '../../events/pubsub';
import { forbidden } from '../../utils/errors';

type StoryDoc = HydratedDocument<IStory>;
type MaybeUpload = Promise<UploadedFile>;

export const typeDefs = /* GraphQL */ `
  type StoryReaction {
    emoji: String!
    user: User!
  }

  type StoryReply {
    id: ID!
    story: Story!
    author: User!
    content: String!
    createdAt: DateTime!
  }

  type Story {
    id: ID!
    author: User!
    media: [Media!]!
    content: String
    hashtags: [String!]!
    mentions: [User!]!
    expiresAt: DateTime!
    "Only visible to the story's author"
    viewers: [User!]!
    viewerCount: Int!
    hasViewed: Boolean!
    reactions: [StoryReaction!]!
    myReaction: String
    "Only visible to the story's author"
    replies: [StoryReply!]!
    isArchived: Boolean!
    createdAt: DateTime!
  }

  type StoryHighlight {
    id: ID!
    author: User!
    title: String!
    coverUrl: String!
    stories: [Story!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  "One avatar bubble in the stories tray"
  type StoryTrayItem {
    author: User!
    stories: [Story!]!
    hasUnseen: Boolean!
  }

  extend type Query {
    storyTray: [StoryTrayItem!]!
    myStories: [Story!]!
    archivedStories: [Story!]!
    userStories(userId: ID!): [Story!]!
    story(id: ID!): Story!
    userStoryHighlights(userId: ID!): [StoryHighlight!]!
  }

  extend type Mutation {
    createStory(media: [Upload!], mediaUrls: [String!], content: String): Story!
    viewStory(storyId: ID!): Story!
    addStoryReaction(storyId: ID!, emoji: String!): StoryReaction!
    addStoryReply(storyId: ID!, content: String!): StoryReply!
    deleteStory(storyId: ID!): Boolean!
    createStoryHighlight(title: String!, coverUrl: String!, storyIds: [ID!]!): StoryHighlight!
    deleteStoryHighlight(highlightId: ID!): Boolean!
    addToHighlight(highlightId: ID!, storyId: ID!): StoryHighlight!
    removeFromHighlight(highlightId: ID!, storyId: ID!): StoryHighlight!
  }

  extend type Subscription {
    "New stories from people you follow"
    storyCreated: Story!
    "Someone viewed your story"
    storyViewed(storyId: ID!): Story!
    storyReactionAdded(storyId: ID!): StoryReaction!
  }
`;

const ownerOnly = (s: StoryDoc, ctx: Context): boolean => ctx.user?.id === s.author.toString();

export const resolvers = {
  Query: {
    storyTray: (_: unknown, __: unknown, ctx: Context) => storySvc.storyTray(authed(ctx).id),
    myStories: (_: unknown, __: unknown, ctx: Context) => storySvc.myStories(authed(ctx).id),
    archivedStories: (_: unknown, __: unknown, ctx: Context) => storySvc.archivedStories(authed(ctx).id),
    userStories: (_: unknown, { userId }: { userId: string }, ctx: Context) => storySvc.userStories(ctx.user?.id, userId),
    story: (_: unknown, { id }: { id: string }, ctx: Context) => storySvc.getStory(ctx.user?.id, id),
    userStoryHighlights: (_: unknown, { userId }: { userId: string }, ctx: Context) => storySvc.userHighlights(ctx.user?.id, userId)
  },

  Mutation: {
    createStory: async (_: unknown, args: { media?: MaybeUpload[]; mediaUrls?: string[]; content?: string }, ctx: Context) => {
      const user = authed(ctx);
      return storySvc.createStory(user.id, await resolveMedia(args.media, args.mediaUrls), args.content);
    },
    viewStory: (_: unknown, { storyId }: { storyId: string }, ctx: Context) => storySvc.viewStory(authed(ctx).id, storyId),
    addStoryReaction: (_: unknown, { storyId, emoji }: { storyId: string; emoji: string }, ctx: Context) => storySvc.reactToStory(authed(ctx).id, storyId, emoji),
    addStoryReply: (_: unknown, { storyId, content }: { storyId: string; content: string }, ctx: Context) => storySvc.replyToStory(authed(ctx).id, storyId, content),
    deleteStory: (_: unknown, { storyId }: { storyId: string }, ctx: Context) => storySvc.deleteStory(authed(ctx).id, storyId),
    createStoryHighlight: (_: unknown, { title, coverUrl, storyIds }: { title: string; coverUrl: string; storyIds: string[] }, ctx: Context) => storySvc.createHighlight(authed(ctx).id, title, coverUrl, storyIds),
    deleteStoryHighlight: (_: unknown, { highlightId }: { highlightId: string }, ctx: Context) => storySvc.deleteHighlight(authed(ctx).id, highlightId),
    addToHighlight: (_: unknown, { highlightId, storyId }: { highlightId: string; storyId: string }, ctx: Context) => storySvc.addToHighlight(authed(ctx).id, highlightId, storyId),
    removeFromHighlight: (_: unknown, { highlightId, storyId }: { highlightId: string; storyId: string }, ctx: Context) => storySvc.removeFromHighlight(authed(ctx).id, highlightId, storyId)
  },

  Subscription: {
    storyCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(TOPICS.STORY_CREATED),
        async (payload: { authorId: string }, _a: unknown, ctx: Context) => !!ctx.user && payload.authorId !== ctx.user.id && (await followingIds(ctx.user.id)).includes(payload.authorId)
      ),
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.story.load(p.id)
    },
    storyViewed: {
      subscribe: async (_: unknown, { storyId }: { storyId: string }, ctx: Context) => {
        const story = await storySvc.getStory(authed(ctx).id, storyId);
        if (!ownerOnly(story, ctx)) throw forbidden('Only the author can watch story views');
        return pubsub.asyncIterator(TOPICS.STORY_VIEWED(storyId));
      },
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.story.load(p.id)
    },
    storyReactionAdded: {
      subscribe: async (_: unknown, { storyId }: { storyId: string }, ctx: Context) => {
        const story = await storySvc.getStory(authed(ctx).id, storyId);
        if (!ownerOnly(story, ctx)) throw forbidden('Only the author can watch story reactions');
        return pubsub.asyncIterator(TOPICS.STORY_REACTION(storyId));
      },
      resolve: (p: { userId: string; emoji: string }) => ({ emoji: p.emoji, user: new Types.ObjectId(p.userId) })
    }
  },

  Story: {
    author: (s: StoryDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(s.author.toString()),
    mentions: (s: StoryDoc, _: unknown, ctx: Context) => Promise.all(s.mentions.map((m) => ctx.loaders.user.load(m.toString()))).then((l) => l.filter(Boolean)),
    viewers: (s: StoryDoc, _: unknown, ctx: Context) => (ownerOnly(s, ctx) ? Promise.all(s.viewers.map((v) => ctx.loaders.user.load(v.toString()))).then((l) => l.filter(Boolean)) : []),
    hasViewed: (s: StoryDoc, _: unknown, ctx: Context) => !!ctx.user && (ownerOnly(s, ctx) || s.viewers.some((v) => v.toString() === ctx.user!.id)),
    reactions: (s: StoryDoc) => s.reactions.map((r) => ({ emoji: r.emoji, user: r.userId })),
    myReaction: (s: StoryDoc, _: unknown, ctx: Context) => s.reactions.find((r) => r.userId.toString() === ctx.user?.id)?.emoji ?? null,
    replies: (s: StoryDoc, _: unknown, ctx: Context) => (ownerOnly(s, ctx) ? storySvc.storyReplies(s) : [])
  },

  StoryReaction: {
    user: (r: { user: Types.ObjectId }, _: unknown, ctx: Context) => ctx.loaders.user.load(r.user.toString())
  },

  StoryReply: {
    story: (r: HydratedDocument<IStoryReply>, _: unknown, ctx: Context) => ctx.loaders.story.load(r.story.toString()),
    author: (r: HydratedDocument<IStoryReply>, _: unknown, ctx: Context) => ctx.loaders.user.load(r.author.toString())
  },

  StoryHighlight: {
    author: (h: HydratedDocument<IStoryHighlight>, _: unknown, ctx: Context) => ctx.loaders.user.load(h.author.toString()),
    stories: (h: HydratedDocument<IStoryHighlight>, _: unknown, ctx: Context) => Promise.all(h.stories.map((s) => ctx.loaders.story.load(s.toString()))).then((l) => l.filter(Boolean))
  },

  StoryTrayItem: {
    author: (t: { author: Types.ObjectId }, _: unknown, ctx: Context) => ctx.loaders.user.load(t.author.toString())
  }
};
