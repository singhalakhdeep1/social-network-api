/**
 * ELASTICSEARCH CONFIGURATION
 * 
 * Client setup for advanced search functionality
 */

import { Client } from '@elastic/elasticsearch';

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

const client = new Client({
  node: ELASTICSEARCH_URL,
  maxRetries: 3,
  requestTimeout: 30000,
  sniffOnStart: false
});

/**
 * Test Elasticsearch connection
 */
export const testConnection = async () => {
  try {
    await client.ping();
    console.log('✅ Elasticsearch Connected');
    return true;
  } catch (error) {
    console.error('❌ Elasticsearch Connection Failed:', error);
    return false;
  }
};

/**
 * Create index if it doesn't exist
 */
export const createIndex = async (indexName: string, mapping: any) => {
  try {
    const exists = await client.indices.exists({ index: indexName });
    
    if (!exists) {
      await client.indices.create({
        index: indexName,
        body: { mappings: mapping }
      });
      console.log(`✅ Created index: ${indexName}`);
    } else {
      console.log(`ℹ️ Index already exists: ${indexName}`);
    }
  } catch (error) {
    console.error(`❌ Error creating index ${indexName}:`, error);
  }
};

/**
 * Index mappings for posts
 */
export const postIndexMapping = {
  properties: {
    content: { type: 'text', analyzer: 'standard' },
    author: { type: 'keyword' },
    hashtags: { type: 'keyword' },
    mentions: { type: 'keyword' },
    createdAt: { type: 'date' },
    likeCount: { type: 'integer' },
    commentCount: { type: 'integer' },
    isArchived: { type: 'boolean' }
  }
};

/**
 * Index mappings for users
 */
export const userIndexMapping = {
  properties: {
    username: { type: 'text', analyzer: 'standard' },
    bio: { type: 'text', analyzer: 'standard' },
    email: { type: 'keyword' },
    followerCount: { type: 'integer' },
    createdAt: { type: 'date' }
  }
};

/**
 * Initialize all indices
 */
export const initializeIndices = async () => {
  await createIndex('posts', postIndexMapping);
  await createIndex('users', userIndexMapping);
};

/**
 * Index a post document
 */
export const indexPost = async (postId: string, post: any) => {
  try {
    await client.index({
      index: 'posts',
      id: postId,
      body: {
        content: post.content,
        author: post.author.toString(),
        hashtags: post.hashtags || [],
        mentions: post.mentions || [],
        createdAt: post.createdAt,
        likeCount: post.likes?.length || 0,
        commentCount: post.commentCount || 0,
        isArchived: post.isArchived || false
      }
    });
  } catch (error) {
    console.error('❌ Error indexing post:', error);
  }
};

/**
 * Index a user document
 */
export const indexUser = async (userId: string, user: any) => {
  try {
    await client.index({
      index: 'users',
      id: userId,
      body: {
        username: user.username,
        bio: user.bio || '',
        email: user.email,
        followerCount: user.followers?.length || 0,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error indexing user:', error);
  }
};

/**
 * Search posts with filters
 */
export const searchPosts = async (query: string, filters: any = {}) => {
  try {
    const searchBody: any = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['content', 'hashtags'],
                fuzziness: 'AUTO'
              }
            }
          ],
          filter: [
            { term: { isArchived: false } }
          ]
        }
      }
    };

    if (filters.dateRange) {
      searchBody.query.bool.filter.push({
        range: {
          createdAt: {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end
          }
        }
      });
    }

    if (filters.hashtags && filters.hashtags.length > 0) {
      searchBody.query.bool.filter.push({
        terms: { hashtags: filters.hashtags }
      });
    }

    const response = await client.search({
      index: 'posts',
      body: searchBody,
      size: filters.limit || 20
    });

    return response.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source
    }));
  } catch (error) {
    console.error('❌ Error searching posts:', error);
    return [];
  }
};

/**
 * Search users
 */
export const searchUsers = async (query: string, limit: number = 20) => {
  try {
    const response = await client.search({
      index: 'users',
      body: {
        query: {
          multi_match: {
            query,
            fields: ['username', 'bio'],
            fuzziness: 'AUTO'
          }
        }
      },
      size: limit
    });

    return response.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source
    }));
  } catch (error) {
    console.error('❌ Error searching users:', error);
    return [];
  }
};

/**
 * Get autocomplete suggestions
 */
export const getAutocompleteSuggestions = async (query: string, limit: number = 10) => {
  try {
    const response = await client.search({
      index: 'users',
      body: {
        query: {
          prefix: {
            username: {
              value: query,
              case_insensitive: true
            }
          }
        },
        size: limit
      }
    });

    return response.hits.hits.map((hit: any) => hit._source.username);
  } catch (error) {
    console.error('❌ Error getting autocomplete suggestions:', error);
    return [];
  }
};

/**
 * Delete document from index
 */
export const deleteFromIndex = async (indexName: string, id: string) => {
  try {
    await client.delete({ index: indexName, id });
  } catch (error) {
    console.error(`❌ Error deleting from index ${indexName}:`, error);
  }
};

export default client;
