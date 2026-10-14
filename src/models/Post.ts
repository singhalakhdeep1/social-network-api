/**
 * Post model. Likes/comments/reactions live in their own collections; the counters here are
 * denormalised ($inc'd by the services) so feed ranking never needs to count.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IMedia {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
}

export const mediaSchema = new Schema<IMedia>(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    thumbnail: String
  },
  { _id: false }
);

export interface IPost extends Document {
  content: string;
  author: Types.ObjectId;
  media: IMedia[];
  hashtags: string[];
  mentions: Types.ObjectId[];
  likeCount: number;
  commentCount: number;
  sharesCount: number;
  reactionCount: number;
  sharedFrom?: Types.ObjectId;
  group?: Types.ObjectId;
  page?: Types.ObjectId;
  isPinned: boolean;
  isArchived: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    content: { type: String, trim: true, maxlength: 5000, default: '' },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    media: { type: [mediaSchema], default: [] },
    hashtags: [{ type: String, trim: true, lowercase: true }],
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    sharesCount: { type: Number, default: 0, min: 0 },
    reactionCount: { type: Number, default: 0, min: 0 },
    sharedFrom: { type: Schema.Types.ObjectId, ref: 'Post' },
    group: { type: Schema.Types.ObjectId, ref: 'Group' },
    page: { type: Schema.Types.ObjectId, ref: 'Page' },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' }
  },
  { timestamps: true }
);

postSchema.pre('validate', function (next) {
  if (!this.content && (!this.media || this.media.length === 0) && !this.sharedFrom) {
    return next(new Error('A post needs text, media, or a shared post'));
  }
  next();
});

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ hashtags: 1, createdAt: -1 });
postSchema.index({ mentions: 1 });
postSchema.index({ group: 1, createdAt: -1 });
postSchema.index({ page: 1, createdAt: -1 });
postSchema.index({ content: 'text', hashtags: 'text' }, { weights: { content: 5, hashtags: 10 } });

const Post: Model<IPost> = mongoose.models.Post || mongoose.model<IPost>('Post', postSchema);
export default Post;
