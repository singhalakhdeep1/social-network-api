/**
 * POLL MODEL
 * 
 * For Social Features
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPollOption {
  id: string;
  text: string;
  votes: mongoose.Types.ObjectId[];
  voteCount: number;
}

export interface IPoll extends Document {
  post: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  question: string;
  options: IPollOption[];
  multipleChoice: boolean;
  maxChoices?: number;
  expiresAt?: Date;
  isActive: boolean;
  totalVotes: number;
  createdAt: Date;
  updatedAt: Date;
}

const pollOptionSchema = new Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  voteCount: { type: Number, default: 0 }
});

const pollSchema: Schema<IPoll> = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 500
  },
  options: [pollOptionSchema],
  multipleChoice: {
    type: Boolean,
    default: false
  },
  maxChoices: {
    type: Number
  },
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  totalVotes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

pollSchema.index({ post: 1 });
pollSchema.index({ author: 1 });
pollSchema.index({ expiresAt: 1, isActive: 1 });

const Poll: Model<IPoll> = mongoose.model<IPoll>('Poll', pollSchema);

export default Poll;
