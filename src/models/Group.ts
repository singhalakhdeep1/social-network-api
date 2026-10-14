/**
 * Community group. Private groups require approval (`pendingMembers`).
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description: string;
  avatar?: string;
  coverImage?: string;
  creator: Types.ObjectId;
  admins: Types.ObjectId[];
  moderators: Types.ObjectId[];
  members: Types.ObjectId[];
  pendingMembers: Types.ObjectId[];
  isPrivate: boolean;
  category: string;
  tags: string[];
  rules: string[];
  postCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 500 },
    avatar: String,
    coverImage: String,
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    moderators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    pendingMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isPrivate: { type: Boolean, default: false },
    category: { type: String, default: 'general', lowercase: true, trim: true },
    tags: [{ type: String, lowercase: true, trim: true }],
    rules: [String],
    postCount: { type: Number, default: 0, min: 0 },
    memberCount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

groupSchema.index({ members: 1 });
groupSchema.index({ category: 1, memberCount: -1 });
groupSchema.index({ name: 'text', description: 'text', tags: 'text' });

const Group: Model<IGroup> = mongoose.models.Group || mongoose.model<IGroup>('Group', groupSchema);
export default Group;
