/**
 * Advertiser campaign. `budget` is prepaid; `spent` grows with impressions and clicks.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { IMedia, mediaSchema } from './Post';

export interface IAd extends Document {
  advertiser: Types.ObjectId;
  title: string;
  description: string;
  media: IMedia[];
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
  status: 'draft' | 'active' | 'paused' | 'completed';
  paymentId?: string;
  paymentMode: 'stripe' | 'demo';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adSchema = new Schema<IAd>(
  {
    advertiser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 500 },
    media: { type: [mediaSchema], default: [] },
    targetUrl: { type: String, required: true },
    targetAudience: {
      interests: [{ type: String, lowercase: true, trim: true }],
      ageRange: { min: Number, max: Number },
      locations: [{ type: String, lowercase: true, trim: true }]
    },
    budget: { type: Number, required: true, min: 1 },
    spent: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'active', 'paused', 'completed'], default: 'draft' },
    paymentId: String,
    paymentMode: { type: String, enum: ['stripe', 'demo'], default: 'demo' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },
  { timestamps: true }
);

adSchema.index({ advertiser: 1, status: 1 });
adSchema.index({ status: 1, startDate: 1, endDate: 1 });
adSchema.index({ paymentId: 1 }, { sparse: true });

const Ad: Model<IAd> = mongoose.models.Ad || mongoose.model<IAd>('Ad', adSchema);
export default Ad;
