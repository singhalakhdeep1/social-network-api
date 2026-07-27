/**
 * REDIS CLIENT CONFIGURATION
 * 
 * CURRICULUM COVERAGE:
 * #1136-1145: Redis for Caching
 */

import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

const client: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        logger.error('Redis reconnection limit reached');
        return new Error('Redis connection failed');
      }
      return retries * 100;
    }
  }
});

client.on('error', (err) => logger.error('Redis Client Error:', err));
client.on('connect', () => logger.info('✅ Redis Client Connected'));

export default client;
