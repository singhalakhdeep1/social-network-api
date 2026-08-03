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
**Location:** `src/graphql/` (Already exists)

**Description:** GraphQL API for flexible social network data querying.

#### 2. Graph Database (Neo4j/JanusGraph)
**Location:** `src/neo4j/`, `src/janusgraph/` (Already exists)

**Description:** Graph database integration for social graph operations.

#### 3. gRPC Services
**Location:** `src/grpc/` (Already exists)

**Description:** gRPC-based microservice communication.

#### 4. tRPC API
**Location:** `src/trpc/` (Already exists)

**Description:** tRPC for type-safe API communication.

#### 5. Data Loaders
**Location:** `src/dataloaders/` (Already exists)

**Description:** Data loaders for efficient batch loading and N+1 query prevention.

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
└─────────────────────────────────────────────────────────────┘
```

## Configuration

Environment variables:

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Rate Limiting
RATE_LIMIT_BUCKET_CAPACITY=100
RATE_LIMIT_REFILL_RATE=1

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# JanusGraph
JANUSGRAPH_HOST=localhost
JANUSGRAPH_PORT=8182
```

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
