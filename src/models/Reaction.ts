/**
 * REACTION MODEL (Emoji Reactions)
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IReaction extends Document {
  user: mongoose.Types.ObjectId;
  post: mongoose.Types.ObjectId;
  comment?: mongoose.Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

const reactionSchema: Schema<IReaction> = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  emoji: {
    type: String,
    required: true,
    enum: ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '🙏']
  }
}, {
  timestamps: true
});

reactionSchema.index({ user: 1, post: 1 }, { unique: true });
reactionSchema.index({ user: 1, comment: 1 }, { unique: true });
reactionSchema.index({ post: 1, emoji: 1 });

const Reaction: Model<IReaction> = mongoose.model<IReaction>('Reaction', reactionSchema);

export default Reaction;
