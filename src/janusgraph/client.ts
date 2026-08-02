// JanusGraph client for social-network-api

import gremlin from 'gremlin';

class JanusGraphService {
  private client: any;

  constructor(url = 'ws://localhost:8182/gremlin') {
    const traversal = gremlin.process.AnonymousTraversalSource.traversal;
    this.client = traversal().withRemote(new gremlin.driver.Driver(url, new gremlin.driver.Authenticator('none')));
  }

  async createUser(user: any) {
    const result = await this.client.addV('User')
      .property('id', user.id)
      .property('username', user.username)
      .property('email', user.email)
      .property('displayName', user.displayName)
      .property('bio', user.bio || '')
      .property('createdAt', new Date().toISOString())
      .property('updatedAt', new Date().toISOString())
      .next();
    return result;
  }

  async getUserById(id: string) {
    const result = await this.client.V().has('User', 'id', id).valueMap().next();
    if (result.length === 0) return null;
    const properties = result[0];
    return {
      id: properties.get('id'),
      username: properties.get('username'),
      email: properties.get('email'),
      displayName: properties.get('displayName'),
      bio: properties.get('bio'),
      createdAt: properties.get('createdAt'),
      updatedAt: properties.get('updatedAt')
    };
  }

  async updateUser(id: string, updates: any) {
    const vertex = await this.client.V().has('User', 'id', id).next();
    for (const [key, value] of Object.entries(updates)) {
      await this.client.V(vertex.id).property(key, value).next();
    }
    await this.client.V(vertex.id).property('updatedAt', new Date().toISOString()).next();
    return this.getUserById(id);
  }

  async createPost(post: any) {
    const author = await this.client.V().has('User', 'id', post.authorId).next();
    const result = await this.client.addV('Post')
      .property('id', post.id)
      .property('content', post.content)
      .property('images', post.images || [])
      .property('createdAt', new Date().toISOString())
      .property('updatedAt', new Date().toISOString())
      .addE('AUTHORED').from(author).next();
    return result;
  }

  async follow(followerId: string, followingId: string) {
    const follower = await this.client.V().has('User', 'id', followerId).next();
    const following = await this.client.V().has('User', 'id', followingId).next();
    await this.client.V(follower.id).addE('FOLLOWS').property('createdAt', new Date().toISOString()).to(following).next();
    return { success: true };
  }

  async unfollow(followerId: string, followingId: string) {
    const follower = await this.client.V().has('User', 'id', followerId).next();
    const following = await this.client.V().has('User', 'id', followingId).next();
    await this.client.V(follower.id).outE('FOLLOWS').where(__.otherV().is(following)).drop().next();
    return { success: true };
  }

  async getFollowers(userId: string) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const result = await this.client.V(user.id).in('FOLLOWS').valueMap().next();
    return result.map((r: any) => ({
      id: r.get('id'),
      username: r.get('username'),
      email: r.get('email'),
      displayName: r.get('displayName'),
      bio: r.get('bio')
    }));
  }

  async getFollowing(userId: string) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const result = await this.client.V(user.id).out('FOLLOWS').valueMap().next();
    return result.map((r: any) => ({
      id: r.get('id'),
      username: r.get('username'),
      email: r.get('email'),
      displayName: r.get('displayName'),
      bio: r.get('bio')
    }));
  }

  async getShortestPath(fromUserId: string, toUserId: string) {
    const fromUser = await this.client.V().has('User', 'id', fromUserId).next();
    const toUser = await this.client.V().has('User', 'id', toUserId).next();
    const result = await this.client.V(fromUser.id).repeat(__.out('FOLLOWS')).until(__.is(toUser)).path().limit(1).next();
    if (result.length === 0) return { user_ids: [], distance: 0 };
    const path = result[0];
    return {
      user_ids: path.objects.map((obj: any) => obj.id),
      distance: path.objects.length - 1
    };
  }

  async getMutualFriends(userId1: string, userId2: string) {
    const user1 = await this.client.V().has('User', 'id', userId1).next();
    const user2 = await this.client.V().has('User', 'id', userId2).next();
    const result = await this.client.V(user1.id).out('FOLLOWS').in('FOLLOWS').where(__.is(user2)).dedup().valueMap().next();
    return result.map((r: any) => ({
      id: r.get('id'),
      username: r.get('username'),
      email: r.get('email'),
      displayName: r.get('displayName'),
      bio: r.get('bio')
    }));
  }

  async getRecommendations(userId: string, limit = 10) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const result = await this.client.V(user.id).out('FOLLOWS').out('FOLLOWS').where(__.not(__.in('FOLLOWS').from(user))).where(__.not(__.is(user))).dedup().limit(limit).valueMap().next();
    return result.map((r: any) => ({
      id: r.get('id'),
      username: r.get('username'),
      email: r.get('email'),
      displayName: r.get('displayName'),
      bio: r.get('bio')
    }));
  }

  async getFeed(userId: string, limit = 20) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const result = await this.client.V(user.id).repeat(__.out('FOLLOWS')).times(2).out('AUTHORED').dedup().order().by('createdAt', dec).limit(limit).valueMap().next();
    return result.map((r: any) => ({
      id: r.get('id'),
      authorId: r.get('authorId'),
      content: r.get('content'),
      images: r.get('images'),
      createdAt: r.get('createdAt'),
      updatedAt: r.get('updatedAt')
    }));
  }

  async likePost(userId: string, postId: string) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const post = await this.client.V().has('Post', 'id', postId).next();
    await this.client.V(user.id).addE('LIKES').property('createdAt', new Date().toISOString()).to(post).next();
    return { success: true };
  }

  async unlikePost(userId: string, postId: string) {
    const user = await this.client.V().has('User', 'id', userId).next();
    const post = await this.client.V().has('Post', 'id', postId).next();
    await this.client.V(user.id).outE('LIKES').where(__.otherV().is(post)).drop().next();
    return { success: true };
  }

  async close() {
    await this.client.close();
  }
}

export default JanusGraphService;
