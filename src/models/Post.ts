/**
 * POST MODEL
 * 
 * CURRICULUM COVERAGE:
 * #601-640: Mongoose Schema with References
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IMedia {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
}

export interface IPost extends Document {
  content: string;
  author: mongoose.Types.ObjectId;
  media: IMedia[];
  hashtags: string[];
  mentions: mongoose.Types.ObjectId[];
  likes: mongoose.Types.ObjectId[];
  comments: mongoose.Types.ObjectId[];
  sharesCount: number;
  isPinned: boolean;
  isArchived: boolean;
  isModerated: boolean;
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>({
  url: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], required: true },
  thumbnail: String
});

const postSchema: Schema<IPost> = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    maxlength: 5000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  media: [mediaSchema],
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  sharesCount: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  isModerated: {
    type: Boolean,
    default: false
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ mentions: 1 });

postSchema.virtual('likeCount').get(function () {
  return this.likes?.length || 0;
});

postSchema.virtual('commentCount').get(function () {
  return this.comments?.length || 0;
});

const Post: Model<IPost> = mongoose.model<IPost>('Post', postSchema);

export default Post;
