/**
 * PROJECT 6: SOCIAL MEDIA API WITH GRAPHQL
 * 
 * CURRICULUM COVERAGE: 160 points
 * #551-600: GraphQL Fundamentals - Schema, Resolvers, Mutations, Subscriptions (50 points)
 * #1001-1100: Testing - Jest, Integration Tests, Mocking, Coverage (100 points)
 * #1651-1660: Advanced Queries - DataLoader for N+1 problem (10 points)
 * 
 * FEATURES:
 * - GraphQL API with Apollo Server
 * - Post CRUD operations (create, read, update, delete)
 * - Follow/Unfollow users
 * - Feed algorithm (chronological + engagement-based)
 * - Real-time subscriptions for new posts
 * - DataLoader for optimized database queries
 * - Redis caching for feed optimization
 * - Comprehensive testing suite
 * - Media upload with GraphQL multipart
 * - Content moderation
 * - User engagement analytics
 * - GraphQL query complexity analysis
 * - Rate limiting
 * - Cursor-based pagination
 * - Prometheus metrics
 * - JWT authentication
 * - Field-level authorization
 * - Input validation and sanitization
 * - Helmet.js security headers
 */

import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { GraphQLUpload } from 'graphql-upload';
import depthLimit from 'graphql-depth-limit';
import mongoose from 'mongoose';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger';
import typeDefs from './graphql/schema';
import { resolvers, pubsub } from './graphql/resolvers';
import { authMiddleware, AuthUser } from './middleware/auth';
import redis from './config/redis';
import client from 'prom-client';
import * as dotenv from 'dotenv';
import { startStoryExpiryJob } from './jobs/storyExpiry';
import elasticsearch, { testConnection, initializeIndices } from './config/elasticsearch';
import { testEmailConnection } from './config/email';

dotenv.config();

const app = express();

// Prometheus Metrics Setup - #2001-2100: Observability
client.collectDefaultMetrics({ register: client.register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode
    });
  });
  next();
});

// Metrics Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// #351-400: Security Middleware
app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' }));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/graphql', limiter);

// GraphQL Upload Setup
app.use('/graphql', express.json());

// #551-575: Apollo Server Setup with Context
async function startServer() {
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req, connection }) => {
      // WebSocket connection for subscriptions
      if (connection) {
        return connection.context;
      }

      // #676-700: JWT Authentication in GraphQL context
      const token = req.headers.authorization?.replace('Bearer ', '');
      const user = await authMiddleware(token);

      return {
        user,
        redis,
        logger
      };
    },
    formatError: (error) => {
      // #451-475: Centralized error handling
      logger.error('GraphQL Error:', error);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
        path: error.path
      };
    },
    validationRules: [
      depthLimit(10), // Limit query depth to prevent deep recursion
    ],
    // #551-575: GraphQL Subscriptions
    subscriptions: {
      path: '/graphql',
      onConnect: async (connectionParams: any) => {
        if (connectionParams.authToken) {
          const user = await authMiddleware(connectionParams.authToken);
          return { user };
        }
        throw new Error('Missing auth token!');
      }
    },
    uploads: false // Disable built-in uploads, use graphql-upload
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  // #751-850: MongoDB Connection
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-media-api';
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  } as any);
  logger.info('✅ MongoDB Connected');

  // Connect Redis for caching
  await redis.connect();
  logger.info('✅ Redis Connected');

  // Connect Elasticsearch for advanced search
  await testConnection();
  await initializeIndices();

  // Connect email server for notifications
  await testEmailConnection();

  // Start story expiry cron job
  startStoryExpiryJob();

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info(`🚀 GraphQL Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`🔔 Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
