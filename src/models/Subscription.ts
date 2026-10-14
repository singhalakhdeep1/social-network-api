/**
 * A fan's paid subscription to a creator (30-day periods).
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const SUBSCRIPTION_TIERS = {
  basic: { name: 'Basic', price: 4.99, benefits: ['Exclusive posts', 'Supporter badge'] },
  standard: { name: 'Standard', price: 9.99, benefits: ['Everything in Basic', 'Early access to posts', 'Direct messaging'] },
  premium: { name: 'Premium', price: 19.99, benefits: ['Everything in Standard', 'Monthly 1-on-1 call', 'Exclusive content'] }
} as const;
export type TierKey = keyof typeof SUBSCRIPTION_TIERS;

export interface ISubscription extends Document {
  creator: Types.ObjectId;
  subscriber: Types.ObjectId;
  tier: TierKey;
  price: number;
  currency: string;
  benefits: string[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  autoRenew: boolean;
  paymentId?: string;
  paymentMode: 'stripe' | 'demo';
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscriber: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tier: { type: String, required: true, enum: Object.keys(SUBSCRIPTION_TIERS) },
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    benefits: [String],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    autoRenew: { type: Boolean, default: true },
    paymentId: String,
    paymentMode: { type: String, enum: ['stripe', 'demo'], default: 'demo' }
  },
  { timestamps: true }
);

subscriptionSchema.index({ creator: 1, subscriber: 1 }, { unique: true });
subscriptionSchema.index({ subscriber: 1, isActive: 1 });
subscriptionSchema.index({ creator: 1, isActive: 1 });
subscriptionSchema.index({ isActive: 1, endDate: 1 });
subscriptionSchema.index({ paymentId: 1 }, { sparse: true });

const Subscription: Model<ISubscription> = mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export default Subscription;
