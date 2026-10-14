/**
 * Transport-neutral DTOs for the tRPC and gRPC APIs (GraphQL resolves fields lazily instead).
 */
import { HydratedDocument } from 'mongoose';
import { IUser } from '../models/User';
import { IPost } from '../models/Post';
import { IComment } from '../models/Comment';

export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  isVerified: boolean;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  createdAt: string;
}

export interface PostDTO {
  id: string;
  authorId: string;
  content: string;
  media: { url: string; type: string }[];
  hashtags: string[];
  likeCount: number;
  commentCount: number;
  sharesCount: number;
  reactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentDTO {
  id: string;
  postId: string;
  authorId: string;
  parentId: string;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
}

export const userDTO = (u: HydratedDocument<IUser>): UserDTO => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName ?? '',
  bio: u.bio ?? '',
  avatar: u.avatar ?? '',
  isVerified: u.isVerified,
  isPrivate: u.isPrivate,
  followerCount: u.followerCount,
  followingCount: u.followingCount,
  postCount: u.postCount,
  createdAt: u.createdAt.toISOString()
});

export const postDTO = (p: HydratedDocument<IPost>): PostDTO => ({
  id: p.id,
  authorId: p.author.toString(),
  content: p.content,
  media: (p.media ?? []).map((m) => ({ url: m.url, type: m.type })),
  hashtags: p.hashtags ?? [],
  likeCount: p.likeCount,
  commentCount: p.commentCount,
  sharesCount: p.sharesCount,
  reactionCount: p.reactionCount,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString()
});

export const commentDTO = (c: HydratedDocument<IComment>): CommentDTO => ({
  id: c.id,
  postId: c.post.toString(),
  authorId: c.author.toString(),
  parentId: c.parent ? c.parent.toString() : '',
  content: c.content,
  likeCount: c.likeCount,
  replyCount: c.replyCount,
  createdAt: c.createdAt.toISOString()
});
