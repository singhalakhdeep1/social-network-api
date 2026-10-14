/**
 * Social graph abstraction. MongoDB (Follow collection) is always the source of truth;
 * Neo4j and JanusGraph are optional projections that serve graph traversals.
 */
export interface GraphUserNode {
  id: string;
  username: string;
  displayName?: string;
}

export interface GraphPostNode {
  id: string;
  authorId: string;
  createdAt: Date;
}

export interface GraphPath {
  userIds: string[];
  distance: number;
}

export interface GraphRecommendation {
  userId: string;
  mutualCount: number;
}

export interface GraphProvider {
  readonly name: 'mongo' | 'neo4j' | 'janusgraph';
  init(): Promise<void>;
  close(): Promise<void>;
  healthy(): Promise<boolean>;

  upsertUser(user: GraphUserNode): Promise<void>;
  follow(followerId: string, followingId: string): Promise<void>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  upsertPost(post: GraphPostNode): Promise<void>;
  removePost(postId: string): Promise<void>;
  like(userId: string, postId: string): Promise<void>;
  unlike(userId: string, postId: string): Promise<void>;

  /** Shortest chain of follows from `fromId` to `toId` (inclusive of both ends), or null. */
  shortestPath(fromId: string, toId: string, maxDepth?: number): Promise<GraphPath | null>;
  /** Users followed by both `a` and `b`. */
  mutualConnections(a: string, b: string, limit?: number): Promise<string[]>;
  /** Friends-of-friends the user does not follow yet, ranked by number of shared connections. */
  recommendations(userId: string, limit?: number): Promise<GraphRecommendation[]>;
}
