/**
 * STORY MODEL
 * 
 * For Stories/Status Feature
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IStory extends Document {
  author: mongoose.Types.ObjectId;
  media: { url: string; type: string; thumbnail?: string }[];
  content?: string;
  hashtags: string[];
  mentions: mongoose.Types.ObjectId[];
  expiresAt: Date;
  viewers: mongoose.Types.ObjectId[];
  viewerCount: number;
  reactions: { emoji: string; userId: mongoose.Types.ObjectId }[];
  replies: mongoose.Types.ObjectId[];
  isArchived: boolean;
  highlightId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const storySchema: Schema<IStory> = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  media: [{
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true
    },
    thumbnail: String
  }],
  content: {
    type: String,
    maxlength: 500
  },
  hashtags: [{
    type: String,
    lowercase: true
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  },
  viewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  viewerCount: {
    type: Number,
    default: 0
  },
  reactions: [{
    emoji: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StoryReply'
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  highlightId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StoryHighlight'
  }
}, {
  timestamps: true
});

storySchema.index({ author: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 });
storySchema.index({ isArchived: 1 });

const Story: Model<IStory> = mongoose.model<IStory>('Story', storySchema);

export default Story;
