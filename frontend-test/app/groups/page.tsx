'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Badge, Card, ErrorText, Loading } from '@/components/ui';
import { CREATE_GROUP, GROUPS, JOIN_GROUP } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface GroupRow {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  category: string;
  memberCount: number;
  isMember: boolean;
  hasRequestedToJoin: boolean;
}

export default function GroupsPage() {
  const { signedIn } = useMe();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data, refetch } = useQuery<{ groups: { nodes: GroupRow[] }; myGroups: Array<{ id: string; name: string }> }>(GROUPS, { skip: !signedIn, variables: { search: search || null } });
  const [join] = useMutation(JOIN_GROUP);
  const [create, createState] = useMutation(CREATE_GROUP);
  if (!signedIn) return <SignInPrompt what="browse groups" />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await create({ variables: { name: f.get('name'), description: f.get('description'), isPrivate: f.get('private') === 'on', category: f.get('category') || 'general' } }).catch(() => null);
    if (res) router.push(`/groups/${res.data.createGroup.id}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <input className="input" placeholder="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search groups" />
        {!data ? <Loading /> : data.groups.nodes.map((g) => (
          <Card key={g.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/groups/${g.id}`} className="text-lg font-semibold hover:underline">{g.name}</Link> {g.isPrivate && <Badge tone="amber">Private</Badge>} <Badge>{g.category}</Badge>
                <p className="text-sm text-slate-600">{g.description}</p>
                <p className="text-xs text-slate-400">{g.memberCount} members</p>
              </div>
              {g.isMember ? <Badge tone="emerald">Member</Badge> : g.hasRequestedToJoin ? <Badge tone="amber">Requested</Badge> : (
                <button className="btn-primary px-3 py-1" onClick={async () => { await join({ variables: { id: g.id } }); void refetch(); }}>{g.isPrivate ? 'Request to join' : 'Join'}</button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <aside className="space-y-4">
        <Card title="Your groups">
          {data?.myGroups.length === 0 && <p className="text-sm text-slate-500">Not in any group yet.</p>}
          {data?.myGroups.map((g) => <Link key={g.id} href={`/groups/${g.id}`} className="block text-sm text-indigo-600">{g.name}</Link>)}
        </Card>
        <Card title="Create a group">
          <form onSubmit={submit} className="space-y-2">
            <input name="name" className="input" placeholder="Name" required minLength={3} maxLength={100} />
            <textarea name="description" className="input" placeholder="What is it about?" required maxLength={1000} />
            <input name="category" className="input" placeholder="Category (e.g. sports)" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="private" /> Private (approve members)</label>
            <button className="btn-primary w-full" disabled={createState.loading}>Create</button>
          </form>
          <ErrorText error={createState.error} />
        </Card>
      </aside>
    </div>
  );
}
