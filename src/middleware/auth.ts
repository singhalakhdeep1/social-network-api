/**
 * JWT authentication for every transport (GraphQL HTTP, GraphQL WebSocket, tRPC, gRPC).
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import User from '../models/User';
import { forbidden, unauthenticated } from '../utils/errors';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AccessTokenPayload {
  sub: string;
  usr: string;
}

export const signAccessToken = (user: { id: string; username: string }): string =>
  jwt.sign({ sub: user.id, usr: user.username } satisfies AccessTokenPayload, env.jwtSecret, { expiresIn: env.jwtExpire as jwt.SignOptions['expiresIn'] });

export const extractBearer = (header?: string | null): string | undefined => {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
};

/** Resolves a bearer token to the current user, or null when missing / invalid / user deleted. */
export const authenticate = async (token?: string | null): Promise<AuthUser | null> => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    const user = await User.findById(decoded.sub).select('username email role');
    if (!user) return null;
    return { id: user.id, username: user.username, email: user.email, role: user.role };
  } catch {
    return null;
  }
};

export const requireUser = (user: AuthUser | null | undefined): AuthUser => {
  if (!user) throw unauthenticated();
  return user;
};

export const requireAdmin = (user: AuthUser | null | undefined): AuthUser => {
  const u = requireUser(user);
  if (u.role !== 'admin') throw forbidden('Admin access required');
  return u;
};

/** Field-level rule: private fields are visible to the owner and admins only. */
export const canSeePrivateFields = (viewer: AuthUser | null | undefined, ownerId: string): boolean =>
  !!viewer && (viewer.id === ownerId || viewer.role === 'admin');
