/**
 * SUBSCRIPTION MODEL
 * 
 * For Monetization
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISubscription extends Document {
  creator: mongoose.Types.ObjectId;
  subscriber: mongoose.Types.ObjectId;
  tier: string;
  price: number;
  currency: string;
  benefits: string[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  autoRenew: boolean;
  paymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema: Schema<ISubscription> = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscriber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tier: {
    type: String,
    required: true,
    enum: ['basic', 'standard', 'premium']
  },
  price: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  benefits: [{
    type: String
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  autoRenew: {
    type: Boolean,
    default: true
  },
  paymentId: {
    type: String
  }
}, {
  timestamps: true
});

subscriptionSchema.index({ creator: 1, subscriber: 1 }, { unique: true });
subscriptionSchema.index({ subscriber: 1, isActive: 1 });
subscriptionSchema.index({ creator: 1, isActive: 1 });

const Subscription: Model<ISubscription> = mongoose.model<ISubscription>('Subscription', subscriptionSchema);

export default Subscription;
