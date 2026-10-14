/**
 * Follow edge (follower -> following). The source of truth for the social graph;
 * graph databases (Neo4j / JanusGraph) are projections of this collection.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IFollow extends Document {
  follower: Types.ObjectId;
  following: Types.ObjectId;
  createdAt: Date;
}

const followSchema = new Schema<IFollow>(
  {
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1, createdAt: -1 });
followSchema.index({ follower: 1, createdAt: -1 });

const Follow: Model<IFollow> = mongoose.models.Follow || mongoose.model<IFollow>('Follow', followSchema);
export default Follow;
