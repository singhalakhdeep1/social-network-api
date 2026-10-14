/**
 * Executable GraphQL schema.
 */
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs, resolvers } from './resolvers';

export const schema = makeExecutableSchema({
  typeDefs,
  // field resolvers are typed loosely per module; the schema validates the shapes at build time
  resolvers: resolvers as never
});

export default schema;
