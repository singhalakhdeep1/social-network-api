/**
 * EVENT MODEL
 * 
 * For Social Features
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IEvent extends Document {
  host: mongoose.Types.ObjectId;
  title: string;
  description: string;
  coverImage?: string;
  location: {
    name: string;
    address: string;
    coordinates?: { lat: number; lng: number };
  };
  startDate: Date;
  endDate: Date;
  isOnline: boolean;
  meetingUrl?: string;
  maxAttendees?: number;
  attendees: mongoose.Types.ObjectId[];
  waitlist: mongoose.Types.ObjectId[];
  isPublic: boolean;
  category: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema: Schema<IEvent> = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  coverImage: {
    type: String
  },
  location: {
    name: { type: String, required: true },
    address: { type: String, required: true },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  meetingUrl: {
    type: String
  },
  maxAttendees: {
    type: Number
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  waitlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    required: true
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

eventSchema.index({ host: 1, startDate: -1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ isPublic: 1, startDate: 1 });

const Event: Model<IEvent> = mongoose.model<IEvent>('Event', eventSchema);

export default Event;
