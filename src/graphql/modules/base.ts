/**
 * Shared scalars, root types and small helpers used by every module.
 */
import { GraphQLScalarType, Kind } from 'graphql';
import { GraphQLUpload } from 'graphql-upload-minimal';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { esEnabled } from '../../config/elasticsearch';
import { isRedisReady } from '../../config/redis';
import { graph } from '../../services/graph/graph.service';
import { paymentMode } from '../../services/payment.service';
import { emailMode } from '../../config/email';

export const typeDefs = /* GraphQL */ `
  scalar Upload
  scalar DateTime

  type Media {
    url: String!
    type: String!
    thumbnail: String
  }

  type ReactionCount {
    emoji: String!
    count: Int!
  }

  type Health {
    status: String!
    uptimeSeconds: Int!
    mongo: Boolean!
    redis: Boolean!
    search: String!
    graph: String!
    payments: String!
    email: String!
  }

  type Query {
    health: Health!
  }

  type Mutation {
    ping: Boolean!
  }

  type Subscription {
    serverTime: String!
  }
`;

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 timestamp',
  serialize: (value) => (value instanceof Date ? value.toISOString() : new Date(value as string).toISOString()),
  parseValue: (value) => new Date(value as string),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null)
});

export const resolvers = {
  Upload: GraphQLUpload,
  DateTime,
  Query: {
    health: () => ({
      status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      mongo: mongoose.connection.readyState === 1,
      redis: isRedisReady(),
      search: esEnabled() ? 'elasticsearch' : 'mongodb',
      graph: graph.active ? graph.providerName : 'mongodb',
      payments: paymentMode(),
      email: emailMode()
    })
  },
  Mutation: {
    ping: () => true
  },
  Subscription: {
    serverTime: {
      async *subscribe() {
        for (let i = 0; i < 5; i++) {
          yield { serverTime: new Date().toISOString() };
          await new Promise((r) => setTimeout(r, env.isProd ? 5000 : 1000));
        }
      }
    }
  }
};
