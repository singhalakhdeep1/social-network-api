/**
 * DRAFT POST MODEL
 * 
 * For Content Management
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IDraftPost extends Document {
  author: mongoose.Types.ObjectId;
  content: string;
  media?: { url: string; type: string }[];
  hashtags: string[];
  mentions: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const draftPostSchema: Schema<IDraftPost> = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
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
  }]
}, {
  timestamps: true
});

draftPostSchema.index({ author: 1, updatedAt: -1 });

const DraftPost: Model<IDraftPost> = mongoose.model<IDraftPost>('DraftPost', draftPostSchema);

export default DraftPost;
