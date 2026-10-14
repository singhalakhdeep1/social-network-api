/**
 * `npm run graph:sync` — pushes users, follows, posts and likes from MongoDB into Neo4j / JanusGraph
 * (GRAPH_PROVIDER=neo4j|janusgraph). Idempotent: safe to re-run.
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { graph } from '../services/graph/graph.service';
import { syncGraph } from '../services/maintenance.service';
import logger from '../utils/logger';

(async () => {
  await connectDatabase();
  await graph.init();
  const counts = await syncGraph();
  logger.info(`Graph sync complete: ${counts.users} users, ${counts.follows} follows, ${counts.posts} posts, ${counts.likes} likes`);
  await graph.close();
  await disconnectDatabase();
})().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
