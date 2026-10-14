/**
 * DataLoaders (HLD: batch loading / N+1 prevention).
 * The loaders are created per GraphQL request in graphql/loaders.ts; this module is the public entry point.
 */
export { createLoaders } from '../graphql/loaders';
export type { Loaders, ReactionCount } from '../graphql/loaders';
