# Social Network API

A social media API built with GraphQL, Apollo Server, and MongoDB featuring real-time subscriptions, feed algorithms, and optimized data loading.

## Overview

A full-stack social media application with GraphQL API and Next.js frontend. The backend is built with Apollo Server, MongoDB, and Redis, featuring feed algorithms, real-time subscriptions, DataLoader for query optimization, and comprehensive analytics. The entire codebase has been converted to TypeScript for type safety and better developer experience.

## Features

### Core Features
- **Post Management**: Create, update, delete, pin, archive posts with media support
- **User Profiles**: Avatars, bios, follower/following counts, profile pages
- **Follow System**: Bidirectional follow relationships with notifications
- **Smart Feed Algorithm**: Personalized feed combining recency and engagement scoring
- **Nested Comments**: Threaded comment system with replies
- **Emoji Reactions**: Multiple emoji reactions on posts and comments
- **Hashtag Tracking**: Automatic hashtag extraction and trending hashtags
- **User Mentions**: @username parsing with mention notifications
- **Real-time Subscriptions**: Live updates for posts, likes, comments, reactions
- **Notifications**: Comprehensive notification system with read/unread status
- **Analytics Dashboard**: User engagement metrics and analytics

### Technical Features
- **TypeScript**: Full TypeScript conversion for type safety
- **DataLoader**: N+1 query optimization with batch loading
- **Redis Caching**: Performance optimization for feeds and posts
- **GraphQL Multipart Upload**: Media upload handling
- **Content Moderation**: Automated content filtering
- **Input Validation**: Sanitization and validation using validator and xss
- **Query Complexity Analysis**: Depth limiting for GraphQL queries
- **Rate Limiting**: Per-IP rate limiting on API endpoints
- **Cursor-based Pagination**: Efficient pagination for large datasets
- **Prometheus Metrics**: HTTP request and operation metrics
- **JWT Authentication**: Secure token-based authentication
- **Field-level Authorization**: Granular permission checks
- **Helmet.js**: Security headers for Express
- **Winston Logging**: Structured logging with file and console transports

## Tech Stack

### Backend
- Node.js 18.x
- TypeScript 5.3.x
- GraphQL 16.8.x
- Apollo Server 3.13.x
- Express.js 4.18.x
- MongoDB 6.0+
- Mongoose 8.0.x
- Redis 7.x
- DataLoader 2.2.x
- JWT 9.0.x
- Winston 3.11.x
- Prometheus 15.1.x
- graphql-upload 16.0.x
- graphql-depth-limit 1.1.0
- validator 13.11.x
- xss 1.0.14

### Frontend
- Next.js 14.x
- TypeScript 5.3.x
- React 18.x
- Apollo Client 3.8.x
- graphql-ws 5.14.x
- TailwindCSS 3.4.x
- Lucide React 0.303.x
- date-fns 3.0.x

## Project Structure

```
social-network-api/
├── src/                      # TypeScript source files
│   ├── config/
│   │   └── redis.ts          # Redis configuration
│   ├── dataloaders/
│   │   └── index.ts          # DataLoader for N+1 optimization
│   ├── graphql/
│   │   ├── schema.ts         # GraphQL schema definition
│   │   └── resolvers/
│   │       └── index.ts      # All resolvers (queries, mutations, subscriptions)
│   ├── middleware/
│   │   ├── auth.ts           # JWT authentication
│   │   └── validation.ts     # Input validation & sanitization
│   ├── models/
│   │   ├── User.ts           # User schema with auth methods
│   │   ├── Post.ts           # Post schema with media, hashtags, mentions
│   │   ├── Comment.ts        # Comment schema with nested replies
│   │   ├── Notification.ts   # Notification schema
│   │   ├── AnalyticsEvent.ts # Analytics tracking schema
│   │   └── Reaction.ts       # Emoji reactions schema
│   ├── utils/
│   │   └── logger.ts         # Winston logger
│   └── server.ts             # Entry point with Apollo Server
├── frontend-test/            # Next.js TypeScript frontend
│   ├── app/
│   │   ├── layout.tsx        # Root layout with Apollo Provider
│   │   └── page.tsx          # Main page with all features
│   ├── lib/
│   │   ├── apollo-client.ts  # Apollo Client setup
│   │   └── graphql-queries.ts # GraphQL queries & mutations
│   └── package.json
├── tests/                    # Test files
├── dist/                     # Compiled JavaScript (generated)
├── .env.example              # Environment template
├── .gitignore
├── package.json              # Backend dependencies
├── tsconfig.json             # TypeScript configuration
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- MongoDB 6.0+ (local or Atlas)
- Redis 7.x (for caching)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Alakhdeepsingh/social-network-api.git
cd social-network-api
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd frontend-test
npm install
cd ..
```

4. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/social-network-api
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
MAX_QUERY_COMPLEXITY=1000
MAX_FILE_SIZE=10485760
RATE_LIMIT_PER_MINUTE=60
```

5. Build TypeScript (for production):
```bash
npm run build
```

6. Start the development server:
```bash
npm run dev
```

The GraphQL API will be available at `http://localhost:4000/graphql`

7. Start the frontend (in a separate terminal):
```bash
cd frontend-test
npm run dev
```

The frontend will be available at `http://localhost:3100`

---

## 📡 GraphQL API

### Queries

```graphql
# Get current user
query Me {
  me {
    id
    username
    email
    profile {
      avatar
      bio
      followersCount
      followingCount
    }
  }
}

# Get feed
query Feed($limit: Int!, $cursor: String) {
  feed(limit: $limit, cursor: $cursor) {
    edges {
      node {
        id
        content
        author {
          username
          avatar
        }
        likesCount
        commentsCount
        createdAt
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Get user profile
query Profile($username: String!) {
  profile(username: $username) {
    id
    username
    bio
    avatar
    posts(limit: 10) {
      id
      content
      likesCount
    }
    followersCount
    followingCount
  }
}
```

### Mutations

```graphql
# Create post
mutation CreatePost($content: String!, $media: Upload) {
  createPost(content: $content, media: $media) {
    id
    content
    author {
      username
    }
    createdAt
  }
}

# Follow user
mutation Follow($userId: ID!) {
  follow(userId: $userId) {
    id
    following {
      id
      username
    }
  }
}

# Like post
mutation LikePost($postId: ID!) {
  likePost(postId: $postId) {
    id
    likesCount
    isLiked
  }
}
```

### Subscriptions

```graphql
# Subscribe to new posts
subscription NewPosts {
  newPosts {
    id
    content
    author {
      username
    }
    createdAt
  }
}

# Subscribe to notifications
subscription Notifications {
  notifications {
    id
    type
    message
    createdAt
  }
}
```

---

## Security Features

### Authentication
- **JWT Context**: Authentication token passed in GraphQL context)
- **Token Validation**: JWT verification on every authenticated request
- **User Resolution**: User object available in resolvers

### Authorization
- **Field-Level Authorization**: Check permissions before returning sensitive fields
- **Role-Based Access**: Admin-only fields and mutations
- **Ownership Verification**: Users can only modify their own content

### Rate Limiting
- **Query Complexity**: Limit query complexity to prevent abuse
- **Rate Limiting**: Per-user rate limiting on mutations
- **Depth Limiting**: Maximum query depth to prevent deep recursion

---

## Database Schema

### User Model
```javascript
{
  username: String (unique, required),
  email: String (unique, required),
  password: String (hashed, required),
  profile: {
    avatar: String,
    bio: String,
    website: String,
    location: String
  },
  followers: [ObjectId (ref: User)],
  following: [ObjectId (ref: User)],
  isPrivate: Boolean (default: false),
  isVerified: Boolean (default: false),
  createdAt: Date
}
```

### Post Model
```javascript
{
  author: ObjectId (ref: User, required),
  content: String,
  media: [{
    url: String,
    type: String,
    thumbnail: String
  }],
  hashtags: [String],
  mentions: [ObjectId (ref: User)],
  likes: [ObjectId (ref: User)],
  commentsCount: Number (default: 0),
  sharesCount: Number (default: 0),
  isPinned: Boolean (default: false),
  isArchived: Boolean (default: false),
  createdAt: Date
}
```

### Comment Model
```javascript
{
  post: ObjectId (ref: Post, required),
  author: ObjectId (ref: User, required),
  content: String (required),
  parent: ObjectId (ref: Comment),
  replies: [ObjectId (ref: Comment)],
  likes: [ObjectId (ref: User)],
  createdAt: Date
}
```

---

## Testing

The project includes comprehensive test suites:

- **Resolver Tests**: Query and mutation testing
- **Schema Tests**: Schema validation and type checking
- **Subscription Tests**: Real-time subscription testing
- **DataLoader Tests**: Batch loading optimization verification
- **Integration Tests**: End-to-end API testing

Run tests with coverage:
```bash
npm test -- --coverage
```

---

## 📈 Monitoring & Metrics

### Prometheus Metrics
- **HTTP Requests**: Total requests with method, route, and status labels
- **GraphQL Operations**: Query, mutation, and subscription counts
- **Database Operations**: MongoDB query performance metrics
- **Cache Performance**: Redis cache hit/miss rates
- **Error Rates**: Error tracking by type

### Winston Logger Configuration
- **Console**: Colored output for development
- **File**: Combined logs in `logs/combined.log`
- **Error File**: Error-specific logs in `logs/error.log`
- **GraphQL File**: GraphQL-specific logs in `logs/graphql.log`
- **Log Levels**: error, warn, info, http, debug

### Metrics Endpoint
```bash
curl http://localhost:4000/metrics
```

---

## Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/social-network-api
REDIS_URL=redis://your-redis-instance:6379
JWT_SECRET=your-production-secret-key
JWT_EXPIRE=7d
MAX_QUERY_COMPLEXITY=1000
MAX_FILE_SIZE=10485760
RATE_LIMIT_PER_MINUTE=60
ENABLE_METRICS=true
```

### Deployment Platforms

- **Heroku**: Ready for Heroku deployment with MongoDB and Redis add-ons
- **Railway**: Compatible with Railway platform
- **AWS**: Can be deployed to EC2 with DocumentDB and ElastiCache
- **DigitalOcean**: Compatible with App Platform with managed databases

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Proprietary - All rights reserved.

---

## Author

**Alakhdeep Singh**

- GitHub: [@Alakhdeepsingh](https://github.com/Alakhdeepsingh)
- LinkedIn: [Alakhdeep Singh](https://linkedin.com/in/alakhdeepsingh)

---

## 🙏 Acknowledgments

- Built following GraphQL best practices
- DataLoader pattern for N+1 query optimization
- Security patterns from OWASP guidelines
- Inspired by industry-standard social platforms like Twitter and Instagram
