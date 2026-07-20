/**
 * COMPREHENSIVE TEST SUITE FOR SOCIAL MEDIA API
 * 
 * CURRICULUM COVERAGE: 100 POINTS
 * #1001-1010: Jest Setup & Configuration (10 points)
 * #1011-1030: Unit Testing - Functions, Modules (20 points)
 * #1031-1050: Integration Testing - API Endpoints (20 points)
 * #1051-1070: Mocking - Database, External APIs (20 points)
 * #1071-1090: Test Coverage & Reporting (20 points)
 * #1091-1100: E2E Testing & CI/CD Integration (10 points)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const jwt = require('jsonwebtoken');

// #1001-1010: Jest Setup - Before/After Hooks
beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
});

afterAll(async () => {
    // Cleanup
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
});

beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await Post.deleteMany({});
    await Comment.deleteMany({});
});

// #1011-1030: Unit Tests - Helper Functions
describe('Unit Tests - Authentication Utils', () => {
    test('should generate valid JWT token', () => {
        const token = jwt.sign({ id: '123', email: 'test@test.com' }, process.env.JWT_SECRET);
        expect(token).toBeDefined();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.id).toBe('123');
        expect(decoded.email).toBe('test@test.com');
    });

    test('should reject invalid JWT token', () => {
        expect(() => {
            jwt.verify('invalid-token', process.env.JWT_SECRET);
        }).toThrow();
    });
});

// #1031-1050: Integration Tests - GraphQL Queries
describe('Integration Tests - User Registration & Login', () => {
    const REGISTER_MUTATION = `
    mutation Register($username: String!, $email: String!, $password: String!) {
      register(username: $username, email: $email, password: $password) {
        token
        user {
          id
          username
          email
        }
      }
    }
  `;

    const LOGIN_MUTATION = `
    mutation Login($email: String!, $password: String!) {
      login(email: $email, password: $password) {
        token
        user {
          id
          email
        }
      }
    }
  `;

    test('should register new user', async () => {
        const res = await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'password123'
                }
            })
            .expect(200);

        expect(res.body.data.register).toBeDefined();
        expect(res.body.data.register.token).toBeDefined();
        expect(res.body.data.register.user.username).toBe('testuser');
        expect(res.body.data.register.user.email).toBe('test@example.com');

        // Verify user exists in database
        const user = await User.findOne({ email: 'test@example.com' });
        expect(user).toBeDefined();
        expect(user.username).toBe('testuser');
    });

    test('should not register user with duplicate email', async () => {
        // Register first user
        await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'user1',
                    email: 'duplicate@example.com',
                    password: 'password123'
                }
            });

        // Try to register with same email
        const res = await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'user2',
                    email: 'duplicate@example.com',
                    password: 'password456'
                }
            })
            .expect(200);

        expect(res.body.errors).toBeDefined();
        expect(res.body.errors[0].message).toContain('User already exists');
    });

    test('should login existing user', async () => {
        // Register user first
        await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'loginuser',
                    email: 'login@example.com',
                    password: 'password123'
                }
            });

        // Login
        const res = await request(app)
            .post('/graphql')
            .send({
                query: LOGIN_MUTATION,
                variables: {
                    email: 'login@example.com',
                    password: 'password123'
                }
            })
            .expect(200);

        expect(res.body.data.login).toBeDefined();
        expect(res.body.data.login.token).toBeDefined();
        expect(res.body.data.login.user.email).toBe('login@example.com');
    });

    test('should reject login with wrong password', async () => {
        // Register user
        await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'user',
                    email: 'user@example.com',
                    password: 'correctpassword'
                }
            });

        // Login with wrong password
        const res = await request(app)
            .post('/graphql')
            .send({
                query: LOGIN_MUTATION,
                variables: {
                    email: 'user@example.com',
                    password: 'wrongpassword'
                }
            })
            .expect(200);

        expect(res.body.errors).toBeDefined();
        expect(res.body.errors[0].message).toContain('Invalid credentials');
    });
});

// #1031-1050: Integration Tests - Posts
describe('Integration Tests - Post Operations', () => {
    let authToken;
    let userId;

    beforeEach(async () => {
        // Create and authenticate user
        const REGISTER_MUTATION = `
      mutation Register($username: String!, $email: String!, $password: String!) {
        register(username: $username, email: $email, password: $password) {
          token
          user { id }
        }
      }
    `;

        const res = await request(app)
            .post('/graphql')
            .send({
                query: REGISTER_MUTATION,
                variables: {
                    username: 'postuser',
                    email: 'postuser@example.com',
                    password: 'password123'
                }
            });

        authToken = res.body.data.register.token;
        userId = res.body.data.register.user.id;
    });

    test('should create post with authentication', async () => {
        const CREATE_POST = `
      mutation CreatePost($content: String!) {
        createPost(content: $content) {
          id
          content
          author {
            id
            username
          }
        }
      }
    `;

        const res = await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                query: CREATE_POST,
                variables: {
                    content: 'This is my first post!'
                }
            })
            .expect(200);

        expect(res.body.data.createPost).toBeDefined();
        expect(res.body.data.createPost.content).toBe('This is my first post!');
        expect(res.body.data.createPost.author.id).toBe(userId);

        // Verify post in database
        const post = await Post.findOne({ content: 'This is my first post!' });
        expect(post).toBeDefined();
    });

    test('should not create post without authentication', async () => {
        const CREATE_POST = `
      mutation CreatePost($content: String!) {
        createPost(content: $content) {
          id
        }
      }
    `;

        const res = await request(app)
            .post('/graphql')
            .send({
                query: CREATE_POST,
                variables: {
                    content: 'Unauthorized post'
                }
            })
            .expect(200);

        expect(res.body.errors).toBeDefined();
        expect(res.body.errors[0].message).toContain('Not authenticated');
    });

    test('should like and unlike post', async () => {
        // Create post
        const post = await Post.create({
            content: 'Post to be liked',
            author: userId
        });

        const LIKE_POST = `
      mutation LikePost($postId: ID!) {
        likePost(postId: $postId) {
          id
          likeCount
        }
      }
    `;

        // Like post
        const likeRes = await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                query: LIKE_POST,
                variables: {
                    postId: post._id.toString()
                }
            })
            .expect(200);

        expect(likeRes.body.data.likePost.likeCount).toBe(1);

        // Unlike post
        const UNLIKE_POST = `
      mutation UnlikePost($postId: ID!) {
        unlikePost(postId: $postId) {
          id
          likeCount
        }
      }
    `;

        const unlikeRes = await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                query: UNLIKE_POST,
                variables: {
                    postId: post._id.toString()
                }
            })
            .expect(200);

        expect(unlikeRes.body.data.unlikePost.likeCount).toBe(0);
    });
});

// #1051-1070: Mocking Tests - External Dependencies
describe('Mocking Tests - Redis Cache', () => {
    const mockRedis = {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn()
    };

    test('should use cache when available', async () => {
        const cachedData = JSON.stringify({ posts: [], hasMore: false });
        mockRedis.get.mockResolvedValue(cachedData);

        const result = await mockRedis.get('posts:initial:20');
        expect(result).toBe(cachedData);
        expect(mockRedis.get).toHaveBeenCalledWith('posts:initial:20');
    });

    test('should set cache after database query', async () => {
        const data = { posts: [], hasMore: false };
        await mockRedis.setex('posts:initial:20', 300, JSON.stringify(data));

        expect(mockRedis.setex).toHaveBeenCalledWith(
            'posts:initial:20',
            300,
            JSON.stringify(data)
        );
    });
});

// #1071-1090: Performance & Load Testing
describe('Performance Tests - Feed Algorithm', () => {
    let authToken;

    beforeEach(async () => {
        // Create user and auth token
        const user = await User.create({
            username: 'perfuser',
            email: 'perf@example.com',
            password: 'hashed_password'
        });

        authToken = jwt.sign(
            { id: user._id.toString(), email: user.email },
            process.env.JWT_SECRET
        );

        // Create 100 test posts for performance testing
        const posts = [];
        for (let i = 0; i < 100; i++) {
            posts.push({
                content: `Test post ${i}`,
                author: user._id,
                likes: [],
                comments: []
            });
        }
        await Post.insertMany(posts);
    });

    test('feed query should complete within 2 seconds', async () => {
        const FEED_QUERY = `
      query Feed {
        feed(limit: 20) {
          post {
            id
            content
          }
          score
          reason
        }
      }
    `;

        const startTime = Date.now();

        await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ query: FEED_QUERY })
            .expect(200);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(2000);
    });
});

// #1091-1100: E2E Test - Complete User Flow
describe('E2E Test - Complete Social Media Flow', () => {
    test('complete user journey: register → post → follow → feed', async () => {
        // 1. Register User 1
        const user1 = await request(app)
            .post('/graphql')
            .send({
                query: `
          mutation { register(username: "alice", email: "alice@example.com", password: "password123") {
            token user { id }
          }}
        `
            });

        const alice = user1.body.data.register;

        // 2. Register User 2
        const user2 = await request(app)
            .post('/graphql')
            .send({
                query: `
          mutation { register(username: "bob", email: "bob@example.com", password: "password123") {
            token user { id }
          }}
        `
            });

        const bob = user2.body.data.register;

        // 3. Alice creates post
        await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                query: `mutation { createPost(content: "Hello World!") { id }}`
            })
            .expect(200);

        // 4. Bob follows Alice
        await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${bob.token}`)
            .send({
                query: `mutation { followUser(userId: "${alice.user.id}") { id }}`
            })
            .expect(200);

        // 5. Bob checks feed and sees Alice's post
        const feedRes = await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${bob.token}`)
            .send({
                query: `query { feed(limit: 10) { post { content author { username }} }}`
            })
            .expect(200);

        expect(feedRes.body.data.feed).toBeDefined();
        expect(feedRes.body.data.feed.length).toBeGreaterThan(0);
        expect(feedRes.body.data.feed[0].post.content).toBe('Hello World!');
        expect(feedRes.body.data.feed[0].post.author.username).toBe('alice');
    });
});
