/**
 * Groups, events and pages.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { IGroup } from '../../models/Group';
import { IEvent } from '../../models/Event';
import { IPage } from '../../models/Page';
import * as community from '../../services/community.service';
import { saveUpload, UploadedFile } from '../../utils/uploads';
import { pubsub, TOPICS } from '../../events/pubsub';

type GroupDoc = HydratedDocument<IGroup>;
type EventDoc = HydratedDocument<IEvent>;
type PageDoc = HydratedDocument<IPage>;
type MaybeUpload = Promise<UploadedFile>;
type Paging = { limit?: number; cursor?: string };

const idIn = (list: { toString(): string }[], id?: string): boolean => !!id && list.some((x) => x.toString() === id);
const users = (ids: { toString(): string }[], ctx: Context) => Promise.all(ids.map((i) => ctx.loaders.user.load(i.toString()))).then((l) => l.filter(Boolean));
const imageUrl = async (file?: MaybeUpload | null): Promise<string | undefined> => (file ? (await saveUpload(file)).url : undefined);

export const typeDefs = /* GraphQL */ `
  type Group {
    id: ID!
    name: String!
    description: String!
    avatar: String
    coverImage: String
    creator: User!
    admins: [User!]!
    moderators: [User!]!
    "Only members can see the member list of a private group"
    members(limit: Int): [User!]!
    "Join requests, visible to admins"
    pendingMembers: [User!]!
    isPrivate: Boolean!
    category: String!
    tags: [String!]!
    rules: [String!]!
    postCount: Int!
    memberCount: Int!
    isMember: Boolean!
    isAdmin: Boolean!
    hasRequestedToJoin: Boolean!
    createdAt: DateTime!
  }

  type GroupPage {
    nodes: [Group!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type EventLocation {
    name: String!
    address: String!
    coordinates: LocationCoordinates
  }

  type LocationCoordinates {
    lat: Float!
    lng: Float!
  }

  type Event {
    id: ID!
    host: User!
    title: String!
    description: String!
    coverImage: String
    location: EventLocation!
    startDate: DateTime!
    endDate: DateTime!
    isOnline: Boolean!
    meetingUrl: String
    maxAttendees: Int
    attendees(limit: Int): [User!]!
    waitlist: [User!]!
    "Unlisted events (isPublic: false) are reachable by link but not listed"
    isPublic: Boolean!
    category: String!
    tags: [String!]!
    attendeeCount: Int!
    waitlistCount: Int!
    isAttending: Boolean!
    isWaitlisted: Boolean!
    isHost: Boolean!
    createdAt: DateTime!
  }

  type EventPage {
    nodes: [Event!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type Page {
    id: ID!
    name: String!
    handle: String!
    description: String!
    avatar: String
    coverImage: String
    category: String!
    owner: User!
    admins: [User!]!
    isVerified: Boolean!
    website: String
    phone: String
    location: String
    postCount: Int!
    followerCount: Int!
    isFollowing: Boolean!
    isAdmin: Boolean!
    createdAt: DateTime!
  }

  type PagePage {
    nodes: [Page!]!
    nextCursor: String
    hasMore: Boolean!
  }

  input EventLocationInput {
    name: String!
    address: String!
    coordinates: LocationCoordinatesInput
  }

  input LocationCoordinatesInput {
    lat: Float!
    lng: Float!
  }

  input EventInput {
    title: String
    description: String
    location: EventLocationInput
    startDate: String
    endDate: String
    isOnline: Boolean
    meetingUrl: String
    maxAttendees: Int
    isPublic: Boolean
    category: String
    tags: [String!]
  }

  extend type Query {
    group(id: ID!): Group!
    groups(search: String, category: String, limit: Int, cursor: String): GroupPage!
    myGroups: [Group!]!
    event(id: ID!): Event!
    events(search: String, category: String, limit: Int, cursor: String): EventPage!
    myEvents: [Event!]!
    "Look a page up by id or @handle"
    page(id: String!): Page!
    pages(search: String, category: String, limit: Int, cursor: String): PagePage!
    myPages: [Page!]!
    followedPages: [Page!]!
  }

  extend type Mutation {
    createGroup(name: String!, description: String!, isPrivate: Boolean, category: String, tags: [String!], rules: [String!], avatar: Upload, coverImage: Upload): Group!
    updateGroup(groupId: ID!, name: String, description: String, isPrivate: Boolean, category: String, tags: [String!], rules: [String!], avatar: Upload, coverImage: Upload): Group!
    deleteGroup(groupId: ID!): Boolean!
    "Public groups join instantly; private groups create a join request"
    joinGroup(groupId: ID!): Group!
    leaveGroup(groupId: ID!): Group!
    approveGroupMember(groupId: ID!, userId: ID!, approve: Boolean!): Group!
    addGroupMember(groupId: ID!, userId: ID!): Group!
    removeGroupMember(groupId: ID!, userId: ID!): Group!
    addGroupAdmin(groupId: ID!, userId: ID!): Group!
    removeGroupAdmin(groupId: ID!, userId: ID!): Group!

    createEvent(input: EventInput!, coverImage: Upload): Event!
    updateEvent(eventId: ID!, input: EventInput!, coverImage: Upload): Event!
    deleteEvent(eventId: ID!): Boolean!
    "Joins the waitlist automatically when the event is full"
    rsvpEvent(eventId: ID!, attending: Boolean!): Event!
    cancelEventRSVP(eventId: ID!): Event!

    createPage(name: String!, handle: String!, description: String!, category: String, avatar: Upload, coverImage: Upload, website: String, phone: String, location: String): Page!
    updatePage(pageId: ID!, name: String, description: String, category: String, avatar: Upload, coverImage: Upload, website: String, phone: String, location: String): Page!
    deletePage(pageId: ID!): Boolean!
    followPage(pageId: ID!): Page!
    unfollowPage(pageId: ID!): Page!
    addPageAdmin(pageId: ID!, userId: ID!): Page!
    removePageAdmin(pageId: ID!, userId: ID!): Page!
  }

  extend type Subscription {
    eventRSVP(eventId: ID!): Event!
  }
`;

export const resolvers = {
  Query: {
    group: (_: unknown, { id }: { id: string }) => community.getGroup(id),
    groups: (_: unknown, args: Paging & { search?: string; category?: string }, ctx: Context) => community.listGroups(ctx.user?.id, args),
    myGroups: (_: unknown, __: unknown, ctx: Context) => community.myGroups(authed(ctx).id),
    event: (_: unknown, { id }: { id: string }) => community.getEvent(id),
    events: (_: unknown, args: Paging & { search?: string; category?: string }) => community.listEvents(args),
    myEvents: (_: unknown, __: unknown, ctx: Context) => community.myEvents(authed(ctx).id),
    page: (_: unknown, { id }: { id: string }) => community.getPage(id),
    pages: (_: unknown, args: Paging & { search?: string; category?: string }) => community.listPages(args),
    myPages: (_: unknown, __: unknown, ctx: Context) => community.myPages(authed(ctx).id),
    followedPages: (_: unknown, __: unknown, ctx: Context) => community.followedPages(authed(ctx).id)
  },

  Mutation: {
    createGroup: async (_: unknown, args: community.GroupInput & { avatar?: MaybeUpload; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.createGroup(user.id, { ...args, avatar: await imageUrl(args.avatar), coverImage: await imageUrl(args.coverImage) });
    },
    updateGroup: async (_: unknown, { groupId, ...args }: { groupId: string } & community.GroupInput & { avatar?: MaybeUpload; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.updateGroup(user.id, groupId, { ...args, avatar: await imageUrl(args.avatar), coverImage: await imageUrl(args.coverImage) });
    },
    deleteGroup: (_: unknown, { groupId }: { groupId: string }, ctx: Context) => community.deleteGroup(authed(ctx).id, groupId),
    joinGroup: (_: unknown, { groupId }: { groupId: string }, ctx: Context) => community.joinGroup(authed(ctx).id, groupId),
    leaveGroup: (_: unknown, { groupId }: { groupId: string }, ctx: Context) => community.leaveGroup(authed(ctx).id, groupId),
    approveGroupMember: (_: unknown, a: { groupId: string; userId: string; approve: boolean }, ctx: Context) => community.approveMember(authed(ctx).id, a.groupId, a.userId, a.approve),
    addGroupMember: (_: unknown, a: { groupId: string; userId: string }, ctx: Context) => community.addGroupMember(authed(ctx).id, a.groupId, a.userId),
    removeGroupMember: (_: unknown, a: { groupId: string; userId: string }, ctx: Context) => community.removeGroupMember(authed(ctx).id, a.groupId, a.userId),
    addGroupAdmin: (_: unknown, a: { groupId: string; userId: string }, ctx: Context) => community.setGroupAdmin(authed(ctx).id, a.groupId, a.userId, true),
    removeGroupAdmin: (_: unknown, a: { groupId: string; userId: string }, ctx: Context) => community.setGroupAdmin(authed(ctx).id, a.groupId, a.userId, false),

    createEvent: async (_: unknown, { input, coverImage }: { input: community.EventInput; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.createEvent(user.id, { ...input, coverImage: await imageUrl(coverImage) });
    },
    updateEvent: async (_: unknown, { eventId, input, coverImage }: { eventId: string; input: community.EventInput; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.updateEvent(user.id, eventId, { ...input, coverImage: await imageUrl(coverImage) });
    },
    deleteEvent: (_: unknown, { eventId }: { eventId: string }, ctx: Context) => community.deleteEvent(authed(ctx).id, eventId),
    rsvpEvent: (_: unknown, { eventId, attending }: { eventId: string; attending: boolean }, ctx: Context) => community.rsvpEvent(authed(ctx).id, eventId, attending),
    cancelEventRSVP: (_: unknown, { eventId }: { eventId: string }, ctx: Context) => community.cancelRsvp(authed(ctx).id, eventId),

    createPage: async (_: unknown, args: community.PageInput & { avatar?: MaybeUpload; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.createPage(user.id, { ...args, avatar: await imageUrl(args.avatar), coverImage: await imageUrl(args.coverImage) });
    },
    updatePage: async (_: unknown, { pageId, ...args }: { pageId: string } & community.PageInput & { avatar?: MaybeUpload; coverImage?: MaybeUpload }, ctx: Context) => {
      const user = authed(ctx);
      return community.updatePage(user.id, pageId, { ...args, avatar: await imageUrl(args.avatar), coverImage: await imageUrl(args.coverImage) });
    },
    deletePage: (_: unknown, { pageId }: { pageId: string }, ctx: Context) => community.deletePage(authed(ctx).id, pageId),
    followPage: (_: unknown, { pageId }: { pageId: string }, ctx: Context) => community.setPageFollow(authed(ctx).id, pageId, true),
    unfollowPage: (_: unknown, { pageId }: { pageId: string }, ctx: Context) => community.setPageFollow(authed(ctx).id, pageId, false),
    addPageAdmin: (_: unknown, a: { pageId: string; userId: string }, ctx: Context) => community.setPageAdmin(authed(ctx).id, a.pageId, a.userId, true),
    removePageAdmin: (_: unknown, a: { pageId: string; userId: string }, ctx: Context) => community.setPageAdmin(authed(ctx).id, a.pageId, a.userId, false)
  },

  Subscription: {
    eventRSVP: {
      subscribe: async (_: unknown, { eventId }: { eventId: string }) => {
        await community.getEvent(eventId);
        return pubsub.asyncIterator(TOPICS.EVENT_RSVP(eventId));
      },
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.event.load(p.id)
    }
  },

  Group: {
    creator: (g: GroupDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(g.creator.toString()),
    admins: (g: GroupDoc, _: unknown, ctx: Context) => users(g.admins, ctx),
    moderators: (g: GroupDoc, _: unknown, ctx: Context) => users(g.moderators, ctx),
    members: (g: GroupDoc, { limit }: { limit?: number }, ctx: Context) => (!g.isPrivate || idIn(g.members, ctx.user?.id) ? users(g.members.slice(0, Math.min(limit ?? 50, 200)), ctx) : []),
    pendingMembers: (g: GroupDoc, _: unknown, ctx: Context) => (idIn(g.admins, ctx.user?.id) ? users(g.pendingMembers, ctx) : []),
    isMember: (g: GroupDoc, _: unknown, ctx: Context) => idIn(g.members, ctx.user?.id),
    isAdmin: (g: GroupDoc, _: unknown, ctx: Context) => idIn(g.admins, ctx.user?.id),
    hasRequestedToJoin: (g: GroupDoc, _: unknown, ctx: Context) => idIn(g.pendingMembers, ctx.user?.id),
    tags: (g: GroupDoc) => g.tags ?? [],
    rules: (g: GroupDoc) => g.rules ?? []
  },

  Event: {
    host: (e: EventDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(e.host.toString()),
    attendees: (e: EventDoc, { limit }: { limit?: number }, ctx: Context) => users(e.attendees.slice(0, Math.min(limit ?? 50, 200)), ctx),
    waitlist: (e: EventDoc, _: unknown, ctx: Context) => (ctx.user?.id === e.host.toString() ? users(e.waitlist, ctx) : []),
    attendeeCount: (e: EventDoc) => e.attendees.length,
    waitlistCount: (e: EventDoc) => e.waitlist.length,
    isAttending: (e: EventDoc, _: unknown, ctx: Context) => idIn(e.attendees, ctx.user?.id),
    isWaitlisted: (e: EventDoc, _: unknown, ctx: Context) => idIn(e.waitlist, ctx.user?.id),
    isHost: (e: EventDoc, _: unknown, ctx: Context) => e.host.toString() === ctx.user?.id,
    tags: (e: EventDoc) => e.tags ?? [],
    location: (e: EventDoc) => ({ name: e.location.name, address: e.location.address, coordinates: e.location.coordinates?.lat !== undefined ? e.location.coordinates : null })
  },

  Page: {
    owner: (p: PageDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(p.owner.toString()),
    admins: (p: PageDoc, _: unknown, ctx: Context) => users(p.admins, ctx),
    isFollowing: (p: PageDoc, _: unknown, ctx: Context) => idIn(p.followers, ctx.user?.id),
    isAdmin: (p: PageDoc, _: unknown, ctx: Context) => !!ctx.user && (p.owner.toString() === ctx.user.id || idIn(p.admins, ctx.user.id))
  }
};
