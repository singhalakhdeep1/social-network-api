/** Access + refresh tokens in localStorage, with transparent refresh shortly before the access token expires. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const GRAPHQL_URL = `${API_URL}/graphql`;
export const WS_URL = GRAPHQL_URL.replace(/^http/, 'ws');

const ACCESS = 'sn.access';
const REFRESH = 'sn.refresh';

const read = (key: string): string | null => {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: tokens live for this page only */
  }
};

export const session = {
  access: () => read(ACCESS),
  refresh: () => read(REFRESH),
  set(access: string, refresh: string) {
    write(ACCESS, access);
    write(REFRESH, refresh);
  },
  clear() {
    write(ACCESS, null);
    write(REFRESH, null);
  },
};

function expiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

let inflight: Promise<string | null> | null = null;

/** A valid access token, refreshing it (once, shared by concurrent callers) when it expires within 30 s. */
export async function validAccessToken(): Promise<string | null> {
  const access = session.access();
  if (!access) return null;
  if (expiresAt(access) - Date.now() > 30_000) return access;
  const refresh = session.refresh();
  if (!refresh) return access;
  inflight ??= (async () => {
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'mutation($t:String!){ refreshToken(refreshToken:$t){ accessToken refreshToken } }', variables: { t: refresh } }),
      });
      const json = (await res.json()) as { data?: { refreshToken: { accessToken: string; refreshToken: string } } };
      if (!json.data) {
        session.clear();
        return null;
      }
      session.set(json.data.refreshToken.accessToken, json.data.refreshToken.refreshToken);
      return json.data.refreshToken.accessToken;
    } finally {
      setTimeout(() => (inflight = null), 0);
    }
  })();
  return inflight;
}

/** Media URLs from the API are relative (/uploads/...); make them absolute. */
export const mediaUrl = (url: string | null | undefined): string | undefined => (url ? (url.startsWith('/') ? `${API_URL}${url}` : url) : undefined);
