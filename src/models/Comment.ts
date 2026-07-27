/**
 * COMMENT MODEL
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IComment extends Document {
  content: string;
  author: mongoose.Types.ObjectId;
  post: mongoose.Types.ObjectId;
  parent?: mongoose.Types.ObjectId;
  replies: mongoose.Types.ObjectId[];
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema: Schema<IComment> = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    maxlength: 1000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ parent: 1 });
commentSchema.index({ author: 1 });

commentSchema.virtual('likeCount').get(function () {
  return this.likes?.length || 0;
});

commentSchema.virtual('replyCount').get(function () {
  return this.replies?.length || 0;
});

const Comment: Model<IComment> = mongoose.model<IComment>('Comment', commentSchema);

export default Comment;
