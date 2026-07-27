/**
 * STORY HIGHLIGHT MODEL
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IStoryHighlight extends Document {
  author: mongoose.Types.ObjectId;
  title: string;
  coverUrl: string;
  stories: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const storyHighlightSchema: Schema<IStoryHighlight> = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 50
  },
  coverUrl: {
    type: String,
    required: true
  },
  stories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }]
}, {
  timestamps: true
});

storyHighlightSchema.index({ author: 1, createdAt: -1 });

const StoryHighlight: Model<IStoryHighlight> = mongoose.model<IStoryHighlight>('StoryHighlight', storyHighlightSchema);

export default StoryHighlight;
