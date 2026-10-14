/**
 * Chat message. `content` holds AES-256-GCM ciphertext when `isEncrypted` is true
 * (encryption at rest, see utils/crypto.ts); the services decrypt on read.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { mediaSchema, IMedia } from './Post';

export interface IMessage extends Document {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  media: IMedia[];
  replyTo?: Types.ObjectId;
  readBy: Types.ObjectId[];
  isEncrypted: boolean;
  reactions: { emoji: string; user: Types.ObjectId }[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    media: { type: [mediaSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isEncrypted: { type: Boolean, default: false },
    reactions: [new Schema({ emoji: { type: String, required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { _id: false })],
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, _id: -1 });
messageSchema.index({ sender: 1 });

const Message: Model<IMessage> = mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);
export default Message;
