/**
 * Who may see which posts. Hides posts from private accounts the viewer does not follow,
 * posts in private groups the viewer has not joined, and rejected / pending moderation content.
 * Archived posts are hidden here too (owners reach them through the dedicated query).
 */
import { FilterQuery, Types } from 'mongoose';
import User from '../models/User';
import Group from '../models/Group';
import { IPost } from '../models/Post';
import { followingIds } from './follow.service';
import { cache } from './cache/cache.service';

export const visibilityFilter = async (viewerId?: string, options: { includeArchived?: boolean } = {}): Promise<FilterQuery<IPost>> => {
  const filter: FilterQuery<IPost> = { moderationStatus: 'approved' };
  if (!options.includeArchived) filter.isArchived = false;

  const hidden = await cache.getOrSetJSON<{ authors: string[]; groups: string[] }>(
    `visibility:${viewerId ?? 'anon'}`,
    async () => {
      const visibleAuthors = viewerId ? [viewerId, ...(await followingIds(viewerId))] : [];
      const [authors, groups] = await Promise.all([
        User.find({ isPrivate: true, _id: { $nin: visibleAuthors.map((i) => new Types.ObjectId(i)) } }).distinct('_id'),
        Group.find({ isPrivate: true, ...(viewerId ? { members: { $ne: new Types.ObjectId(viewerId) } } : {}) }).distinct('_id')
      ]);
      return { authors: authors.map(String), groups: groups.map(String) };
    },
    20
  );

  if (hidden.authors.length) filter.author = { $nin: hidden.authors.map((i) => new Types.ObjectId(i)) };
  if (hidden.groups.length) filter.group = { $nin: hidden.groups.map((i) => new Types.ObjectId(i)) };
  return filter;
};

export const invalidateVisibility = async (viewerId: string): Promise<void> => {
  await cache.delete(`visibility:${viewerId}`);
};

/** Profile-level content (stories, highlights) follows the account's privacy: public, owner, or follower. */
export const canViewUserContent = async (viewerId: string | undefined, ownerId: string): Promise<boolean> => {
  if (viewerId === ownerId) return true;
  const owner = await User.findById(ownerId).select('isPrivate');
  if (!owner) return false;
  if (!owner.isPrivate) return true;
  if (!viewerId) return false;
  return (await followingIds(viewerId)).includes(ownerId);
};
