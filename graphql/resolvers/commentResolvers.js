/**
 * COMMENT RESOLVERS
 * 
 * CURRICULUM COVERAGE:
 * #576-590: Nested Mutations
 * #561-570: Subscriptions for Real-time Comments
 */

const Comment = require('../../models/Comment');
const Post = require('../../models/Post');
const { AuthenticationError, UserInputError } = require('apollo-server-express');
const { pubsub } = require('./index');

const commentResolvers = {
    Mutation: {
        // Add comment to post
        addComment: async (_, { postId, content }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const post = await Post.findById(postId);
            if (!post) {
                throw new UserInputError('Post not found');
            }

            const comment = await Comment.create({
                content,
                author: context.user.id,
                post: postId
            });

            // Add comment reference to post
            post.comments.push(comment._id);
            await post.save();

            // #561-570: Publish real-time subscription
            pubsub.publish(`COMMENT_ADDED_${postId}`, { commentAdded: comment });

            context.logger.info(`✅ Comment added to post ${postId}`);

            return comment;
        },

        // Delete comment
        deleteComment: async (_, { id }, context) => {
            if (!context.user) {
                throw new AuthenticationError('Not authenticated');
            }

            const comment = await Comment.findById(id);
            if (!comment) {
                throw new UserInputError('Comment not found');
            }

            if (comment.author.toString() !== context.user.id) {
                throw new AuthenticationError('Not authorized');
            }

            // Remove comment from post
            await Post.findByIdAndUpdate(comment.post, {
                $pull: { comments: id }
            });

            await comment.remove();

            return true;
        }
    }
};

module.exports = commentResolvers;
