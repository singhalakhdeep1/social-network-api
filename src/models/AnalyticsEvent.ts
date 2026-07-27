/**
 * ANALYTICS EVENT MODEL
 * 
 * CURRICULUM COVERAGE:
 * #601-640: Mongoose Schema for Analytics
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAnalyticsEvent extends Document {
  user: mongoose.Types.ObjectId;
  eventType: 'post_created' | 'post_liked' | 'post_commented' | 'user_followed' | 'user_unfollowed' | 'profile_viewed' | 'search_performed';
  post?: mongoose.Types.ObjectId;
  targetUser?: mongoose.Types.ObjectId;
  metadata: Record<string, any>;
  createdAt: Date;
}

const analyticsEventSchema: Schema<IAnalyticsEvent> = new mongoose.Schema({
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

analyticsEventSchema.index({ user: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: -1 });

const AnalyticsEvent: Model<IAnalyticsEvent> = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema);

export default AnalyticsEvent;
