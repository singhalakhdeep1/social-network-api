/**
 * GraphQL subscriptions over WebSocket (graphql-ws protocol, `ws` transport).
 * Clients authenticate in the `connection_init` payload: { authToken: "<access token>" }.
 */
import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { GraphQLSchema } from 'graphql';
import { buildWsContext } from './context';
import { depthLimitRule } from './limits';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface SubscriptionServer {
  wsServer: WebSocketServer;
  dispose: () => Promise<void>;
  connections: () => number;
}

export const startSubscriptionServer = (httpServer: HttpServer, schema: GraphQLSchema, path = '/graphql'): SubscriptionServer => {
  const wsServer = new WebSocketServer({ server: httpServer, path });
  const server = useServer(
    {
      schema,
      context: (ctx) => buildWsContext(ctx.connectionParams as Record<string, unknown> | undefined),
      onSubscribe: async (_ctx, msg) => {
        // same depth guard as HTTP operations
        const { parse, validate } = await import('graphql');
        const document = typeof msg.payload.query === 'string' ? parse(msg.payload.query) : msg.payload.query;
        const errors = validate(schema, document, [depthLimitRule(env.maxQueryDepth)]);
        if (errors.length) return errors;
        return undefined;
      },
      onError: (_ctx, _msg, errors) => {
        logger.debug(`ws subscription error: ${errors.map((e) => e.message).join('; ')}`);
      }
    },
    wsServer
  );
  logger.info(`GraphQL subscriptions ready at ${path} (graphql-ws)`);
  return { wsServer, dispose: async () => server.dispose(), connections: () => wsServer.clients.size };
};
