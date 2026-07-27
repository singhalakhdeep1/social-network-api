/**
 * STORY REPLY MODEL
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IStoryReply extends Document {
  story: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  content: string;
  reactions: { emoji: string; userId: mongoose.Types.ObjectId }[];
  createdAt: Date;
  updatedAt: Date;
}

const storyReplySchema: Schema<IStoryReply> = new mongoose.Schema({
  story: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 500
  },
  reactions: [{
    emoji: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true
});

storyReplySchema.index({ story: 1, createdAt: -1 });

const StoryReply: Model<IStoryReply> = mongoose.model<IStoryReply>('StoryReply', storyReplySchema);

export default StoryReply;
