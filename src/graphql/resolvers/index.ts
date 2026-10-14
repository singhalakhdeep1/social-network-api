/**
 * Resolver assembly. Each feature module exports `typeDefs` + `resolvers`; this file deep-merges
 * the root types (Query / Mutation / Subscription) and keeps object-type resolvers separate.
 */
import * as base from '../modules/base';
import * as user from '../modules/user';
import * as post from '../modules/post';
import * as notification from '../modules/notification';
import * as search from '../modules/search';
import { extendedResolvers, extendedTypeDefs } from './extended';

const coreModules = [base, user, post, notification, search];

export const typeDefs: string[] = [...coreModules.map((m) => m.typeDefs), ...extendedTypeDefs];

type ResolverMap = Record<string, unknown>;
const allResolvers: ResolverMap[] = [...coreModules.map((m) => m.resolvers as ResolverMap), ...(extendedResolvers as ResolverMap[])];

export const resolvers: ResolverMap = allResolvers.reduce<ResolverMap>((merged, mod) => {
  for (const [typeName, fields] of Object.entries(mod)) {
    const existing = merged[typeName];
    const isPlainObject = typeof fields === 'object' && fields !== null && Object.getPrototypeOf(fields) === Object.prototype;
    if (isPlainObject && existing && typeof existing === 'object') {
      for (const key of Object.keys(fields as ResolverMap)) {
        if (key in (existing as ResolverMap)) throw new Error(`Duplicate resolver ${typeName}.${key}`);
      }
      merged[typeName] = { ...(existing as ResolverMap), ...(fields as ResolverMap) };
    } else {
      merged[typeName] = fields;
    }
  }
  return merged;
}, {});
