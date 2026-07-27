/**
 * GROUP MODEL
 * 
 * For Social Features
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description: string;
  avatar?: string;
  coverImage?: string;
  creator: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  members: mongoose.Types.ObjectId[];
  moderators: mongoose.Types.ObjectId[];
  isPrivate: boolean;
  category: string;
  tags: string[];
  rules?: string[];
  postCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema: Schema<IGroup> = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  avatar: {
    type: String
  },
  coverImage: {
    type: String
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    required: true
  },
  tags: [{
    type: String
  }],
  rules: [{
    type: String
  }],
  postCount: {
    type: Number,
    default: 0
  },
  memberCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

groupSchema.index({ creator: 1 });
groupSchema.index({ category: 1 });
groupSchema.index({ isPrivate: 1 });

const Group: Model<IGroup> = mongoose.model<IGroup>('Group', groupSchema);

export default Group;
