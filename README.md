# Social Network API

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![GraphQL](https://img.shields.io/badge/GraphQL-16.8-pink)
![Apollo](https://img.shields.io/badge/Apollo-3.13-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-6.0-green)
![Redis](https://img.shields.io/badge/Redis-7.x-red)
![License](https://img.shields.io/badge/License-MIT-blue)

A production-ready social media API built with GraphQL, Apollo Server, and MongoDB featuring real-time subscriptions, feed algorithms, and optimized data loading.

## 📋 Overview

The Social Network API is a comprehensive GraphQL-based backend for social media applications. Built with Apollo Server, MongoDB, and Redis, this API implements advanced features including feed algorithms, real-time subscriptions, DataLoader for N+1 query optimization, and comprehensive analytics.

## ✨ Features

### Core Social Features
- **Post Management**: Create, read, update, and delete posts with media support
- **User Profiles**: Comprehensive user profiles with avatars and bios
- **Follow System**: Follow/unfollow users with bidirectional relationships
- **Feed Algorithm**: Smart feed combining chronological and engagement-based ranking
- **Comments & Reactions**: Nested comments and emoji reactions on posts
- **Hashtags & Mentions**: Hashtag tracking and user mentions in posts

### Advanced Features
- **Real-time Subscriptions**: GraphQL subscriptions for live updates
- **DataLoader**: Optimized batch loading to prevent N+1 queries
- **Redis Caching**: Feed and profile caching for performance
- **Media Upload**: Image and video upload with GraphQL multipart
- **Content Moderation**: Automated content filtering and moderation
- **Analytics**: User engagement metrics and post analytics

### Performance & Scalability
- **Query Optimization**: DataLoader for efficient data fetching
- **Caching Strategy**: Redis caching for frequently accessed data
- **Rate Limiting**: GraphQL query complexity analysis and rate limiting
- **Pagination**: Cursor-based pagination for large datasets
- **Metrics**: Prometheus metrics for monitoring

### Security
- **Authentication**: JWT-based authentication for GraphQL context
- **Authorization**: Field-level authorization for sensitive data
- **Input Validation**: Comprehensive input validation and sanitization
- **Rate Limiting**: Per-user rate limiting to prevent abuse
- **Content Security**: Helmet.js security headers

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18.x | Runtime environment |
| GraphQL | 16.8.x | Query language |
| Apollo Server | 3.13.x | GraphQL server |
| Express.js | 4.18.x | Web framework |
| MongoDB | 6.0+ | Database |
| Mongoose | 8.0.x | ODM |
| Redis | 7.x | Caching layer |
| DataLoader | 2.2.x | Batch loading |
| JWT | 9.0.x | Authentication |
| Winston | 3.11.x | Logging |
| Prometheus | 15.1.x | Metrics |

## 📁 Project Structure

```
social-network-api/
├── config/
│   └── redis.js              # Redis configuration
├── dataloaders/
│   ├── userLoader.js         # User batch loading
│   ├── postLoader.js         # Post batch loading
│   └── commentLoader.js      # Comment batch loading
├── graphql/
│   ├── schema.js             # GraphQL schema definition
│   ├── resolvers/
│   │   ├── index.js          # Resolver aggregation
│   │   ├── userResolvers.js  # User queries/mutations
│   │   ├── postResolvers.js  # Post queries/mutations
│   │   ├── commentResolvers.js # Comment resolvers
│   │   └── subscriptionResolvers.js # Real-time subscriptions
│   └── types/
│       ├── user.js           # User type definitions
│       ├── post.js           # Post type definitions
│       └── comment.js        # Comment type definitions
├── middleware/
│   └── auth.js               # JWT authentication
├── models/
│   ├── User.js               # User schema
│   ├── Post.js               # Post schema
│   ├── Comment.js            # Comment schema
│   ├── Like.js               # Like/reaction schema
│   └── Follow.js             # Follow relationship schema
├── tests/
│ ├── resolvers.test.js       # Resolver tests
│ └── schema.test.js          # Schema validation tests
├── utils/
│   └── logger.js             # Winston logger
├── frontend-test/            # React test frontend
├── .env.example              # Environment template
├── .gitignore
├── jest.config.js            # Jest configuration
├── jest.setup.js             # Jest setup
├── package.json
└── server.js                 # Entry point
```

---

## 🚀 Getting Started

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

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
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

4. Start the development server:
```bash
npm run dev
```

The GraphQL Playground will be available at `http://localhost:4000/graphql`

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

## 🔐 Security Features

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

## 📊 Database Schema

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

## 🧪 Testing

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

## 🚀 Deployment

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

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

Proprietary - All rights reserved.

---

## 👨‍💻 Author

**Alakhdeep Singh**

- GitHub: [@Alakhdeepsingh](https://github.com/Alakhdeepsingh)
- LinkedIn: [Alakhdeep Singh](https://linkedin.com/in/alakhdeepsingh)

---

## 🙏 Acknowledgments

- Built following GraphQL best practices
- DataLoader pattern for N+1 query optimization
- Security patterns from OWASP guidelines
- Inspired by industry-standard social platforms like Twitter and Instagram
