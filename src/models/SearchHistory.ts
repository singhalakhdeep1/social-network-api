/**
 * Per-user search history (most recent first; one row per distinct query).
 */
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ISearchHistory extends Document {
  user: Types.ObjectId;
  query: string;
  searchedAt: Date;
}

const searchHistorySchema = new Schema<ISearchHistory>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true, trim: true, maxlength: 200 },
  searchedAt: { type: Date, default: Date.now }
});

searchHistorySchema.index({ user: 1, query: 1 }, { unique: true });
searchHistorySchema.index({ user: 1, searchedAt: -1 });

const SearchHistory: Model<ISearchHistory> = mongoose.models.SearchHistory || mongoose.model<ISearchHistory>('SearchHistory', searchHistorySchema);
export default SearchHistory;
