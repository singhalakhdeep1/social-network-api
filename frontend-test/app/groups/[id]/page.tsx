'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Composer from '@/components/Composer';
import PostCard, { PostData } from '@/components/PostCard';
import { Avatar, Badge, Card, Empty, ErrorText, Loading, UserLike } from '@/components/ui';
import { APPROVE_MEMBER, GROUP, JOIN_GROUP, LEAVE_GROUP } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface GroupData {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  category: string;
  rules: string[];
  memberCount: number;
  isMember: boolean;
  isAdmin: boolean;
  hasRequestedToJoin: boolean;
  pendingMembers: UserLike[];
  members: UserLike[];
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data, error, refetch } = useQuery<{ group: GroupData; groupPosts: { nodes: PostData[] } }>(GROUP, { variables: { id } });
  const [join] = useMutation(JOIN_GROUP);
  const [leave] = useMutation(LEAVE_GROUP);
  const [approve] = useMutation(APPROVE_MEMBER);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const g = data.group;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        <Card>
          <h1 className="text-2xl font-bold">{g.name} {g.isPrivate && <Badge tone="amber">Private</Badge>}</h1>
          <p className="text-slate-600">{g.description}</p>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
            {g.memberCount} members · {g.category}
            {me && (g.isMember ? (
              !g.isAdmin && <button className="btn-secondary px-3 py-1" onClick={async () => { await leave({ variables: { id } }); void refetch(); }}>Leave</button>
            ) : g.hasRequestedToJoin ? <Badge tone="amber">Join request sent</Badge> : (
              <button className="btn-primary px-3 py-1" onClick={async () => { await join({ variables: { id } }); void refetch(); }}>{g.isPrivate ? 'Request to join' : 'Join group'}</button>
            ))}
          </div>
        </Card>
        {g.isMember && <Composer groupId={g.id} placeholder={`Post in ${g.name}…`} onPosted={() => void refetch()} />}
        {data.groupPosts.nodes.length === 0 ? <Empty>{g.isPrivate && !g.isMember ? 'Join this private group to see its posts.' : 'No posts yet.'}</Empty> : data.groupPosts.nodes.map((p) => <PostCard key={p.id} post={p} meId={me?.id} onChanged={() => void refetch()} />)}
      </div>
      <aside className="space-y-4">
        {g.isAdmin && g.pendingMembers.length > 0 && (
          <Card title="Join requests">
            {g.pendingMembers.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{u.username}</span>
                <span className="flex gap-2">
                  <button className="text-emerald-600" onClick={async () => { await approve({ variables: { id, userId: u.id, approve: true } }); void refetch(); }}>Approve</button>
                  <button className="text-rose-600" onClick={async () => { await approve({ variables: { id, userId: u.id, approve: false } }); void refetch(); }}>Decline</button>
                </span>
              </div>
            ))}
          </Card>
        )}
        {g.rules.length > 0 && <Card title="Rules"><ol className="list-inside list-decimal text-sm text-slate-600">{g.rules.map((r) => <li key={r}>{r}</li>)}</ol></Card>}
        <Card title="Members">
          {g.members.map((u) => (
            <Link key={u.id} href={`/u/${u.username}`} className="mb-2 flex items-center gap-2 text-sm"><Avatar user={u} size={24} /> {u.displayName || u.username}</Link>
          ))}
        </Card>
      </aside>
    </div>
  );
}
