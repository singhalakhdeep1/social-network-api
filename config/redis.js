/**
 * REDIS CLIENT CONFIGURATION
 * 
 * CURRICULUM COVERAGE:
 * #1136-1145: Redis for Caching
 */

const redis = require('redis');
const logger = require('../utils/logger');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
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

module.exports = client;
