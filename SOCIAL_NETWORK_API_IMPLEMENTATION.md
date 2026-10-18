# Social Network API - Implementation

## Overview
This document describes the API integrations added to Social Network API.

## Technologies Added

### 1. tRPC
- User CRUD procedures
- Post CRUD procedures
- Follow/unfollow procedures
- Like/unlike procedures
- Comment procedures
- Feed retrieval
- Graph algorithms (shortest path, mutual friends, recommendations)
- Input validation with Zod
- Type-safe API endpoints
- Context injection

### 2. gRPC
- Protocol Buffer service definitions
- UserService (get, create, update, list)
- PostService (get, create, update, delete, feed)
- FollowService (follow, unfollow, followers, following)
- LikeService (like, unlike, likes)
- CommentService (create, list)
- GraphService (shortest path, mutual friends, recommendations)
- Strongly typed messages
- Streaming support

### 3. Neo4j
- Neo4j driver integration
- User node creation and retrieval
- Post creation with AUTHORED relationship
- FOLLOWS relationship management
- Shortest path algorithm
- Mutual friends query
- Friend-of-friend recommendations
- Feed generation with multi-hop follows
- LIKE relationship management
- Cypher query execution

### 4. JanusGraph
- Gremlin client integration
- Vertex and property management
- Edge creation (AUTHORED, FOLLOWS, LIKES)
- Traversal-based queries
- Path finding algorithms
- Deduplication
- Limit and ordering
- Multi-hop traversals
- Graph analytics

### 5. GraphQL Subscriptions
- graphql-ws protocol on `/graphql`, authenticated through the `connection_init` payload
- Posts: `postCreated` (people you follow), `postLiked`, `commentAdded`, `reactionAdded`, `feedUpdated`
- Notifications: `notificationAdded`
- Messaging: `messageSent`, `typingIndicator`, `conversationUpdated`
- Stories: `storyCreated`, `storyViewed`, `storyReactionAdded`
- Events: `eventRSVP`
- Redis PubSub (multi-instance) with an in-process fallback; membership and visibility are checked at subscribe and delivery time

## Files Created

### tRPC
- `src/trpc/router.ts` - tRPC router with procedures

### gRPC
- `src/grpc/service.proto` - Protocol Buffer service definitions (also AuthService and NotificationService)
- `src/grpc/server.ts` - gRPC server implementation (port `GRPC_PORT`, default 50051)

### Neo4j
- `src/neo4j/client.ts` - Neo4j graph database service

### JanusGraph
- `src/janusgraph/client.ts` - JanusGraph graph database service

### Graph providers
- `src/services/graph/` - `mongo`, `neo4j` and `janusgraph` providers behind one interface, chosen by `GRAPH_PROVIDER`

### GraphQL Subscriptions
- `src/graphql/subscriptions.ts` - graphql-ws server
- Subscription resolvers live with their modules in `src/graphql/modules/`

## Installation

All packages (`@trpc/server`, `zod`, `@grpc/grpc-js`, `@grpc/proto-loader`, `neo4j-driver`, `gremlin`, `@apollo/server`, `graphql-ws`) are declared in `package.json`:
```bash
npm install
npm run dev
```

## Environment Variables

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# JanusGraph
JANUSGRAPH_URL=ws://localhost:8182/gremlin

# Graph provider: mongo | neo4j | janusgraph
GRAPH_PROVIDER=neo4j

# HTTP (GraphQL, tRPC) and gRPC ports
PORT=4000
GRPC_PORT=50051
```

`NEO4J_USER` is also accepted. See `.env.example` for every variable.

## Notes
- tRPC provides end-to-end type safety
- gRPC provides high-performance RPC
- Neo4j uses Cypher for graph queries
- JanusGraph uses Gremlin for graph traversals
- GraphQL Subscriptions enable real-time updates
- Graph algorithms support social network features
