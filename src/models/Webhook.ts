/**
 * Outgoing webhook subscription. Deliveries are HMAC-SHA256 signed with `secret`.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export const WEBHOOK_EVENTS = [
  'post.created',
  'post.liked',
  'post.commented',
  'follow.created',
  'message.received',
  'notification.created',
  'user.joined'
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface IWebhook extends Document {
  user: Types.ObjectId;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  lastTriggered?: Date;
  lastStatus?: number;
  triggerCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSchema = new Schema<IWebhook>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    url: { type: String, required: true },
    events: [{ type: String, enum: WEBHOOK_EVENTS }],
    secret: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastTriggered: Date,
    lastStatus: Number,
    triggerCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

webhookSchema.index({ user: 1 });
webhookSchema.index({ isActive: 1, events: 1 });

const Webhook: Model<IWebhook> = mongoose.models.Webhook || mongoose.model<IWebhook>('Webhook', webhookSchema);
export default Webhook;
