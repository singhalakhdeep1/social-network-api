/**
 * JWT AUTHENTICATION MIDDLEWARE
 * 
 * CURRICULUM COVERAGE:
 * #676-700: JWT Token Verification
 */

import jwt from 'jsonwebtoken';
import User from '../models/User';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export const authMiddleware = async (token: string): Promise<AuthUser | null> => {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'social-media-secret') as any;
    const user = await User.findById(decoded.id);

    if (!user) {
      return null;
    }

    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username
    };
  } catch (error) {
    return null;
  }
};

export const fieldLevelAuth = (user: AuthUser | null, resourceOwnerId: string, field: string): boolean => {
  if (!user) return false;
  
  // Admin can access everything
  if (user.email.includes('admin')) return true;
  
  // Users can access their own data
  if (user.id === resourceOwnerId) return true;
  
  // Public fields
  const publicFields = ['id', 'username', 'bio', 'avatar', 'createdAt'];
  if (publicFields.includes(field)) return true;
  
  return false;
};
