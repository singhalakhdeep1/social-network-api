'use client';

import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import createUploadLink from 'apollo-upload-client/createUploadLink.mjs';
import { createClient } from 'graphql-ws';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GRAPHQL_URL, WS_URL, session, validAccessToken } from './session';

/** Uploads (multipart) and plain queries share one HTTP link; the preflight header satisfies Apollo's CSRF check. */
function httpLink(): ApolloLink {
  return createUploadLink({
    uri: GRAPHQL_URL,
    headers: { 'apollo-require-preflight': 'true' },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await validAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
}

function makeClient(): ApolloClient<unknown> {
  const http = httpLink();
  const link =
    typeof window === 'undefined'
      ? http
      : split(
          ({ query }) => {
            const def = getMainDefinition(query);
            return def.kind === 'OperationDefinition' && def.operation === 'subscription';
          },
          new GraphQLWsLink(createClient({ url: WS_URL, lazy: true, retryAttempts: Infinity, connectionParams: async () => ({ authToken: await validAccessToken() }) })),
          http,
        );
  return new ApolloClient({
    link,
    cache: new InMemoryCache({
      typePolicies: {
        Query: { fields: { feed: { keyArgs: false }, notifications: { keyArgs: ['unreadOnly'] } } },
      },
    }),
    defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
  });
}

interface AuthState {
  signedIn: boolean;
  signIn: (access: string, refresh: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ signedIn: false, signIn: () => undefined, signOut: async () => undefined });
export const useAuth = () => useContext(AuthContext);

/**
 * Owns the Apollo client. Signing in or out creates a fresh client so the cache and the
 * WebSocket connection never carry another user's data.
 */
export function ApolloWrapper({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(Boolean(session.access()));
  }, []);
  const client = useMemo(() => makeClient(), [generation]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback((access: string, refresh: string) => {
    session.set(access, refresh);
    setSignedIn(true);
    setGeneration((g) => g + 1);
  }, []);

  const signOut = useCallback(async () => {
    const refresh = session.refresh();
    if (refresh) await client.mutate({ mutation: (await import('./gql')).LOGOUT, variables: { refreshToken: refresh } }).catch(() => undefined);
    session.clear();
    setSignedIn(false);
    await client.clearStore().catch(() => undefined);
    setGeneration((g) => g + 1);
  }, [client]);

  const auth = useMemo(() => ({ signedIn, signIn, signOut }), [signedIn, signIn, signOut]);
  return (
    <AuthContext.Provider value={auth}>
      <ApolloProvider client={client}>{children}</ApolloProvider>
    </AuthContext.Provider>
  );
}
