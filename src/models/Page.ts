/**
 * PAGE MODEL
 * 
 * For Social Features
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPage extends Document {
  name: string;
  handle: string;
  description: string;
  avatar?: string;
  coverImage?: string;
  category: string;
  owner: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  followers: mongoose.Types.ObjectId[];
  isVerified: boolean;
  website?: string;
  phone?: string;
  location?: string;
  postCount: number;
  followerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const pageSchema: Schema<IPage> = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  handle: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
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
  category: {
    type: String,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  website: {
    type: String
  },
  phone: {
    type: String
  },
  location: {
    type: String
  },
  postCount: {
    type: Number,
    default: 0
  },
  followerCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

pageSchema.index({ owner: 1 });
pageSchema.index({ category: 1 });

const Page: Model<IPage> = mongoose.model<IPage>('Page', pageSchema);

export default Page;
