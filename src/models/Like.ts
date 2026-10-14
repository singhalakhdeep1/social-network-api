/**
 * Like on a post or a comment. Unique per (user, targetType, target) so liking is idempotent.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type LikeTarget = 'post' | 'comment';

export interface ILike extends Document {
  user: Types.ObjectId;
  targetType: LikeTarget;
  target: Types.ObjectId;
  createdAt: Date;
}

const likeSchema = new Schema<ILike>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['post', 'comment'], required: true },
    target: { type: Schema.Types.ObjectId, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

likeSchema.index({ user: 1, targetType: 1, target: 1 }, { unique: true });
likeSchema.index({ targetType: 1, target: 1, createdAt: -1 });
likeSchema.index({ user: 1, createdAt: -1 });

const Like: Model<ILike> = mongoose.models.Like || mongoose.model<ILike>('Like', likeSchema);
export default Like;
