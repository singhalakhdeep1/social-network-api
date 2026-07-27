/**
 * SAVED SEARCH MODEL
 * 
 * For Advanced Search
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISavedSearch extends Document {
  user: mongoose.Types.ObjectId;
  query: string;
  filters: {
    dateRange?: { start: Date; end: Date };
    location?: string;
    mediaType?: string[];
    hashtags?: string[];
  };
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const savedSearchSchema: Schema<ISavedSearch> = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  query: {
    type: String,
    required: true
  },
  filters: {
    dateRange: {
      start: Date,
      end: Date
    },
    location: String,
    mediaType: [String],
    hashtags: [String]
  },
  name: {
    type: String,
    maxlength: 100
  }
}, {
  timestamps: true
});

savedSearchSchema.index({ user: 1, createdAt: -1 });

const SavedSearch: Model<ISavedSearch> = mongoose.model<ISavedSearch>('SavedSearch', savedSearchSchema);

export default SavedSearch;
