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
 */

const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const mongoose = require('mongoose');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const { authMiddleware } = require('./middleware/auth');
const redis = require('./config/redis');
const client = require('prom-client');
require('dotenv').config();

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

// #551-600: Apollo Server Setup with Context
async function startServer() {
    const httpServer = http.createServer(app);

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
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
        // #551-575: GraphQL Subscriptions
        subscriptions: {
            path: '/graphql',
            onConnect: async (connectionParams) => {
                if (connectionParams.authToken) {
                    const user = await authMiddleware(connectionParams.authToken);
                    return { user };
                }
                throw new Error('Missing auth token!');
            }
        }
    });

    await server.start();
    server.applyMiddleware({ app, path: '/graphql' });

    // #751-850: MongoDB Connection
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-media-api';
    await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    logger.info('✅ MongoDB Connected');

    // Connect Redis for caching
    await redis.connect();
    logger.info('✅ Redis Connected');

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

module.exports = app;
