'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import SignInPrompt from '@/components/SignInPrompt';
import { Avatar, Empty, Loading, UserLike, timeAgo } from '@/components/ui';
import { MARK_ALL_READ, MARK_READ, NOTIFICATIONS } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  sender: UserLike | null;
  post: { id: string } | null;
}

const ICONS: Record<string, string> = { like: '♥', comment: '💬', follow: '👤', mention: '@', reply: '↩', reaction: '☺', message: '✉', event: '📅', group: '👥', tip: '💰', subscription: '⭐', system: 'ℹ' };

export default function NotificationsPage() {
  const { signedIn } = useMe();
  const { data, refetch, fetchMore } = useQuery<{ notifications: { nodes: NotificationItem[]; nextCursor: string | null; hasMore: boolean }; unreadNotificationCount: number }>(NOTIFICATIONS, { skip: !signedIn });
  const [markRead] = useMutation(MARK_READ);
  const [markAll] = useMutation(MARK_ALL_READ, { refetchQueries: ['Me'] });
  if (!signedIn) return <SignInPrompt what="see your notifications" />;
  if (!data) return <Loading />;
  const items = data.notifications.nodes;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {data.unreadNotificationCount > 0 && <button className="btn-secondary" onClick={async () => { await markAll(); void refetch(); }}>Mark all as read</button>}
      </div>
      {items.length === 0 ? (
        <Empty>No notifications yet.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex items-center gap-3 px-4 py-3 ${n.read ? '' : 'bg-indigo-50/60'}`} data-testid="notification">
              <span className="w-6 text-center text-lg">{ICONS[n.type] ?? '•'}</span>
              {n.sender && <Avatar user={n.sender} size={32} />}
              <div className="min-w-0 flex-1 text-sm">
                {n.post ? <Link href={`/p/${n.post.id}`} className="hover:underline" onClick={() => !n.read && markRead({ variables: { id: n.id } })}>{n.message}</Link> : n.sender ? <Link href={`/u/${n.sender.username}`} className="hover:underline">{n.message}</Link> : n.message}
                <div className="text-xs text-slate-500">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.read && <button className="text-xs text-indigo-600" onClick={() => markRead({ variables: { id: n.id }, refetchQueries: ['Me'] })}>Mark read</button>}
            </li>
          ))}
        </ul>
      )}
      {data.notifications.hasMore && (
        <button className="btn-secondary w-full" onClick={() => fetchMore({ variables: { cursor: data.notifications.nextCursor }, updateQuery: (prev, { fetchMoreResult }) => ({ ...fetchMoreResult, notifications: { ...fetchMoreResult.notifications, nodes: [...prev.notifications.nodes, ...fetchMoreResult.notifications.nodes] } }) })}>
          Load older
        </button>
      )}
    </div>
  );
}
