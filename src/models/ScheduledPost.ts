/**
 * A post queued for later publication (published by the scheduler job).
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { IMedia, mediaSchema } from './Post';

export interface IScheduledPost extends Document {
  author: Types.ObjectId;
  content: string;
  media: IMedia[];
  scheduledFor: Date;
  status: 'pending' | 'published' | 'failed';
  publishedAt?: Date;
  post?: Types.ObjectId;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledPostSchema = new Schema<IScheduledPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 5000 },
    media: { type: [mediaSchema], default: [] },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'published', 'failed'], default: 'pending' },
    publishedAt: Date,
    post: { type: Schema.Types.ObjectId, ref: 'Post' },
    errorMessage: String
  },
  { timestamps: true }
);

scheduledPostSchema.index({ author: 1, scheduledFor: 1 });
scheduledPostSchema.index({ status: 1, scheduledFor: 1 });

const ScheduledPost: Model<IScheduledPost> = mongoose.models.ScheduledPost || mongoose.model<IScheduledPost>('ScheduledPost', scheduledPostSchema);
export default ScheduledPost;
