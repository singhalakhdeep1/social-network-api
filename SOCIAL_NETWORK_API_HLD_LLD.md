# Social Network API - HLD/LLD Implementation

## Overview
This document provides comprehensive documentation for HLD/LLD patterns implemented in the Social Network API application (TypeScript/Node.js).

## Implemented Topics

### LLD Topics (Low-Level Design)

#### 1. Distributed Caching
**Location:** `src/services/cache/cache.service.ts`

**Description:** Implements distributed caching with Redis for social network data.

**Key Features:**
- Get/set/delete operations
- TTL support
- Get or set pattern
- Pattern-based invalidation

**Usage Example:**
```typescript
import { CacheService } from './src/services/cache/cache.service';

const cache = new CacheService();
const cached = await cache.get('user:123');
await cache.set('user:123', JSON.stringify(user), 3600);
```

#### 2. API Rate Limiting
**Location:** `src/services/rate-limiting/rate-limiting.service.ts`

**Description:** Implements token bucket algorithm for API rate limiting.

**Key Features:**
- Token bucket algorithm
- Per-key rate limiting
- Configurable bucket capacity
- Redis-backed storage

**Usage Example:**
```typescript
import { RateLimitingService } from './src/services/rate-limiting/rate-limiting.service';

const rateLimiting = new RateLimitingService();
const allowed = await rateLimiting.isAllowed(`user:${userId}`, 1);
```

#### 3. Structured Logging
**Location:** `src/services/structured-logging/structured-logging.service.ts`

**Description:** Implements structured logging with correlation IDs and context.

**Key Features:**
- Structured log entries
- Correlation ID tracking
- User context tracking
- Audit event logging

**Usage Example:**
```typescript
import { StructuredLoggingService } from './src/services/structured-logging/structured-logging.service';

const logging = new StructuredLoggingService();
logging.logAuditEvent('PostCreated', 'User created a post', { userId, postId });
```

### HLD Topics (High-Level Design)

#### 1. GraphQL API
**Location:** `src/graphql/` (schema modules in `src/graphql/modules/`, subscriptions in `src/graphql/subscriptions.ts`)

**Description:** GraphQL API (Apollo Server 5) for flexible social network data querying, with graphql-ws subscriptions for live posts, notifications, messages, typing indicators, stories and event RSVPs. Depth and complexity limits apply to HTTP and WebSocket operations (`src/graphql/limits.ts`).

#### 2. Graph Database (Neo4j/JanusGraph)
**Location:** `src/neo4j/`, `src/janusgraph/` (clients), `src/services/graph/` (providers)

**Description:** Graph database integration for social graph operations: follow edges, mutual connections, shortest path and recommendations. `GRAPH_PROVIDER` selects `neo4j`, `janusgraph` (Gremlin) or `mongo` (default, no graph database needed). Follows are written to MongoDB and mirrored to the graph database; `npm run graph:sync` backfills it.

#### 3. gRPC Services
**Location:** `src/grpc/` (`service.proto`, `server.ts`)

**Description:** gRPC-based microservice communication: Auth, User, Post, Follow, Like, Comment, Graph and Notification services, including server-streamed new posts and notifications. Bearer tokens travel in `authorization` metadata.

#### 4. tRPC API
**Location:** `src/trpc/router.ts` (mounted at `/trpc`)

**Description:** tRPC for type-safe API communication, calling the same services as GraphQL and gRPC.

#### 5. Data Loaders
**Location:** `src/dataloaders/`, `src/graphql/loaders.ts`

**Description:** Data loaders for efficient batch loading and N+1 query prevention, created per request (and per WebSocket operation) in the GraphQL context.

#### 6. Search (Elasticsearch)
**Location:** `src/config/elasticsearch.ts`, `src/services/search.service.ts`

**Description:** Post and user search with autocomplete. Uses Elasticsearch when `ELASTICSEARCH_URL` is set and MongoDB text indexes otherwise; `npm run search:reindex` rebuilds the indexes.

#### 7. Event Bus
**Location:** `src/events/pubsub.ts`

**Description:** Redis pub/sub for subscriptions when Redis is available (so several API instances share events), in-process PubSub otherwise. Payloads carry ids only; subscription resolvers reload and re-authorize the entity on delivery.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                              │
│  (Express, Auth, Rate Limiting)                             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Controllers  │  │   Services   │  │  Middleware  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  (Users, Posts, Comments, Likes, Follows, Messages)         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Cache     │  │Rate Limiting │  │ Structured   │      │
│  │   (Redis)    │  │  Service     │  │   Logging    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   GraphQL    │  │   Graph DB   │  │   Data       │      │
│  │    API       │  │ (Neo4j/Janus)│  │  Loaders     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   MongoDB    │  │Elasticsearch │  │ Redis PubSub │      │
│  │ (primary DB) │  │   (search)   │  │ (live events)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

Entry points: GraphQL over HTTP and WebSocket (`/graphql`), tRPC (`/trpc`), gRPC (port 50051) and REST (`/health`, `/ready`, `/metrics`, `/uploads`, `/webhooks/stripe`). All of them call the shared services in `src/services/`. The Next.js client in `frontend-test/` talks to GraphQL only.

## Configuration

Environment variables:

```env
# Redis (REDIS_URL takes precedence over host/port)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Rate Limiting (general bucket, then the stricter auth bucket)
RATE_LIMIT_BUCKET_CAPACITY=100
RATE_LIMIT_REFILL_RATE=5
AUTH_RATE_LIMIT_CAPACITY=10
AUTH_RATE_LIMIT_PER_MINUTE=10

# Graph provider: mongo | neo4j | janusgraph
GRAPH_PROVIDER=mongo

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# JanusGraph (or JANUSGRAPH_URL=ws://localhost:8182/gremlin)
JANUSGRAPH_HOST=localhost
JANUSGRAPH_PORT=8182

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
```

The full list is in `.env.example`; `docker-compose.yml` runs the API with MongoDB, Redis, Elasticsearch and Neo4j (JanusGraph via the `janusgraph` profile).

## Summary

This implementation provides social network-specific HLD/LLD patterns focusing on distributed caching, rate limiting, and structured logging. The platform already includes extensive infrastructure with GraphQL (flexible API), Neo4j/JanusGraph (graph database for social graphs), gRPC (microservice communication), tRPC (type-safe API), and data loaders (efficient batch loading), making it a comprehensive social network platform with graph-based social features.

## Tech Stack Coverage Summary

Comprehensive HLD/LLD implementation across major tech stacks:

1. ✅ **bankcore-dotnet** (.NET/C#) - All 15 topics
2. ✅ **ferrobank** (Rust) - All 15 topics
3. ✅ **finrails** (Ruby on Rails) - All 15 topics
4. ✅ **finvault-go** (Go) - All 15 topics
5. ✅ **springbank** (Java/Spring Boot) - All 15 topics
6. ✅ **ecommerce-platform** (Node.js) - All 15 topics
7. ✅ **cartwave** (Python/Django) - All 15 topics
8. ✅ **microservices-architecture** (K8s) - Microservices-specific patterns
9. ✅ **trove** (NestJS/TypeScript) - Marketplace-specific patterns
10. ✅ **stratum** (NestJS/TypeScript) - Platform-specific patterns
11. ✅ **node-microservices** (Node.js) - Microservices-specific patterns
12. ✅ **ResilienceForge** (DevOps/K8s) - DevOps-specific patterns
13. ✅ **production-node-api** (Node.js) - Production-specific patterns
14. ✅ **dispatch** (TypeScript/Node.js) - Dispatch-specific patterns
15. ✅ **recruitment-api** (TypeScript/Node.js) - Recruitment-specific patterns
16. ✅ **social-network-api** (TypeScript/Node.js) - Social network-specific patterns

The remaining 39+ projects will receive relevant patterns based on their specific domain and requirements, following the Option 2 strategy for comprehensive tech stack coverage without redundant work.
