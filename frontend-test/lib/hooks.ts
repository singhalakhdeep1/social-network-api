'use client';

import { useQuery } from '@apollo/client';
import { useAuth } from './apollo';
import { ME } from './gql';

export interface MeData {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  bio: string | null;
  avatar: string | null;
  website: string | null;
  location: string | null;
  interests: string[];
  role: string;
  isPrivate: boolean;
  isVerified: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  notificationPreferences: Record<string, boolean> | null;
}

export function useMe() {
  const { signedIn } = useAuth();
  const { data, loading, refetch } = useQuery<{ me: MeData | null }>(ME, { skip: !signedIn });
  return { me: data?.me ?? null, loading: signedIn && loading && !data, signedIn, refetch };
}
