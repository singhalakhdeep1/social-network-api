// Neo4j client for social-network-api

import neo4j, { Driver, Session } from 'neo4j-driver';

class Neo4jService {
  private driver: Driver;

  constructor(uri: string, username: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }

  async createUser(user: any) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'CREATE (u:User {id: $id, username: $username, email: $email, displayName: $displayName, bio: $bio, createdAt: datetime(), updatedAt: datetime()}) RETURN u',
        {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          bio: user.bio || ''
        }
      );
      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  async getUserById(id: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $id}) RETURN u',
        { id }
      );
      if (result.records.length === 0) return null;
      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  async updateUser(id: string, updates: any) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $id}) SET u += $updates, u.updatedAt = datetime() RETURN u',
        { id, updates }
      );
      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  async createPost(post: any) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $authorId}) CREATE (p:Post {id: $id, content: $content, images: $images, createdAt: datetime(), updatedAt: datetime()}) CREATE (u)-[:AUTHORED]->(p) RETURN p',
        {
          authorId: post.authorId,
          id: post.id,
          content: post.content,
          images: post.images || []
        }
      );
      return result.records[0].get('p').properties;
    } finally {
      await session.close();
    }
  }

  async follow(followerId: string, followingId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (follower:User {id: $followerId}), (following:User {id: $followingId}) CREATE (follower)-[:FOLLOWS {createdAt: datetime()}]->(following) RETURN follower, following',
        { followerId, followingId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async unfollow(followerId: string, followingId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (follower:User {id: $followerId})-[r:FOLLOWS]->(following:User {id: $followingId}) DELETE r',
        { followerId, followingId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async getFollowers(userId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId})<-[:FOLLOWS]-(follower:User) RETURN follower',
        { userId }
      );
      return result.records.map(record => record.get('follower').properties);
    } finally {
      await session.close();
    }
  }

  async getFollowing(userId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId})-[:FOLLOWS]->(following:User) RETURN following',
        { userId }
      );
      return result.records.map(record => record.get('following').properties);
    } finally {
      await session.close();
    }
  }

  async getShortestPath(fromUserId: string, toUserId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (from:User {id: $fromUserId}), (to:User {id: $toUserId}), path = shortestPath((from)-[:FOLLOWS*]-(to)) RETURN path',
        { fromUserId, toUserId }
      );
      if (result.records.length === 0) return { user_ids: [], distance: 0 };
      const path = result.records[0].get('path');
      return {
        user_ids: path.segments.map((seg: any) => seg.start.properties.id).concat(path.end.properties.id),
        distance: path.length
      };
    } finally {
      await session.close();
    }
  }

  async getMutualFriends(userId1: string, userId2: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u1:User {id: $userId1})-[:FOLLOWS]-(mutual:User)-[:FOLLOWS]-(u2:User {id: $userId2}) RETURN DISTINCT mutual',
        { userId1, userId2 }
      );
      return result.records.map(record => record.get('mutual').properties);
    } finally {
      await session.close();
    }
  }

  async getRecommendations(userId: string, limit = 10) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId})-[:FOLLOWS]->(friend)-[:FOLLOWS]->(suggestion:User) WHERE NOT (u)-[:FOLLOWS]->(suggestion) AND u.id <> suggestion.id RETURN suggestion LIMIT $limit',
        { userId, limit }
      );
      return result.records.map(record => record.get('suggestion').properties);
    } finally {
      await session.close();
    }
  }

  async getFeed(userId: string, limit = 20) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId})-[:FOLLOWS*1..2]->(author:User)-[:AUTHORED]->(post:Post) RETURN DISTINCT post ORDER BY post.createdAt DESC LIMIT $limit',
        { userId, limit }
      );
      return result.records.map(record => record.get('post').properties);
    } finally {
      await session.close();
    }
  }

  async likePost(userId: string, postId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId}), (p:Post {id: $postId}) CREATE (u)-[:LIKES {createdAt: datetime()}]->(p) RETURN u, p',
        { userId, postId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async unlikePost(userId: string, postId: string) {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $userId})-[r:LIKES]->(p:Post {id: $postId}) DELETE r',
        { userId, postId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }
}

export default Neo4jService;
