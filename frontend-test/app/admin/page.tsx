'use client';

import { useLazyQuery, useMutation } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { Avatar, Badge, Card, Empty, ErrorText, UserLike } from '@/components/ui';
import { SEARCH, SET_VERIFIED } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

export default function AdminPage() {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [find, { data, refetch }] = useLazyQuery<{ search: { users: Array<UserLike & { followerCount: number }> } }>(SEARCH);
  const [setVerified, { error }] = useMutation(SET_VERIFIED);
  if (me?.role !== 'admin') return <Empty>Admins only.</Empty>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) void find({ variables: { q: q.trim() } });
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <Card title="Verified accounts">
        <form onSubmit={submit} className="mb-3 flex gap-2">
          <input className="input" placeholder="Find a user" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a user" />
          <button className="btn-secondary">Search</button>
        </form>
        <ErrorText error={error} />
        {data?.search.users.map((u) => (
          <div key={u.id} className="mb-2 flex items-center gap-3 text-sm">
            <Avatar user={u} size={32} />
            <span className="flex-1">{u.displayName || u.username} <span className="text-slate-500">@{u.username} · {u.followerCount} followers</span> {u.isVerified && <Badge tone="indigo">verified</Badge>}</span>
            <button className="btn-secondary px-3 py-1" onClick={async () => { await setVerified({ variables: { userId: u.id, verified: !u.isVerified } }); void refetch(); }}>
              {u.isVerified ? 'Remove check' : 'Verify'}
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
