/**
 * USER RESOLVERS
 * 
 * CURRICULUM COVERAGE:
 * #576-590: Query and Mutation Resolvers
 * #676-700: JWT Authentication
 * #851-900: Password Hashing with bcrypt
 */

const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { AuthenticationError, UserInputError } = require('apollo-server-express');

const userResolvers = {
    Query: {
        // Get current user
        me: async (_, __, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }
            return User.findById(context.user.id);
        },

        // Get user by ID
        user: async (_, { id }) => {
            const user = await User.findById(id);
            if (!user) {
                throw new UserInputError('User not found');
            }
            return user;
        },

        // Search users
        users: async (_, { search, limit = 10 }) => {
            const query = search
                ? { username: { $regex: search, $options: 'i' } }
                : {};

            return User.find(query).limit(limit);
        }
    },

    Mutation: {
        // #851-900: Register with bcrypt password hashing
        register: async (_, { username, email, password }) => {
            // Check if user exists
            const existingUser = await User.findOne({ $or: [{ email }, { username }] });
            if (existingUser) {
                throw new UserInputError('User already exists');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Create user
            const user = await User.create({
                username,
                email,
                password: hashedPassword
            });

            // #676-700: Generate JWT token
            const token = jwt.sign(
                { id: user._id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return { token, user };
        },

        // #676-700: Login with JWT
        login: async (_, { email, password }) => {
            const user = await User.findOne({ email });
            if (!user) {
                throw new AuthenticationError('Invalid credentials');
            }

            // Verify password
            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                throw new AuthenticationError('Invalid credentials');
            }

            // Generate token
            const token = jwt.sign(
                { id: user._id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return { token, user };
        },

        // Update profile
        updateProfile: async (_, { bio, avatar }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const user = await User.findByIdAndUpdate(
                context.user.id,
                { bio, avatar },
                { new: true }
            );

            return user;
        },

        // Follow user
        followUser: async (_, { userId }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            if (userId === context.user.id) {
                throw new UserInputError('Cannot follow yourself');
            }

            const user = await User.findById(context.user.id);
            const targetUser = await User.findById(userId);

            if (!targetUser) {
                throw new UserInputError('User not found');
            }

            // Add to following
            if (!user.following.includes(userId)) {
                user.following.push(userId);
                targetUser.followers.push(context.user.id);

                await user.save();
                await targetUser.save();
            }

            return targetUser;
        },

        // Unfollow user
        unfollowUser: async (_, { userId }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const user = await User.findById(context.user.id);
            const targetUser = await User.findById(userId);

            if (!targetUser) {
                throw new UserInputError('User not found');
            }

            // Remove from following
            user.following = user.following.filter(id => id.toString() !== userId);
            targetUser.followers = targetUser.followers.filter(id => id.toString() !== context.user.id);

            await user.save();
            await targetUser.save();

            return targetUser;
        }
    }
};

module.exports = userResolvers;
