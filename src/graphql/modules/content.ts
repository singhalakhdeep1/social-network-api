/**
 * Content management: drafts, scheduled posts and the content calendar.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { IDraftPost } from '../../models/DraftPost';
import { IScheduledPost } from '../../models/ScheduledPost';
import * as content from '../../services/content.service';
import { resolveMedia, UploadedFile } from '../../utils/uploads';

type MaybeUpload = Promise<UploadedFile>;

export const typeDefs = /* GraphQL */ `
  type DraftPost {
    id: ID!
    content: String!
    media: [Media!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ScheduledPost {
    id: ID!
    content: String!
    media: [Media!]!
    scheduledFor: DateTime!
    "pending | published | failed"
    status: String!
    publishedAt: DateTime
    "The live post once published"
    post: Post
    errorMessage: String
    createdAt: DateTime!
  }

  type ContentCalendar {
    posts: [ScheduledPost!]!
    drafts: [DraftPost!]!
    totalScheduled: Int!
    totalDrafts: Int!
  }

  extend type Query {
    myScheduledPosts(includeProcessed: Boolean): [ScheduledPost!]!
    myDraftPosts: [DraftPost!]!
    contentCalendar: ContentCalendar!
  }

  extend type Mutation {
    createDraft(content: String, media: [Upload!], mediaUrls: [String!]): DraftPost!
    updateDraft(id: ID!, content: String, media: [Upload!], mediaUrls: [String!]): DraftPost!
    deleteDraft(id: ID!): Boolean!
    publishDraft(id: ID!): Post!
    schedulePost(content: String, media: [Upload!], mediaUrls: [String!], scheduledFor: String!): ScheduledPost!
    updateScheduledPost(id: ID!, scheduledFor: String, content: String): ScheduledPost!
    deleteScheduledPost(id: ID!): Boolean!
    publishScheduledPost(id: ID!): Post!
  }
`;

export const resolvers = {
  Query: {
    myScheduledPosts: (_: unknown, { includeProcessed }: { includeProcessed?: boolean }, ctx: Context) => content.listScheduled(authed(ctx).id, !!includeProcessed),
    myDraftPosts: (_: unknown, __: unknown, ctx: Context) => content.listDrafts(authed(ctx).id),
    contentCalendar: (_: unknown, __: unknown, ctx: Context) => content.contentCalendar(authed(ctx).id)
  },
  Mutation: {
    createDraft: async (_: unknown, args: { content?: string; media?: MaybeUpload[]; mediaUrls?: string[] }, ctx: Context) => {
      const user = authed(ctx);
      return content.createDraft(user.id, args.content, await resolveMedia(args.media, args.mediaUrls));
    },
    updateDraft: async (_: unknown, args: { id: string; content?: string; media?: MaybeUpload[]; mediaUrls?: string[] }, ctx: Context) => {
      const user = authed(ctx);
      const media = args.media || args.mediaUrls ? await resolveMedia(args.media, args.mediaUrls) : undefined;
      return content.updateDraft(user.id, args.id, { content: args.content, media });
    },
    deleteDraft: (_: unknown, { id }: { id: string }, ctx: Context) => content.deleteDraft(authed(ctx).id, id),
    publishDraft: (_: unknown, { id }: { id: string }, ctx: Context) => content.publishDraft(authed(ctx).id, id),
    schedulePost: async (_: unknown, args: { content?: string; media?: MaybeUpload[]; mediaUrls?: string[]; scheduledFor: string }, ctx: Context) => {
      const user = authed(ctx);
      return content.schedulePost(user.id, args.content, await resolveMedia(args.media, args.mediaUrls), args.scheduledFor);
    },
    updateScheduledPost: (_: unknown, { id, ...patch }: { id: string; scheduledFor?: string; content?: string }, ctx: Context) => content.updateScheduledPost(authed(ctx).id, id, patch),
    deleteScheduledPost: (_: unknown, { id }: { id: string }, ctx: Context) => content.deleteScheduledPost(authed(ctx).id, id),
    publishScheduledPost: (_: unknown, { id }: { id: string }, ctx: Context) => content.publishScheduledPostNow(authed(ctx).id, id)
  },
  ScheduledPost: {
    post: (s: HydratedDocument<IScheduledPost>, _: unknown, ctx: Context) => (s.post ? ctx.loaders.post.load(s.post.toString()) : null)
  },
  DraftPost: {
    media: (d: HydratedDocument<IDraftPost>) => d.media ?? []
  }
};
