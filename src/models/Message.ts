/**
 * MESSAGE MODEL
 * 
 * For Direct Messaging System
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  media?: { url: string; type: string }[];
  replyTo?: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  isEncrypted: boolean;
  encryptionKey?: string;
  reactions: { emoji: string; userId: mongoose.Types.ObjectId }[];
  isDeleted: boolean;
  deletedFor?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema: Schema<IMessage> = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  media: [{
    url: String,
    type: String
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: {
    type: String
  },
  reactions: [{
    emoji: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ isRead: 1 });

const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);

export default Message;
