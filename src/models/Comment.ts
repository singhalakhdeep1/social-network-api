/**
 * Threaded comment. `parent` is set for replies; counters are denormalised.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IComment extends Document {
  content: string;
  author: Types.ObjectId;
  post: Types.ObjectId;
  parent?: Types.ObjectId | null;
  likeCount: number;
  replyCount: number;
  mentions: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    content: { type: String, required: [true, 'Content is required'], trim: true, maxlength: 1000 },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    likeCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, parent: 1, createdAt: -1 });
commentSchema.index({ parent: 1, createdAt: 1 });
commentSchema.index({ author: 1 });

const Comment: Model<IComment> = mongoose.models.Comment || mongoose.model<IComment>('Comment', commentSchema);
export default Comment;
