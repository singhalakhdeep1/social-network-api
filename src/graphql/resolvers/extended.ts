/**
 * Extended feature modules: messaging, stories, content management, communities,
 * monetization and integrations/analytics. (Core modules live in ./index.ts.)
 */
import * as messaging from '../modules/messaging';
import * as story from '../modules/story';
import * as content from '../modules/content';
import * as community from '../modules/community';
import * as monetization from '../modules/monetization';
import * as insights from '../modules/insights';

export const extendedModules = [messaging, story, content, community, monetization, insights];

export const extendedTypeDefs: string[] = extendedModules.map((m) => m.typeDefs);
export const extendedResolvers = extendedModules.map((m) => m.resolvers);
