/**
 * User model: profile, credentials, denormalised counters, 2FA, refresh-token sessions.
 * Follow edges live in the Follow collection (not in embedded arrays) so they scale.
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IRefreshSession {
  _id: Types.ObjectId;
  hash: string;
  expiresAt: Date;
  userAgent?: string;
  createdAt: Date;
}

export interface INotificationPreferences {
  email: boolean;
  push: boolean;
  mentions: boolean;
  follows: boolean;
  likes: boolean;
  comments: boolean;
  messages: boolean;
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  website?: string;
  location?: string;
  interests: string[];
  birthYear?: number;
  role: 'user' | 'admin';
  isPrivate: boolean;
  isVerified: boolean; // blue check, granted by an admin
  emailVerified: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  verificationToken?: string;
  verificationTokenExpire?: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  refreshSessions: IRefreshSession[];
  notificationPreferences: INotificationPreferences;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  isLocked(): boolean;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_]{3,30}$/, 'Username must be 3-30 characters: letters, numbers, underscore']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
    },
    password: { type: String, required: true, minlength: 8, select: false },
    displayName: { type: String, trim: true, maxlength: 60 },
    bio: { type: String, maxlength: 500 },
    avatar: { type: String },
    website: { type: String, maxlength: 200 },
    location: { type: String, maxlength: 100 },
    interests: [{ type: String, lowercase: true, trim: true }],
    birthYear: { type: Number, min: 1900, max: 2100 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isPrivate: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    followerCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    postCount: { type: Number, default: 0, min: 0 },
    verificationToken: { type: String, select: false },
    verificationTokenExpire: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
    refreshSessions: {
      type: [
        new Schema(
          {
            hash: { type: String, required: true },
            expiresAt: { type: Date, required: true },
            userAgent: String,
            createdAt: { type: Date, default: Date.now }
          },
          { _id: true }
        )
      ],
      select: false,
      default: []
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      messages: { type: Boolean, default: true }
    },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date
  },
  { timestamps: true }
);

userSchema.index({ username: 'text', displayName: 'text', bio: 'text' }, { weights: { username: 10, displayName: 5, bio: 1 } });
userSchema.index({ followerCount: -1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function (): boolean {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
export default User;
