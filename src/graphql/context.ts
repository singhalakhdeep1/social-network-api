/**
 * GraphQL request context, shared by HTTP and WebSocket operations.
 */
import { Request } from 'express';
import { AuthUser, authenticate, extractBearer } from '../middleware/auth';
import { createLoaders, Loaders } from './loaders';
import { StructuredLoggingService } from '../services/structured-logging/structured-logging.service';
import { unauthenticated } from '../utils/errors';

export interface Context {
  user: AuthUser | null;
  loaders: Loaders;
  ip: string;
  userAgent?: string;
  correlationId: string;
}

export const buildHttpContext = async (req: Request): Promise<Context> => {
  const user = await authenticate(extractBearer(req.headers.authorization));
  return {
    user,
    loaders: createLoaders(user?.id),
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.headers['user-agent'],
    correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? StructuredLoggingService.createCorrelationId()
  };
};

/** WebSocket context: the token comes from the graphql-ws `connection_init` payload. */
export const buildWsContext = async (connectionParams: Record<string, unknown> | undefined): Promise<Context> => {
  const raw = (connectionParams?.authToken ?? connectionParams?.Authorization ?? connectionParams?.authorization) as string | undefined;
  const user = await authenticate(raw?.replace(/^Bearer\s+/i, ''));
  return { user, loaders: createLoaders(user?.id), ip: 'ws', correlationId: StructuredLoggingService.createCorrelationId() };
};

export const authed = (ctx: Context): AuthUser => {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
};
