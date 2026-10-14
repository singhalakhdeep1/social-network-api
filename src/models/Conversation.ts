/**
 * Direct or group conversation. Archive/mute are per participant; unread counters are a map
 * keyed by user id. Direct conversations are de-duplicated through `participantsKey`.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  participantsKey?: string;
  isGroup: boolean;
  groupName?: string;
  groupAvatar?: string;
  groupDescription?: string;
  encrypted: boolean;
  createdBy: Types.ObjectId;
  admins: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  typingUsers: Types.ObjectId[];
  archivedBy: Types.ObjectId[];
  mutedBy: { user: Types.ObjectId; until?: Date }[];
  unreadCount: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    participantsKey: { type: String },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, maxlength: 100 },
    groupAvatar: String,
    groupDescription: { type: String, maxlength: 500 },
    encrypted: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: Date,
    typingUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    archivedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    mutedBy: [
      new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, until: Date }, { _id: false })
    ],
    unreadCount: { type: Map, of: Number, default: () => new Map() }
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ participantsKey: 1 }, { unique: true, partialFilterExpression: { participantsKey: { $type: 'string' } } });

const Conversation: Model<IConversation> = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', conversationSchema);
export default Conversation;
