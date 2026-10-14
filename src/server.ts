/**
 * Social Network API — entry point.
 *
 *   MongoDB (required) · Redis (cache, rate limit, pub/sub — optional) · Elasticsearch (optional)
 *   Neo4j / JanusGraph (optional) · GraphQL + subscriptions · tRPC · gRPC
 *
 * Optional backends degrade gracefully to MongoDB / in-process implementations.
 */
import { env } from './config/env';
import logger from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { closeRedis, initRedis } from './config/redis';
import { closeElasticsearch, initElasticsearch } from './config/elasticsearch';
import { testEmailConnection } from './config/email';
import { initPubSub } from './events/pubsub';
import { graph } from './services/graph/graph.service';
import { ensureUploadDir } from './utils/uploads';
import { createApp } from './app';
import { startGrpcServer, stopGrpcServer } from './grpc/server';
import { startJobs, stopJobs } from './jobs';
import './services/webhook.service'; // registers the webhook domain-event listener

async function main(): Promise<void> {
  await connectDatabase();
  await initRedis();
  initPubSub();
  ensureUploadDir();
  await initElasticsearch();
  await graph.init();
  await testEmailConnection();

  const { httpServer, apollo } = await createApp();
  await new Promise<void>((resolve) => httpServer.listen(env.port, resolve));
  logger.info(`GraphQL ready at http://localhost:${env.port}/graphql (ws://localhost:${env.port}/graphql)`);
  logger.info(`tRPC at /trpc · metrics at /metrics · health at /health`);

  if (env.grpcEnabled) await startGrpcServer();
  startJobs();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    stopJobs();
    await stopGrpcServer().catch(() => undefined);
    await apollo.stop().catch(() => undefined);
    await graph.close();
    await closeElasticsearch();
    await closeRedis();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Failed to start: ${err.stack ?? err}`);
  process.exit(1);
});
