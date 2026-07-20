/**
 * ANALYTICS EVENT MODEL
 * 
 * CURRICULUM COVERAGE:
 * #601-640: Mongoose Schema for Analytics
 */

const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    eventType: {
        type: String,
        enum: ['post_created', 'post_liked', 'post_commented', 'user_followed', 'user_unfollowed', 'profile_viewed', 'search_performed'],
        required: true
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    },
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for analytics queries
analyticsEventSchema.index({ user: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
