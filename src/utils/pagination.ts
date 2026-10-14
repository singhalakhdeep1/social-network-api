/**
 * Cursor pagination over `_id` (ObjectIds are time-ordered, so this is chronological).
 */
import { FilterQuery, Model, Types } from 'mongoose';
import { badInput } from './errors';

export interface Page<T> {
  nodes: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const encodeCursor = (id: string | Types.ObjectId): string => Buffer.from(String(id)).toString('base64url');

export const decodeCursor = (cursor?: string | null): string | undefined => {
  if (!cursor) return undefined;
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!Types.ObjectId.isValid(id)) throw badInput('Invalid cursor');
  return id;
};

export const clampLimit = (limit: number | null | undefined, fallback = 20, max = 100): number => {
  if (!limit || limit < 1) return fallback;
  return Math.min(limit, max);
};

/** Newest-first page of `model` documents matching `filter`. */
export async function paginate<T, D>(
  model: Model<D>,
  filter: FilterQuery<D>,
  options: { limit?: number | null; cursor?: string | null; direction?: 'desc' | 'asc' } = {}
): Promise<Page<T>> {
  const limit = clampLimit(options.limit);
  const direction = options.direction ?? 'desc';
  const after = decodeCursor(options.cursor);
  const query: FilterQuery<D> = { ...filter };
  if (after) {
    (query as Record<string, unknown>)._id = direction === 'desc' ? { $lt: new Types.ObjectId(after) } : { $gt: new Types.ObjectId(after) };
  }
  const docs = await model
    .find(query)
    .sort({ _id: direction === 'desc' ? -1 : 1 })
    .limit(limit + 1);
  const hasMore = docs.length > limit;
  const nodes = (hasMore ? docs.slice(0, limit) : docs) as unknown as T[];
  const last = nodes[nodes.length - 1] as unknown as { _id: Types.ObjectId } | undefined;
  return { nodes, hasMore, nextCursor: hasMore && last ? encodeCursor(last._id) : null };
}

export const toObjectId = (id: string | Types.ObjectId): Types.ObjectId => {
  if (!Types.ObjectId.isValid(String(id))) throw badInput(`Invalid id: ${id}`);
  return new Types.ObjectId(String(id));
};

export const idEquals = (a: unknown, b: unknown): boolean => String(a) === String(b);
