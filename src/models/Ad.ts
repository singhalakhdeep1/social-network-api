/**
 * AD MODEL
 * 
 * For Monetization
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAd extends Document {
  advertiser: mongoose.Types.ObjectId;
  title: string;
  description: string;
  media: { url: string; type: string }[];
  targetUrl: string;
  targetAudience: {
    interests: string[];
    ageRange?: { min: number; max: number };
    locations: string[];
  };
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  ctr: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adSchema: Schema<IAd> = new mongoose.Schema({
  advertiser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  media: [{
    url: { type: String, required: true },
    type: { type: String, required: true }
  }],
  targetUrl: {
    type: String,
    required: true
  },
  targetAudience: {
    interests: [{ type: String }],
    ageRange: {
      min: Number,
      max: Number
    },
    locations: [{ type: String }]
  },
  budget: {
    type: Number,
    required: true
  },
  spent: {
    type: Number,
    default: 0
  },
  impressions: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  },
  ctr: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed'],
    default: 'draft'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

adSchema.index({ advertiser: 1, status: 1 });
adSchema.index({ status: 1, startDate: 1 });

const Ad: Model<IAd> = mongoose.model<IAd>('Ad', adSchema);

export default Ad;
