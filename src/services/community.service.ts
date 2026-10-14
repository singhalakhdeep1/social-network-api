/**
 * Communities: groups (public / private with join requests), events (RSVP + waitlist),
 * pages (follower-style public profiles) and polls attached to posts.
 */
import { FilterQuery, HydratedDocument, Types } from 'mongoose';
import Group, { IGroup } from '../models/Group';
import Event, { IEvent } from '../models/Event';
import Page, { IPage } from '../models/Page';
import Poll, { IPoll } from '../models/Poll';
import Post from '../models/Post';
import User from '../models/User';
import { assertUrl, escapeRegex, sanitizeInput } from '../middleware/validation';
import { badInput, conflict, forbidden, notFound } from '../utils/errors';
import { Page as PageResult, clampLimit, paginate, toObjectId } from '../utils/pagination';
import { getVisiblePost, deletePost } from './post.service';
import { notify } from './notification.service';
import { cache } from './cache/cache.service';
import { pubsub, TOPICS } from '../events/pubsub';

export type GroupDoc = HydratedDocument<IGroup>;
export type EventDoc = HydratedDocument<IEvent>;
export type PageDoc = HydratedDocument<IPage>;
export type PollDoc = HydratedDocument<IPoll>;

const has = (list: Types.ObjectId[], id: string): boolean => list.some((x) => x.toString() === id);
const clean = (s: string | null | undefined, max: number): string => sanitizeInput(s ?? '').slice(0, max);
const dropVisibility = (userId: string) => cache.delete(`visibility:${userId}`);

// =====================================================================================
// Groups
// =====================================================================================

export interface GroupInput {
  name?: string | null;
  description?: string | null;
  isPrivate?: boolean | null;
  category?: string | null;
  tags?: string[] | null;
  rules?: string[] | null;
  avatar?: string | null;
  coverImage?: string | null;
}

export const createGroup = async (userId: string, input: GroupInput): Promise<GroupDoc> => {
  const name = clean(input.name, 100);
  const description = clean(input.description, 500);
  if (name.length < 3) throw badInput('Group name must be at least 3 characters');
  if (!description) throw badInput('Group needs a description');
  const group = await Group.create({
    name,
    description,
    isPrivate: !!input.isPrivate,
    category: clean(input.category, 40) || 'general',
    tags: (input.tags ?? []).map((t) => clean(t, 30)).filter(Boolean).slice(0, 10),
    rules: (input.rules ?? []).map((r) => clean(r, 200)).filter(Boolean).slice(0, 15),
    avatar: input.avatar ?? undefined,
    coverImage: input.coverImage ?? undefined,
    creator: userId,
    admins: [userId],
    members: [userId],
    memberCount: 1
  });
  await dropVisibility(userId);
  return group;
};

export const getGroup = async (id: string): Promise<GroupDoc> => {
  const group = await Group.findById(toObjectId(id));
  if (!group) throw notFound('Group');
  return group;
};

const adminGroup = async (userId: string, id: string): Promise<GroupDoc> => {
  const g = await getGroup(id);
  if (!has(g.admins, userId)) throw forbidden('Only group admins can do that');
  return g;
};

export const updateGroup = async (userId: string, id: string, patch: GroupInput): Promise<GroupDoc> => {
  const g = await adminGroup(userId, id);
  if (patch.name) g.name = clean(patch.name, 100);
  if (patch.description) g.description = clean(patch.description, 500);
  if (patch.category) g.category = clean(patch.category, 40);
  if (patch.tags) g.tags = patch.tags.map((t) => clean(t, 30)).filter(Boolean).slice(0, 10);
  if (patch.rules) g.rules = patch.rules.map((r) => clean(r, 200)).filter(Boolean).slice(0, 15);
  if (typeof patch.isPrivate === 'boolean') g.isPrivate = patch.isPrivate;
  if (patch.avatar) g.avatar = patch.avatar;
  if (patch.coverImage) g.coverImage = patch.coverImage;
  await g.save();
  await cache.invalidatePattern('visibility:*');
  return g;
};

export const deleteGroup = async (userId: string, id: string): Promise<boolean> => {
  const g = await getGroup(id);
  if (g.creator.toString() !== userId) throw forbidden('Only the creator can delete the group');
  const posts = await Post.find({ group: g._id }).select('_id author').limit(2000);
  for (const p of posts) await deletePost({ id: p.author.toString(), role: 'user' }, p.id);
  await g.deleteOne();
  await cache.invalidatePattern('visibility:*');
  return true;
};

export const joinGroup = async (userId: string, id: string): Promise<GroupDoc> => {
  const g = await getGroup(id);
  if (has(g.members, userId)) return g;
  if (g.isPrivate) {
    if (!has(g.pendingMembers, userId)) {
      g.pendingMembers.push(new Types.ObjectId(userId));
      await g.save();
      const requester = await User.findById(userId).select('username');
      for (const admin of g.admins) void notify({ recipient: admin, sender: userId, type: 'group', message: `${requester?.username ?? 'Someone'} asked to join ${g.name}` });
    }
    return g;
  }
  const updated = await Group.findOneAndUpdate({ _id: g._id, members: { $ne: userId } }, { $addToSet: { members: userId }, $inc: { memberCount: 1 } }, { new: true });
  await dropVisibility(userId);
  return updated ?? g;
};

export const leaveGroup = async (userId: string, id: string): Promise<GroupDoc> => {
  const g = await getGroup(id);
  if (g.creator.toString() === userId) throw badInput('The creator cannot leave; delete the group or transfer admin first');
  const updated = await Group.findOneAndUpdate(
    { _id: g._id, members: userId },
    { $pull: { members: userId, admins: userId, moderators: userId, pendingMembers: userId }, $inc: { memberCount: -1 } },
    { new: true }
  );
  await Group.updateOne({ _id: g._id }, { $pull: { pendingMembers: userId } });
  await dropVisibility(userId);
  return updated ?? ((await Group.findById(g._id)) as GroupDoc);
};

export const approveMember = async (adminId: string, id: string, userId: string, approve: boolean): Promise<GroupDoc> => {
  const g = await adminGroup(adminId, id);
  if (!has(g.pendingMembers, userId)) throw notFound('Join request');
  g.pendingMembers = g.pendingMembers.filter((p) => p.toString() !== userId);
  if (approve) {
    g.members.push(new Types.ObjectId(userId));
    g.memberCount = g.members.length;
    void notify({ recipient: userId, sender: adminId, type: 'group', message: `You can now post in ${g.name}` });
    await dropVisibility(userId);
  }
  return g.save();
};

export const addGroupMember = async (adminId: string, id: string, userId: string): Promise<GroupDoc> => {
  const g = await adminGroup(adminId, id);
  if (!(await User.exists({ _id: toObjectId(userId) }))) throw notFound('User');
  if (!has(g.members, userId)) {
    g.members.push(new Types.ObjectId(userId));
    g.pendingMembers = g.pendingMembers.filter((p) => p.toString() !== userId);
    g.memberCount = g.members.length;
    await g.save();
    void notify({ recipient: userId, sender: adminId, type: 'group', message: `You were added to ${g.name}` });
    await dropVisibility(userId);
  }
  return g;
};

export const removeGroupMember = async (adminId: string, id: string, userId: string): Promise<GroupDoc> => {
  const g = await adminGroup(adminId, id);
  if (g.creator.toString() === userId) throw forbidden('The creator cannot be removed');
  g.members = g.members.filter((m) => m.toString() !== userId);
  g.admins = g.admins.filter((m) => m.toString() !== userId);
  g.moderators = g.moderators.filter((m) => m.toString() !== userId);
  g.memberCount = g.members.length;
  await g.save();
  await dropVisibility(userId);
  return g;
};

export const setGroupAdmin = async (adminId: string, id: string, userId: string, makeAdmin: boolean): Promise<GroupDoc> => {
  const g = await adminGroup(adminId, id);
  if (!has(g.members, userId)) throw badInput('That user is not a member');
  if (makeAdmin && !has(g.admins, userId)) g.admins.push(new Types.ObjectId(userId));
  if (!makeAdmin) {
    if (g.creator.toString() === userId) throw forbidden('The creator is always an admin');
    g.admins = g.admins.filter((a) => a.toString() !== userId);
  }
  return g.save();
};

export const listGroups = async (viewerId: string | undefined, opts: { search?: string | null; category?: string | null; limit?: number | null; cursor?: string | null }): Promise<PageResult<GroupDoc>> => {
  const filter: FilterQuery<IGroup> = { $or: [{ isPrivate: false }, ...(viewerId ? [{ members: viewerId }] : [])] };
  if (opts.category) filter.category = opts.category.toLowerCase();
  if (opts.search) filter.name = { $regex: escapeRegex(opts.search), $options: 'i' };
  return paginate<GroupDoc, IGroup>(Group, filter, opts);
};

export const myGroups = (userId: string): Promise<GroupDoc[]> => Group.find({ members: userId }).sort({ updatedAt: -1 });

// =====================================================================================
// Events
// =====================================================================================

export interface EventInput {
  title?: string | null;
  description?: string | null;
  location?: { name: string; address: string; coordinates?: { lat: number; lng: number } | null } | null;
  startDate?: string | null;
  endDate?: string | null;
  isOnline?: boolean | null;
  meetingUrl?: string | null;
  maxAttendees?: number | null;
  isPublic?: boolean | null;
  category?: string | null;
  tags?: string[] | null;
  coverImage?: string | null;
}

const parseDate = (iso: string | null | undefined, label: string): Date => {
  const d = new Date(iso ?? '');
  if (Number.isNaN(d.getTime())) throw badInput(`Invalid ${label}`);
  return d;
};

export const createEvent = async (hostId: string, input: EventInput): Promise<EventDoc> => {
  const title = clean(input.title, 200);
  if (title.length < 3) throw badInput('Event title must be at least 3 characters');
  const startDate = parseDate(input.startDate, 'start date');
  const endDate = parseDate(input.endDate, 'end date');
  if (endDate <= startDate) throw badInput('Event must end after it starts');
  if (!input.location) throw badInput('Event location is required');
  if (input.meetingUrl) assertUrl(input.meetingUrl, 'Meeting URL');
  if (input.isOnline && !input.meetingUrl) throw badInput('Online events need a meeting URL');
  if (input.maxAttendees !== undefined && input.maxAttendees !== null && input.maxAttendees < 1) throw badInput('maxAttendees must be at least 1');
  return Event.create({
    host: hostId,
    title,
    description: clean(input.description, 2000) || title,
    location: { name: clean(input.location.name, 120), address: clean(input.location.address, 200), coordinates: input.location.coordinates ?? undefined },
    startDate,
    endDate,
    isOnline: !!input.isOnline,
    meetingUrl: input.meetingUrl ?? undefined,
    maxAttendees: input.maxAttendees ?? undefined,
    isPublic: input.isPublic ?? true,
    category: clean(input.category, 40).toLowerCase() || 'general',
    tags: (input.tags ?? []).map((t) => clean(t, 30)).filter(Boolean).slice(0, 10),
    coverImage: input.coverImage ?? undefined,
    attendees: [hostId]
  });
};

export const getEvent = async (id: string): Promise<EventDoc> => {
  const e = await Event.findById(toObjectId(id));
  if (!e) throw notFound('Event');
  return e;
};

const hostedEvent = async (userId: string, id: string): Promise<EventDoc> => {
  const e = await getEvent(id);
  if (e.host.toString() !== userId) throw forbidden('Only the host can do that');
  return e;
};

export const updateEvent = async (userId: string, id: string, patch: EventInput): Promise<EventDoc> => {
  const e = await hostedEvent(userId, id);
  if (patch.title) e.title = clean(patch.title, 200);
  if (patch.description) e.description = clean(patch.description, 2000);
  if (patch.startDate) e.startDate = parseDate(patch.startDate, 'start date');
  if (patch.endDate) e.endDate = parseDate(patch.endDate, 'end date');
  if (e.endDate <= e.startDate) throw badInput('Event must end after it starts');
  if (patch.location) e.location = { name: clean(patch.location.name, 120), address: clean(patch.location.address, 200), coordinates: patch.location.coordinates ?? undefined };
  if (patch.meetingUrl) e.meetingUrl = assertUrl(patch.meetingUrl, 'Meeting URL');
  if (typeof patch.isOnline === 'boolean') e.isOnline = patch.isOnline;
  if (typeof patch.isPublic === 'boolean') e.isPublic = patch.isPublic;
  if (patch.maxAttendees) e.maxAttendees = patch.maxAttendees;
  if (patch.category) e.category = clean(patch.category, 40).toLowerCase();
  if (patch.tags) e.tags = patch.tags.map((t) => clean(t, 30)).filter(Boolean).slice(0, 10);
  if (patch.coverImage) e.coverImage = patch.coverImage;
  await e.save();
  for (const a of e.attendees) void notify({ recipient: a, sender: userId, type: 'event', message: `"${e.title}" was updated` });
  return e;
};

export const deleteEvent = async (userId: string, id: string): Promise<boolean> => {
  const e = await hostedEvent(userId, id);
  for (const a of e.attendees) void notify({ recipient: a, sender: userId, type: 'event', message: `"${e.title}" was cancelled` });
  await e.deleteOne();
  return true;
};

export const rsvpEvent = async (userId: string, id: string, attending: boolean): Promise<EventDoc> => {
  if (!attending) return cancelRsvp(userId, id);
  const e = await getEvent(id);
  if (e.endDate.getTime() < Date.now()) throw badInput('This event has already ended');
  if (has(e.attendees, userId) || has(e.waitlist, userId)) return e;
  const full = e.maxAttendees !== undefined && e.maxAttendees !== null && e.attendees.length >= e.maxAttendees;
  const updated = await Event.findOneAndUpdate(
    { _id: e._id, ...(full ? {} : { $expr: { $or: [{ $eq: [{ $ifNull: ['$maxAttendees', null] }, null] }, { $lt: [{ $size: '$attendees' }, '$maxAttendees'] }] } }) },
    full ? { $addToSet: { waitlist: userId } } : { $addToSet: { attendees: userId } },
    { new: true }
  );
  // the capacity check lost a race: put the user on the waitlist instead
  const final = updated ?? (await Event.findByIdAndUpdate(e._id, { $addToSet: { waitlist: userId } }, { new: true }));
  void pubsub.publish(TOPICS.EVENT_RSVP(e.id), { id: e.id });
  const person = await User.findById(userId).select('username');
  void notify({ recipient: e.host, sender: userId, type: 'event', message: `${person?.username ?? 'Someone'} is going to "${e.title}"` });
  return final!;
};

export const cancelRsvp = async (userId: string, id: string): Promise<EventDoc> => {
  const e = await getEvent(id);
  if (e.host.toString() === userId) throw badInput('Hosts cannot cancel their own RSVP; delete the event instead');
  const wasAttending = has(e.attendees, userId);
  e.attendees = e.attendees.filter((a) => a.toString() !== userId);
  e.waitlist = e.waitlist.filter((a) => a.toString() !== userId);
  if (wasAttending && e.waitlist.length && (e.maxAttendees === undefined || e.maxAttendees === null || e.attendees.length < e.maxAttendees)) {
    const promoted = e.waitlist.shift()!;
    e.attendees.push(promoted);
    void notify({ recipient: promoted, sender: e.host, type: 'event', message: `A spot opened up: you're going to "${e.title}"` });
  }
  await e.save();
  void pubsub.publish(TOPICS.EVENT_RSVP(e.id), { id: e.id });
  return e;
};

export const listEvents = (opts: { category?: string | null; search?: string | null; limit?: number | null; cursor?: string | null }): Promise<PageResult<EventDoc>> => {
  const filter: FilterQuery<IEvent> = { isPublic: true, endDate: { $gte: new Date() } };
  if (opts.category) filter.category = opts.category.toLowerCase();
  if (opts.search) filter.title = { $regex: escapeRegex(opts.search), $options: 'i' };
  return paginate<EventDoc, IEvent>(Event, filter, { ...opts, direction: 'asc' });
};

export const myEvents = (userId: string): Promise<EventDoc[]> =>
  Event.find({ $or: [{ attendees: userId }, { waitlist: userId }, { host: userId }] })
    .sort({ startDate: 1 })
    .limit(clampLimit(100, 100, 100));

// =====================================================================================
// Pages
// =====================================================================================

export interface PageInput {
  name?: string | null;
  handle?: string | null;
  description?: string | null;
  category?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  website?: string | null;
  phone?: string | null;
  location?: string | null;
}

export const createPage = async (userId: string, input: PageInput): Promise<PageDoc> => {
  const handle = (input.handle ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_.]{3,30}$/.test(handle)) throw badInput('Handle must be 3-30 characters: letters, numbers, dot, underscore');
  const name = clean(input.name, 100);
  if (!name) throw badInput('Page name is required');
  if (input.website) assertUrl(input.website, 'Website');
  if (await Page.exists({ handle })) throw conflict('That page handle is taken');
  return Page.create({
    name,
    handle,
    description: clean(input.description, 500) || name,
    category: clean(input.category, 40).toLowerCase() || 'general',
    avatar: input.avatar ?? undefined,
    coverImage: input.coverImage ?? undefined,
    website: input.website ?? undefined,
    phone: clean(input.phone, 30) || undefined,
    location: clean(input.location, 120) || undefined,
    owner: userId,
    admins: [userId]
  });
};

export const getPage = async (idOrHandle: string): Promise<PageDoc> => {
  const page = Types.ObjectId.isValid(idOrHandle) ? await Page.findById(idOrHandle) : await Page.findOne({ handle: idOrHandle.toLowerCase().replace(/^@/, '') });
  if (!page) throw notFound('Page');
  return page;
};

const adminPage = async (userId: string, id: string): Promise<PageDoc> => {
  const p = await getPage(id);
  if (p.owner.toString() !== userId && !has(p.admins, userId)) throw forbidden('Only page admins can do that');
  return p;
};

export const updatePage = async (userId: string, id: string, patch: PageInput): Promise<PageDoc> => {
  const p = await adminPage(userId, id);
  if (patch.name) p.name = clean(patch.name, 100);
  if (patch.description) p.description = clean(patch.description, 500);
  if (patch.category) p.category = clean(patch.category, 40).toLowerCase();
  if (patch.avatar) p.avatar = patch.avatar;
  if (patch.coverImage) p.coverImage = patch.coverImage;
  if (patch.website) p.website = assertUrl(patch.website, 'Website');
  if (patch.phone !== undefined && patch.phone !== null) p.phone = clean(patch.phone, 30);
  if (patch.location !== undefined && patch.location !== null) p.location = clean(patch.location, 120);
  return p.save();
};

export const deletePage = async (userId: string, id: string): Promise<boolean> => {
  const p = await getPage(id);
  if (p.owner.toString() !== userId) throw forbidden('Only the owner can delete the page');
  const posts = await Post.find({ page: p._id }).select('_id author').limit(2000);
  for (const post of posts) await deletePost({ id: post.author.toString(), role: 'user' }, post.id);
  await p.deleteOne();
  return true;
};

export const setPageFollow = async (userId: string, id: string, follow: boolean): Promise<PageDoc> => {
  const p = await getPage(id);
  const changed = await Page.updateOne(follow ? { _id: p._id, followers: { $ne: userId } } : { _id: p._id, followers: userId }, follow ? { $addToSet: { followers: userId }, $inc: { followerCount: 1 } } : { $pull: { followers: userId }, $inc: { followerCount: -1 } });
  if (changed.modifiedCount === 1 && follow) {
    const follower = await User.findById(userId).select('username');
    void notify({ recipient: p.owner, sender: userId, type: 'follow', message: `${follower?.username ?? 'Someone'} followed your page ${p.name}` });
  }
  return (await Page.findById(p._id)) as PageDoc;
};

export const setPageAdmin = async (ownerId: string, id: string, userId: string, makeAdmin: boolean): Promise<PageDoc> => {
  const p = await getPage(id);
  if (p.owner.toString() !== ownerId) throw forbidden('Only the owner can manage admins');
  if (!(await User.exists({ _id: toObjectId(userId) }))) throw notFound('User');
  if (makeAdmin) await Page.updateOne({ _id: p._id }, { $addToSet: { admins: userId } });
  else if (p.owner.toString() === userId) throw forbidden('The owner is always an admin');
  else await Page.updateOne({ _id: p._id }, { $pull: { admins: userId } });
  return (await Page.findById(p._id)) as PageDoc;
};

export const listPages = (opts: { search?: string | null; category?: string | null; limit?: number | null; cursor?: string | null }): Promise<PageResult<PageDoc>> => {
  const filter: FilterQuery<IPage> = {};
  if (opts.category) filter.category = opts.category.toLowerCase();
  if (opts.search) filter.$or = [{ name: { $regex: escapeRegex(opts.search), $options: 'i' } }, { handle: { $regex: escapeRegex(opts.search.toLowerCase()) } }];
  return paginate<PageDoc, IPage>(Page, filter, opts);
};

export const myPages = (userId: string): Promise<PageDoc[]> => Page.find({ $or: [{ owner: userId }, { admins: userId }] }).sort({ createdAt: -1 });
export const followedPages = (userId: string): Promise<PageDoc[]> => Page.find({ followers: userId }).sort({ followerCount: -1 });

// =====================================================================================
// Polls
// =====================================================================================

export const createPoll = async (
  userId: string,
  postId: string,
  input: { question: string; options: string[]; multipleChoice?: boolean | null; maxChoices?: number | null; expiresAt?: string | null }
): Promise<PollDoc> => {
  const post = await getVisiblePost(userId, postId);
  if (post.author.toString() !== userId) throw forbidden('Only the post author can attach a poll');
  if (await Poll.exists({ post: post._id })) throw conflict('This post already has a poll');
  const options = [...new Set(input.options.map((o) => clean(o, 100)).filter(Boolean))];
  if (options.length < 2 || options.length > 10) throw badInput('A poll needs 2 to 10 distinct options');
  const question = clean(input.question, 500);
  if (!question) throw badInput('A poll needs a question');
  let expiresAt: Date | undefined;
  if (input.expiresAt) {
    expiresAt = parseDate(input.expiresAt, 'expiry');
    if (expiresAt.getTime() <= Date.now()) throw badInput('Poll expiry must be in the future');
  }
  const multiple = !!input.multipleChoice;
  const maxChoices = multiple ? Math.min(input.maxChoices ?? options.length, options.length) : 1;
  return Poll.create({
    post: post._id,
    author: userId,
    question,
    options: options.map((text) => ({ id: new Types.ObjectId().toString(), text, votes: [], voteCount: 0 })),
    multipleChoice: multiple,
    maxChoices,
    expiresAt
  });
};

export const getPoll = async (viewerId: string | undefined, id: string): Promise<PollDoc> => {
  const poll = await Poll.findById(toObjectId(id));
  if (!poll) throw notFound('Poll');
  await getVisiblePost(viewerId, poll.post.toString());
  return poll;
};

export const pollForPost = (postId: string): Promise<PollDoc | null> => Poll.findOne({ post: toObjectId(postId) });

export const pollIsActive = (poll: IPoll): boolean => poll.isActive && (!poll.expiresAt || poll.expiresAt.getTime() > Date.now());

export const votePoll = async (userId: string, pollId: string, optionIds: string[]): Promise<PollDoc> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const poll = await getPoll(userId, pollId);
    if (!pollIsActive(poll)) throw badInput('This poll is closed');
    const chosen = [...new Set(optionIds)];
    if (!chosen.length) throw badInput('Pick at least one option');
    if (chosen.length > (poll.multipleChoice ? poll.maxChoices ?? poll.options.length : 1)) throw badInput('Too many options selected');
    if (chosen.some((c) => !poll.options.some((o) => o.id === c))) throw badInput('Unknown poll option');

    for (const option of poll.options) {
      option.votes = option.votes.filter((v) => v.toString() !== userId); // re-voting replaces the previous choice
      if (chosen.includes(option.id)) option.votes.push(new Types.ObjectId(userId));
      option.voteCount = option.votes.length;
    }
    poll.totalVotes = new Set(poll.options.flatMap((o) => o.votes.map(String))).size;
    try {
      return await poll.save();
    } catch (err) {
      if ((err as Error).name !== 'VersionError') throw err; // concurrent vote: reload and retry
    }
  }
  throw conflict('Could not record your vote, please retry');
};

export const closePoll = async (userId: string, pollId: string): Promise<PollDoc> => {
  const poll = await Poll.findById(toObjectId(pollId));
  if (!poll) throw notFound('Poll');
  if (poll.author.toString() !== userId) throw forbidden();
  poll.isActive = false;
  return poll.save();
};
