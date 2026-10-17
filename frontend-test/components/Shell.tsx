'use client';

import { useApolloClient, useQuery, useSubscription } from '@apollo/client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { useAuth } from '@/lib/apollo';
import { ME, NOTIFICATION_ADDED } from '@/lib/gql';
import { Avatar } from './ui';

const NAV = [
  ['/', 'Home', '🏠'],
  ['/explore', 'Explore', '🧭'],
  ['/notifications', 'Notifications', '🔔'],
  ['/messages', 'Messages', '✉️'],
  ['/stories', 'Stories', '⭕'],
  ['/groups', 'Groups', '👥'],
  ['/events', 'Events', '📅'],
  ['/pages', 'Pages', '🏷️'],
  ['/drafts', 'Drafts', '📝'],
  ['/creator', 'Creator', '💰'],
  ['/settings', 'Settings', '⚙️'],
] as const;

export interface Me {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: string;
  emailVerified: boolean;
}

/** App frame: left navigation, search, live notification badge (WebSocket) and a toast for new notifications. */
export default function Shell({ children }: { children: ReactNode }) {
  const { signedIn, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const client = useApolloClient();
  const { data } = useQuery<{ me: Me | null; unreadNotificationCount: number }>(ME, { skip: !signedIn });
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useSubscription<{ notificationAdded: { message: string } }>(NOTIFICATION_ADDED, {
    skip: !signedIn,
    onData: ({ data: event }) => {
      if (!event.data) return;
      setToast(event.data.notificationAdded.message);
      setTimeout(() => setToast(null), 5000);
      void client.refetchQueries({ include: ['Me', 'Notifications'] });
    },
  });

  const me = data?.me;
  const unread = data?.unreadNotificationCount ?? 0;
  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const publicPage = ['/login', '/verify-email', '/reset-password'].some((p) => pathname.startsWith(p));
  if (publicPage) return <main className="mx-auto max-w-md px-4 py-12">{children}</main>;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[13rem_1fr]">
      <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
        <Link href="/" className="mb-4 block text-2xl font-bold text-indigo-600">
          Circle
        </Link>
        <form onSubmit={search} className="mb-4">
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </form>
        {signedIn ? (
          <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
            {NAV.map(([href, label, icon]) => (
              <Link key={href} href={href} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${pathname === href ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}>
                <span>{icon}</span>
                {label}
                {href === '/notifications' && unread > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-xs text-white" data-testid="unread-badge">{unread}</span>}
              </Link>
            ))}
            {me?.role === 'admin' && (
              <Link href="/admin" className="rounded-xl px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
                🛡️ Admin
              </Link>
            )}
          </nav>
        ) : (
          <div className="space-y-2">
            <Link href="/explore" className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              🧭 Explore
            </Link>
            <Link href="/login" className="btn-primary w-full">
              Sign in
            </Link>
          </div>
        )}
        {me && (
          <div className="mt-6 flex items-center gap-2 border-t border-slate-200 pt-4">
            <Avatar user={me} size={32} />
            <Link href={`/u/${me.username}`} className="min-w-0 flex-1 truncate text-sm font-medium">
              {me.displayName || me.username}
            </Link>
            <button
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={async () => {
                await signOut();
                router.push('/login');
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="min-w-0">
        {me && !me.emailVerified && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">Please verify your email address: check your inbox for the link.</div>}
        {children}
      </main>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl" role="status">
          🔔 {toast}
        </div>
      )}
    </div>
  );
}
