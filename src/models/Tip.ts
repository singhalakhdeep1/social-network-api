/**
 * A tip from one user to another.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ITip extends Document {
  sender: Types.ObjectId;
  recipient: Types.ObjectId;
  amount: number;
  currency: string;
  message?: string;
  isAnonymous: boolean;
  paymentId?: string;
  paymentMode: 'stripe' | 'demo';
  paymentStatus: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const tipSchema = new Schema<ITip>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.5 },
    currency: { type: String, default: 'USD' },
    message: { type: String, maxlength: 500 },
    isAnonymous: { type: Boolean, default: false },
    paymentId: String,
    paymentMode: { type: String, enum: ['stripe', 'demo'], default: 'demo' },
    paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
  },
  { timestamps: true }
);

tipSchema.index({ sender: 1, createdAt: -1 });
tipSchema.index({ recipient: 1, paymentStatus: 1, createdAt: -1 });
tipSchema.index({ paymentId: 1 }, { sparse: true });

const Tip: Model<ITip> = mongoose.models.Tip || mongoose.model<ITip>('Tip', tipSchema);
export default Tip;
