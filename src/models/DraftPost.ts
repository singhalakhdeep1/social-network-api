/**
 * An unpublished draft.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { IMedia, mediaSchema } from './Post';

export interface IDraftPost extends Document {
  author: Types.ObjectId;
  content: string;
  media: IMedia[];
  createdAt: Date;
  updatedAt: Date;
}

const draftPostSchema = new Schema<IDraftPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 5000 },
    media: { type: [mediaSchema], default: [] }
  },
  { timestamps: true }
);

draftPostSchema.index({ author: 1, updatedAt: -1 });

const DraftPost: Model<IDraftPost> = mongoose.models.DraftPost || mongoose.model<IDraftPost>('DraftPost', draftPostSchema);
export default DraftPost;
