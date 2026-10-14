/**
 * Emoji reaction on a post, or on a comment (then `comment` is set, `post` is its post).
 * One reaction per user per target; reacting again replaces the emoji.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '🙏'];

export interface IReaction extends Document {
  user: Types.ObjectId;
  post: Types.ObjectId;
  comment: Types.ObjectId | null;
  emoji: string;
  createdAt: Date;
  updatedAt: Date;
}

const reactionSchema = new Schema<IReaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    comment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    emoji: { type: String, required: true, enum: REACTION_EMOJIS }
  },
  { timestamps: true }
);

reactionSchema.index({ user: 1, post: 1, comment: 1 }, { unique: true });
reactionSchema.index({ post: 1, comment: 1, emoji: 1 });

const Reaction: Model<IReaction> = mongoose.models.Reaction || mongoose.model<IReaction>('Reaction', reactionSchema);
export default Reaction;
