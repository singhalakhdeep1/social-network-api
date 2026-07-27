/**
 * USER MODEL
 * 
 * CURRICULUM COVERAGE:
 * #601-640: Mongoose Schemas, Virtuals, Hooks
 */

import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  bio?: string;
  avatar: string;
  followers: mongoose.Types.ObjectId[];
  following: mongoose.Types.ObjectId[];
  isVerified: boolean;
  verificationToken?: string;
  verificationTokenExpire?: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  refreshToken?: string;
  notificationPreferences: {
    email: boolean;
    push: boolean;
    mentions: boolean;
    follows: boolean;
    likes: boolean;
  };
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  generateVerificationToken(): string;
  generateResetPasswordToken(): string;
  isLocked(): boolean;
  incLoginAttempts(): Promise<any>;
  resetLoginAttempts(): Promise<any>;
}

const userSchema: Schema<IUser> = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  bio: {
    type: String,
    maxlength: 500
  },
  avatar: {
    type: String,
    default: 'default-avatar.png'
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationTokenExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  refreshToken: String,
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    follows: { type: Boolean, default: true },
    likes: { type: Boolean, default: true }
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAccessToken = function (): string {
  return jwt.sign(
    { id: this._id, email: this.email, username: this.username },
    process.env.JWT_SECRET || 'social-media-secret',
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  const refreshToken = jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET || 'social-media-refresh-secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
  this.refreshToken = refreshToken;
  return refreshToken;
};

userSchema.methods.generateVerificationToken = function (): string {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.verificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000;
  return verificationToken;
};

userSchema.methods.generateResetPasswordToken = function (): string {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

userSchema.methods.isLocked = function (): boolean {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.methods.incLoginAttempts = function (): Promise<any> {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates: any = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function (): Promise<any> {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;
