/**
 * HTTP application: GraphQL (Apollo Server 5) + WebSocket subscriptions, tRPC, Stripe webhook,
 * uploads, health and Prometheus metrics.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import http, { Server as HttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { GraphQLFormattedError } from 'graphql';
import { env } from './config/env';
import { esEnabled } from './config/elasticsearch';
import { isRedisReady } from './config/redis';
import { schema } from './graphql/schema';
import { Context, buildHttpContext } from './graphql/context';
import { complexityPlugin, depthLimitRule, loggingPlugin, rateLimitPlugin } from './graphql/limits';
import { SubscriptionServer, startSubscriptionServer } from './graphql/subscriptions';
import { router } from './trpc/router';
import { authenticate, extractBearer } from './middleware/auth';
import { parseStripeWebhook } from './services/payment.service';
import { applyPayment } from './services/monetization.service';
import { uploadRoot } from './utils/uploads';
import { AppError } from './utils/errors';
import logger from './utils/logger';

export interface RunningApp {
  app: Express;
  httpServer: HttpServer;
  apollo: ApolloServer<Context>;
  subscriptions: SubscriptionServer;
}

export const createApp = async (): Promise<RunningApp> => {
  const app = express();
  const httpServer = http.createServer(app);
  if (env.isProd) app.set('trust proxy', 1);

  // ---------------------------------------------------------------- metrics
  if (env.enableMetrics) client.collectDefaultMetrics();
  const httpRequests = new client.Counter({ name: 'http_requests_total', help: 'HTTP requests', labelNames: ['method', 'route', 'status_code'] });
  const gqlDuration = new client.Histogram({
    name: 'graphql_operation_duration_seconds',
    help: 'GraphQL operation latency',
    labelNames: ['operation', 'type', 'outcome'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
  });
  const wsGauge = new client.Gauge({ name: 'graphql_ws_connections', help: 'Open GraphQL WebSocket connections', collect() { this.set(subscriptions.connections()); } });
  void wsGauge;

  app.use((req, res, next) => {
    res.on('finish', () => {
      const route = req.route?.path ?? (req.baseUrl || req.path.split('/').slice(0, 2).join('/'));
      httpRequests.inc({ method: req.method, route, status_code: res.statusCode });
    });
    next();
  });

  // ---------------------------------------------------------------- security
  app.use(
    helmet({
      contentSecurityPolicy: env.isProd ? undefined : false, // Apollo's local landing page needs inline scripts in dev
      crossOriginResourcePolicy: { policy: 'cross-origin' } // /uploads media is loaded by the frontend origin
    })
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/health' || req.path === '/metrics' }));

  // ---------------------------------------------------------------- ops endpoints
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: Math.floor(process.uptime()) }));
  app.get('/ready', (_req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    res.status(mongo ? 200 : 503).json({ ready: mongo, mongo, redis: isRedisReady(), search: esEnabled() ? 'elasticsearch' : 'mongodb' });
  });
  if (env.enableMetrics) {
    app.get('/metrics', async (_req, res) => {
      res.set('Content-Type', client.register.contentType);
      res.end(await client.register.metrics());
    });
  }

  // ---------------------------------------------------------------- uploads
  app.use('/uploads', express.static(uploadRoot(), { maxAge: '7d', immutable: true, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  // ---------------------------------------------------------------- Stripe webhook (needs the raw body)
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const event = parseStripeWebhook(req.body as Buffer, req.header('stripe-signature'));
      if (event) await applyPayment(event);
      res.json({ received: true });
    } catch (err) {
      logger.warn(`Stripe webhook rejected: ${(err as Error).message}`);
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------- tRPC
  app.use(
    '/trpc',
    createExpressMiddleware({
      router,
      createContext: async ({ req }) => ({
        user: await authenticate(extractBearer(req.headers.authorization)),
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent']
      })
    })
  );

  // ---------------------------------------------------------------- GraphQL
  const subscriptions = startSubscriptionServer(httpServer, schema);

  const apollo = new ApolloServer<Context>({
    schema,
    introspection: !env.isProd,
    csrfPrevention: true,
    includeStacktraceInErrorResponses: false,
    validationRules: [depthLimitRule(env.maxQueryDepth)],
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      { async serverWillStart() { return { async drainServer() { await subscriptions.dispose(); } }; } },
      env.isProd ? ApolloServerPluginLandingPageDisabled() : ApolloServerPluginLandingPageLocalDefault({ embed: true, includeCookies: false }),
      rateLimitPlugin(),
      complexityPlugin(),
      loggingPlugin((operation, type, seconds, failed) => gqlDuration.observe({ operation: operation.slice(0, 60), type, outcome: failed ? 'error' : 'ok' }, seconds))
    ],
    formatError: (formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
      const code = (formatted.extensions?.code as string | undefined) ?? 'INTERNAL_SERVER_ERROR';
      const original = (error as { originalError?: unknown }).originalError ?? error;
      // Never leak internals: unexpected errors become a generic message (details are logged by loggingPlugin).
      if (code === 'INTERNAL_SERVER_ERROR' && !(original instanceof AppError)) {
        return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' }, path: formatted.path };
      }
      return { message: formatted.message, path: formatted.path, extensions: { code, ...(formatted.extensions?.retryAfterSeconds ? { retryAfterSeconds: formatted.extensions.retryAfterSeconds } : {}) } };
    }
  });
  await apollo.start();

  app.use(
    '/graphql',
    graphqlUploadExpress({ maxFileSize: env.maxFileSize, maxFiles: 10 }),
    express.json({ limit: '1mb' }),
    expressMiddleware(apollo, { context: async ({ req }) => buildHttpContext(req) })
  );

  // anything else
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(`Unhandled HTTP error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, httpServer, apollo, subscriptions };
};
