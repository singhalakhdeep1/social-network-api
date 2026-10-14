/**
 * `npm run search:reindex` — rebuilds the Elasticsearch indices from MongoDB.
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { closeElasticsearch, initElasticsearch } from '../config/elasticsearch';
import { reindexSearch } from '../services/maintenance.service';
import logger from '../utils/logger';

(async () => {
  await connectDatabase();
  if (!(await initElasticsearch())) {
    logger.error('Set ELASTICSEARCH_URL to a reachable cluster first');
    process.exit(1);
  }
  const counts = await reindexSearch();
  logger.info(`Reindexed ${counts.posts} posts and ${counts.users} users`);
  await closeElasticsearch();
  await disconnectDatabase();
})().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
