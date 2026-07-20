/**
 * DATALOADER TESTS
 * 
 * CURRICULUM COVERAGE:
 * #1011-1030: Unit Testing DataLoader Batching
 */

const { createUserLoader, createPostLoader } = require('../dataloaders');
const User = require('../models/User');
const Post = require('../models/Post');
const mongoose = require('mongoose');

beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
});

afterAll(async () => {
    await mongoose.connection.close();
});

describe('DataLoader Tests - N+1 Problem Solution', () => {
    let userIds = [];

    beforeEach(async () => {
        await User.deleteMany({});

        // Create 10 test users
        const users = await User.insertMany([
            { username: 'user1', email: 'user1@test.com', password: 'hash1' },
            { username: 'user2', email: 'user2@test.com', password: 'hash2' },
            { username: 'user3', email: 'user3@test.com', password: 'hash3' }
        ]);

        userIds = users.map(u => u._id);
    });

    test('should batch multiple user requests into single query', async () => {
        const userLoader = createUserLoader();

        // Spy on User.find to count database queries
        const findSpy = jest.spyOn(User, 'find');

        // Load 3 users - should be batched into 1 query
        const results = await Promise.all([
            userLoader.load(userIds[0]),
            userLoader.load(userIds[1]),
            userLoader.load(userIds[2])
        ]);

        expect(results).toHaveLength(3);
        expect(results[0].username).toBe('user1');
        expect(results[1].username).toBe('user2');
        expect(results[2].username).toBe('user3');

        // Should only call database once (batched)
        expect(findSpy).toHaveBeenCalledTimes(1);

        findSpy.mockRestore();
    });

    test('should cache repeated requests', async () => {
        const userLoader = createUserLoader();
        const findSpy = jest.spyOn(User, 'find');

        // Load same user twice
        const user1 = await userLoader.load(userIds[0]);
        const user2 = await userLoader.load(userIds[0]); // Should use cache

        expect(user1.username).toBe(user2.username);

        // Should only query database once (second request cached)
        expect(findSpy).toHaveBeenCalledTimes(1);

        findSpy.mockRestore();
    });
});
