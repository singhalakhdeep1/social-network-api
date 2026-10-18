# Social Network API

A social network backend in TypeScript: a GraphQL API (Apollo Server 5) with WebSocket subscriptions, plus tRPC, gRPC and REST entry points over the same services. MongoDB is the primary store, Redis handles caching, rate-limit buckets and cross-instance subscriptions, Elasticsearch powers search, and the follow graph can live in MongoDB, Neo4j or JanusGraph. A Next.js 14 + Apollo Client frontend in `frontend-test/` exercises the whole API.

The design is described in [SOCIAL_NETWORK_API_HLD_LLD.md](SOCIAL_NETWORK_API_HLD_LLD.md) and [SOCIAL_NETWORK_API_IMPLEMENTATION.md](SOCIAL_NETWORK_API_IMPLEMENTATION.md).

## Features

**Accounts and profiles**
- Register, login, refresh-token rotation, logout
- Email verification, forgot/reset password, change password
- TOTP two-factor authentication
- Profiles with avatar upload, private accounts, verified badges (admins only)
- Notification preferences

**Social graph**
- Follow and unfollow, followers and following lists
- Suggested users, mutual connections, shortest connection path between two users
- Provider is chosen by `GRAPH_PROVIDER`: `mongo` (default), `neo4j` or `janusgraph`. `npm run graph:sync` copies existing follows into the graph database.

**Content**
- Posts with media, hashtags, @mentions and visibility rules
- Pin, archive, share, edit, delete
- Likes, emoji reactions, threaded comments with comment likes
- Polls
- Ranked home feed (recency + engagement), trending posts and hashtags
- Drafts, scheduled posts (published by a cron job) and a content calendar

**Stories**
- 24-hour stories with views, reactions and replies
- Highlights; a background job expires stories

**Messaging**
- One-to-one and group conversations; messages are encrypted at rest (AES-256-GCM)
- Read receipts, message reactions, typing indicators, mute and archive
- Group admin and membership management
- Live delivery over GraphQL subscriptions

**Communities**
- Groups (public or approval-based) with group posts and admins
- Events with RSVPs and live RSVP updates
- Pages with followers and page posts

**Search**
- Full-text search over posts and users, plus autocomplete
- Search history and saved searches
- Uses Elasticsearch when `ELASTICSEARCH_URL` is set and MongoDB text indexes otherwise; `npm run search:reindex` rebuilds the index

**Monetization and insights**
- Tips, creator subscription tiers and a creator dashboard
- Ads with targeting, impressions and clicks
- Stripe PaymentIntents and signed webhooks; without `STRIPE_SECRET_KEY` payments run in demo mode
- Per-user and per-post analytics, event tracking
- Outgoing webhooks with delivery log, share-to-platform links

**Notifications**
- Stored notifications with read/unread state and an unread count
- Live delivery over subscriptions, optional email delivery

**Platform**
- **DataLoader** batching on every relation (no N+1 queries)
- **Redis cache-aside** for users, posts and feeds, with an in-memory fallback
- **Token-bucket rate limiting** per user/IP in Redis, with a stricter bucket for login, register and password reset
- **Query guards**: depth limit and complexity limit on HTTP and WebSocket operations
- **Structured logging**: Winston JSON logs with request ids
- **Prometheus metrics** at `/metrics`, plus `/health` and `/ready`
- Helmet security headers, CORS allow-list, input sanitization (validator + xss)
- Runs without Redis, Elasticsearch or a graph database; each falls back to MongoDB or in-process equivalents and reports its mode in the `health` query

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js 20, TypeScript 5 |
| GraphQL | Apollo Server 5 on Express 4, graphql-ws subscriptions, graphql-upload-minimal |
| Other APIs | tRPC 10 (`/trpc`), gRPC (`src/grpc/service.proto`, port 50051), REST health/metrics/webhooks |
| Data | MongoDB (Mongoose 8), Redis (ioredis), Elasticsearch 8, Neo4j 5 / JanusGraph (Gremlin) |
| Jobs | node-cron (scheduled posts, story expiry, ads, subscription renewals) |
| Payments, email | Stripe, Nodemailer |
| Frontend | Next.js 14 (App Router), React 18, Apollo Client 3, Tailwind CSS |

## Project structure

```
social-network-api/
├── src/
│   ├── server.ts              # boots HTTP, WebSocket and gRPC servers, cron jobs
│   ├── app.ts                 # Express app: security, metrics, uploads, Stripe webhook, tRPC, GraphQL
│   ├── config/                # env, MongoDB, Redis, Elasticsearch, email
│   ├── graphql/
│   │   ├── schema.ts          # merges the modules below
│   │   ├── modules/           # user, post, story, messaging, community, content, search,
│   │   │                      # notification, insights, monetization, base
│   │   ├── context.ts         # per-request auth + DataLoaders
│   │   ├── limits.ts          # depth and complexity rules
│   │   └── subscriptions.ts   # graphql-ws server
│   ├── services/              # business logic shared by GraphQL, tRPC and gRPC
│   │   ├── cache/             # Redis cache-aside
│   │   ├── rate-limiting/     # token buckets
│   │   ├── structured-logging/
│   │   └── graph/             # mongo, neo4j and janusgraph providers
│   ├── models/                # Mongoose models
│   ├── trpc/router.ts
│   ├── grpc/                  # service.proto + server
│   ├── neo4j/, janusgraph/    # database clients
│   ├── events/pubsub.ts       # Redis or in-process PubSub
│   ├── jobs/                  # cron jobs
│   └── scripts/               # graph sync, search reindex
├── frontend-test/             # Next.js frontend (see below)
├── scripts/copy-assets.js     # copies the .proto into dist/
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Getting started

### Prerequisites

- Node.js 20+
- MongoDB 6+
- Optional: Redis 7, Elasticsearch 8, Neo4j 5 or JanusGraph

### Run locally

```bash
npm install
cp .env.example .env        # defaults work for a local MongoDB
npm run dev                 # http://localhost:4000/graphql, ws://localhost:4000/graphql, gRPC :50051

cd frontend-test
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                 # http://localhost:3100
```

With `EMAIL_HOST` unset, verification and password-reset emails are written to the API log (including the link) instead of being sent.

### Run with Docker

```bash
docker compose up --build
```

This starts the API (4000, gRPC 50051), the web app (3100), MongoDB, Redis, Elasticsearch and Neo4j. For JanusGraph instead of Neo4j:

```bash
GRAPH_PROVIDER=janusgraph docker compose --profile janusgraph up --build
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API with reload (tsx watch) |
| `npm run build` | compile to `dist/` |
| `npm start` | run the compiled API |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run graph:sync` | copy follows from MongoDB into the configured graph database |
| `npm run search:reindex` | rebuild the Elasticsearch indexes |

Frontend (`frontend-test/`): `npm run dev`, `build`, `start`, `typecheck`, `lint`.

## API

### GraphQL

Endpoint `POST /graphql`; subscriptions on the same path using the graphql-ws protocol. Send `Authorization: Bearer <accessToken>` over HTTP, and `{ "authToken": "<accessToken>" }` as the WebSocket `connection_init` payload. Multipart uploads need the `apollo-require-preflight: true` header.

```graphql
mutation {
  register(username: "ada", email: "ada@example.com", password: "Password123!") {
    accessToken
    refreshToken
    user { id username }
  }
}

query {
  feed(limit: 10) {
    items { score reason post { id content likeCount commentCount author { username } } }
    nextCursor
    hasMore
  }
}

subscription {
  messageSent(conversationId: "<id>") { id content sender { username } }
}
```

Operations by module:

| Module | Queries | Mutations | Subscriptions |
|---|---|---|---|
| user | me, user, userByUsername, suggestedUsers, mutualConnections, connectionPath | register, login, refreshToken, logout, verifyEmail, resendVerificationEmail, forgotPassword, resetPassword, changePassword, setupTwoFactor, enableTwoFactor, disableTwoFactor, updateProfile, uploadAvatar, updateNotificationPreferences, followUser, unfollowUser, setUserVerified | |
| post | post, posts, userPosts, archivedPosts, groupPosts, pagePosts, postsByHashtag, trendingHashtags, trendingPosts, feed, comments, commentReplies, poll | createPost, updatePost, deletePost, likePost, unlikePost, sharePost, pinPost, unpinPost, archivePost, unarchivePost, addComment, deleteComment, likeComment, unlikeComment, addReaction, removeReaction, createPoll, votePoll, closePoll | postCreated, postLiked, commentAdded, reactionAdded, feedUpdated |
| story | storyTray, myStories, archivedStories, userStories, story, userStoryHighlights | createStory, viewStory, addStoryReaction, addStoryReply, deleteStory, createStoryHighlight, deleteStoryHighlight, addToHighlight, removeFromHighlight | storyCreated, storyViewed, storyReactionAdded |
| messaging | conversations, conversation, messages, searchMessages | createConversation, sendMessage, markConversationRead, deleteMessage, reactToMessage, setTypingIndicator, archiveConversation, muteConversation, unmuteConversation, updateGroupInfo, add/removeConversationMember, add/removeConversationAdmin, leaveConversation | messageSent, typingIndicator, conversationUpdated |
| community | group, groups, myGroups, event, events, myEvents, page, pages, myPages, followedPages | create/update/deleteGroup, join/leaveGroup, approveGroupMember, add/removeGroupMember, add/removeGroupAdmin, create/update/deleteEvent, rsvpEvent, cancelEventRSVP, create/update/deletePage, follow/unfollowPage, add/removePageAdmin | eventRSVP |
| content | myDraftPosts, myScheduledPosts, contentCalendar | create/update/delete/publishDraft, schedulePost, updateScheduledPost, deleteScheduledPost, publishScheduledPost | |
| search | search, searchPosts, searchUsers, autocompleteSuggestions, searchHistory, savedSearches | createSavedSearch, deleteSavedSearch, clearSearchHistory | |
| notification | notifications, unreadNotificationCount | markNotificationAsRead, markAllNotificationsAsRead | notificationAdded |
| insights | myAnalytics, userAnalytics, postEngagement, myWebhooks, webhook, webhookEvents | trackEvent, create/update/deleteWebhook, shareToPlatform | |
| monetization | paymentMode, subscriptionTiers, myTips, receivedTips, mySubscriptions, mySubscribers, myAds, ad, adsForYou, creatorDashboard | sendTip, create/update/cancelSubscription, create/update/pause/resume/deleteAd, recordAdImpression, recordAdClick | |
| base | health, ping, serverTime | | |

### tRPC

Mounted at `/trpc` with routers `auth`, `user`, `post`, `follow`, `like`, `comment`, `graph`, `notification` and `search`; the router type is exported from `src/trpc/router.ts` for typed clients.

### gRPC

`src/grpc/service.proto` defines `AuthService`, `UserService`, `PostService` (including the server-streamed `StreamNewPosts`), `FollowService`, `LikeService`, `CommentService`, `GraphService` and `NotificationService` (with `StreamNotifications`). Authenticated calls pass `authorization: Bearer <token>` metadata. Set `GRPC_ENABLED=false` to turn the server off.

### REST

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /ready` | readiness: 200 when MongoDB is connected, also reports Redis and search mode |
| `GET /metrics` | Prometheus: `http_requests_total`, `graphql_operation_duration_seconds`, `graphql_ws_connections`, Node.js defaults |
| `GET /uploads/*` | uploaded media |
| `POST /webhooks/stripe` | Stripe payment events (signature checked) |

## Frontend

`frontend-test/` is a Next.js 14 App Router client using Apollo Client with an HTTP upload link and a graphql-ws link. Pages: home feed with composer, explore, post detail, profiles, hashtag pages, search, notifications, messages (live chat with typing indicators), stories, groups, events, pages, drafts and scheduling, creator dashboard (tips, subscriptions, ads), settings (profile, avatar, 2FA, notification preferences, password), admin, email verification and password reset. Tokens are kept in localStorage and refreshed shortly before expiry; signing in or out creates a fresh Apollo client so no cached data or socket carries over between users.

## Configuration

Every variable is listed with its default in [.env.example](.env.example). In production `JWT_SECRET` and `JWT_REFRESH_SECRET` are required; also set `MESSAGE_ENCRYPTION_KEY`, `CORS_ORIGINS` and `PUBLIC_URL`.

## Verification

Checked locally against real MongoDB 6, Redis 5 (Windows build), Elasticsearch 8.17, Neo4j 5.26 and TinkerPop Gremlin Server 3.7 (standing in for JanusGraph): GraphQL queries, mutations, uploads and subscriptions, tRPC, gRPC (including streams), and running with and without Redis. The frontend was exercised in a browser with two signed-in users (posting, likes, comments, live notifications, live direct messages and typing, stories, avatar upload, 2FA setup, drafts, groups, events and RSVPs, tips and the creator dashboard, search, sign-out). Not exercised here: real Stripe charges (demo mode and signature handling only), a real SMTP server, and the Docker images (no Docker daemon on the development machine).

## License

Proprietary. All rights reserved.

## Author

**Alakhdeep Singh** · GitHub [@Alakhdeepsingh](https://github.com/Alakhdeepsingh)
