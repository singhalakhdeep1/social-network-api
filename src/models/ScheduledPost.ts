/**
 * SCHEDULED POST MODEL
 * 
 * For Content Management
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IScheduledPost extends Document {
  author: mongoose.Types.ObjectId;
  content: string;
  media?: { url: string; type: string }[];
  hashtags: string[];
  mentions: mongoose.Types.ObjectId[];
  scheduledFor: Date;
  status: 'pending' | 'published' | 'failed';
  publishedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledPostSchema: Schema<IScheduledPost> = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  media: [{
    url: String,
    type: String
  }],
  hashtags: [{
    type: String,
    lowercase: true
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  scheduledFor: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'published', 'failed'],
    default: 'pending'
  },
  publishedAt: {
    type: Date
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

scheduledPostSchema.index({ author: 1, scheduledFor: -1 });
scheduledPostSchema.index({ status: 1, scheduledFor: 1 });

const ScheduledPost: Model<IScheduledPost> = mongoose.model<IScheduledPost>('ScheduledPost', scheduledPostSchema);

export default ScheduledPost;
