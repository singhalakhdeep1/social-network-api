/**
 * Analytics event stream (engagement metrics, trending, creator dashboard inputs).
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const ANALYTICS_EVENT_TYPES = [
  'post_created',
  'post_liked',
  'post_commented',
  'post_shared',
  'post_viewed',
  'user_followed',
  'user_unfollowed',
  'profile_viewed',
  'search_performed',
  'story_viewed',
  'ad_impression',
  'ad_click'
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface IAnalyticsEvent extends Document {
  user: Types.ObjectId;
  eventType: AnalyticsEventType;
  post?: Types.ObjectId;
  targetUser?: Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    eventType: { type: String, enum: ANALYTICS_EVENT_TYPES, required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post' },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

analyticsEventSchema.index({ user: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ post: 1, eventType: 1 });
analyticsEventSchema.index({ targetUser: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const AnalyticsEvent: Model<IAnalyticsEvent> = mongoose.models.AnalyticsEvent || mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema);
export default AnalyticsEvent;
