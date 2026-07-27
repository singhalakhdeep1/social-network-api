/**
 * WEBHOOK MODEL
 * 
 * For Integrations
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IWebhook extends Document {
  user: mongoose.Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggered?: Date;
  triggerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSchema: Schema<IWebhook> = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  url: {
    type: String,
    required: true
  },
  events: [{
    type: String,
    enum: [
      'post.created',
      'post.liked',
      'post.commented',
      'follow.created',
      'message.received',
      'notification.created',
      'user.joined'
    ]
  }],
  secret: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastTriggered: {
    type: Date
  },
  triggerCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

webhookSchema.index({ user: 1 });
webhookSchema.index({ isActive: 1 });

const Webhook: Model<IWebhook> = mongoose.model<IWebhook>('Webhook', webhookSchema);

export default Webhook;
