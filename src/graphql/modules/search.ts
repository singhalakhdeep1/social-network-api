/**
 * Search, autocomplete, history and saved searches.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { ISearchHistory } from '../../models/SearchHistory';
import { ISavedSearch } from '../../models/SavedSearch';
import * as search from '../../services/search.service';
import { trendingHashtags } from '../../services/post.service';
import AnalyticsEvent from '../../models/AnalyticsEvent';

export const typeDefs = /* GraphQL */ `
  type DateRange {
    start: DateTime!
    end: DateTime!
  }

  type SearchFilters {
    dateRange: DateRange
    location: String
    mediaType: [String!]!
    hashtags: [String!]!
  }

  type SavedSearch {
    id: ID!
    query: String!
    filters: SearchFilters!
    name: String
    createdAt: DateTime!
  }

  type SearchHistoryItem {
    id: ID!
    query: String!
    searchedAt: DateTime!
  }

  type SearchResults {
    posts: [Post!]!
    users: [User!]!
    hashtags: [TrendingHashtag!]!
  }

  input DateRangeInput {
    start: String!
    end: String!
  }

  input SearchFiltersInput {
    dateRange: DateRangeInput
    mediaType: [String!]
    hashtags: [String!]
    author: ID
  }

  extend type Query {
    "Combined search used by the search box"
    search(query: String!, limit: Int): SearchResults!
    searchPosts(query: String!, filters: SearchFiltersInput, limit: Int): [Post!]!
    searchUsers(query: String!, limit: Int): [User!]!
    autocompleteSuggestions(query: String!, limit: Int): [String!]!
    searchHistory(limit: Int): [SearchHistoryItem!]!
    savedSearches: [SavedSearch!]!
  }

  extend type Mutation {
    createSavedSearch(query: String!, filters: SearchFiltersInput, name: String): SavedSearch!
    deleteSavedSearch(searchId: ID!): Boolean!
    clearSearchHistory: Boolean!
  }
`;

const track = (ctx: Context, query: string) => {
  if (!ctx.user) return;
  void search.recordSearch(ctx.user.id, query);
  void AnalyticsEvent.create({ user: ctx.user.id, eventType: 'search_performed', metadata: { query } });
};

export const resolvers = {
  Query: {
    search: async (_: unknown, { query, limit }: { query: string; limit?: number }, ctx: Context) => {
      track(ctx, query);
      const n = Math.min(limit ?? 8, 25);
      const q = query.trim().replace(/^[#@]/, '');
      const [posts, users, tags] = await Promise.all([
        search.searchPosts(query, null, ctx.user?.id, n),
        search.searchUsers(q, n),
        trendingHashtags(50).then((t) => t.filter((h) => h.tag.includes(q.toLowerCase())).slice(0, n))
      ]);
      return { posts, users, hashtags: tags };
    },
    searchPosts: (_: unknown, { query, filters, limit }: { query: string; filters?: search.SearchFilters; limit?: number }, ctx: Context) => {
      track(ctx, query);
      return search.searchPosts(query, filters, ctx.user?.id, Math.min(limit ?? 20, 50));
    },
    searchUsers: (_: unknown, { query, limit }: { query: string; limit?: number }, ctx: Context) => {
      track(ctx, query);
      return search.searchUsers(query, Math.min(limit ?? 20, 50));
    },
    autocompleteSuggestions: (_: unknown, { query, limit }: { query: string; limit?: number }) => search.autocomplete(query, Math.min(limit ?? 10, 25)),
    searchHistory: (_: unknown, { limit }: { limit?: number }, ctx: Context) => search.listHistory(authed(ctx).id, limit ?? 20),
    savedSearches: (_: unknown, __: unknown, ctx: Context) => search.listSavedSearches(authed(ctx).id)
  },
  Mutation: {
    createSavedSearch: (_: unknown, args: { query: string; filters?: search.SearchFilters; name?: string }, ctx: Context) => search.createSavedSearch(authed(ctx).id, args),
    deleteSavedSearch: (_: unknown, { searchId }: { searchId: string }, ctx: Context) => search.deleteSavedSearch(authed(ctx).id, searchId),
    clearSearchHistory: (_: unknown, __: unknown, ctx: Context) => search.clearHistory(authed(ctx).id)
  },
  SearchHistoryItem: {
    id: (h: HydratedDocument<ISearchHistory>) => h.id
  },
  SavedSearch: {
    filters: (s: HydratedDocument<ISavedSearch>) => ({
      dateRange: s.filters?.dateRange?.start ? s.filters.dateRange : null,
      location: s.filters?.location ?? null,
      mediaType: s.filters?.mediaType ?? [],
      hashtags: s.filters?.hashtags ?? []
    })
  }
};
