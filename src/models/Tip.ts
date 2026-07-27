/**
 * TIP MODEL
 * 
 * For Monetization
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ITip extends Document {
  sender: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  message?: string;
  isAnonymous: boolean;
  paymentId?: string;
  paymentStatus: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

const tipSchema: Schema<ITip> = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  currency: {
    type: String,
    default: 'USD'
  },
  message: {
    type: String,
    maxlength: 500
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  paymentId: {
    type: String
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

tipSchema.index({ sender: 1, createdAt: -1 });
tipSchema.index({ recipient: 1, createdAt: -1 });
tipSchema.index({ paymentStatus: 1 });

const Tip: Model<ITip> = mongoose.model<ITip>('Tip', tipSchema);

export default Tip;
