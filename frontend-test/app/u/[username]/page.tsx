'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import PostCard, { PostData } from '@/components/PostCard';
import { Avatar, Badge, Card, Empty, ErrorText, Loading, UserLike } from '@/components/ui';
import { CREATE_CONVERSATION, FOLLOW, FOLLOWERS, PROFILE, SEND_TIP, SUBSCRIBE, TIERS, TRACK, UNFOLLOW, USER_CONNECTIONS } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface Profile extends UserLike {
  bio: string | null;
  website: string | null;
  location: string | null;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isMe: boolean;
  createdAt: string;
  posts: { nodes: PostData[] };
  highlights: Array<{ id: string; title: string; coverUrl: string }>;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { data, error, refetch } = useQuery<{ userByUsername: Profile }>(PROFILE, { variables: { username } });
  const [follow] = useMutation(FOLLOW);
  const [unfollow] = useMutation(UNFOLLOW);
  const [startChat] = useMutation(CREATE_CONVERSATION);
  const [track] = useMutation(TRACK);
  const [panel, setPanel] = useState<'posts' | 'people' | 'support'>('posts');
  const user = data?.userByUsername;

  useEffect(() => {
    if (user && me && !user.isMe) void track({ variables: { type: 'profile_viewed', targetUserId: user.id } }).catch(() => undefined);
  }, [user, me, track]);

  if (error) return <ErrorText error={error} />;
  if (!user) return <Loading />;

  const toggleFollow = async () => {
    await (user.isFollowing ? unfollow : follow)({ variables: { userId: user.id } });
    void refetch();
  };
  const message = async () => {
    const res = await startChat({ variables: { ids: [user.id] } });
    router.push(`/messages?c=${res.data.createConversation.id}`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar user={user} size={88} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">
              {user.displayName || user.username} {user.isVerified && <span className="text-sky-500" title="Verified">✔</span>}
            </h1>
            <div className="text-slate-500">
              @{user.username} {user.isFollowedBy && <Badge>Follows you</Badge>} {user.isPrivate && <Badge tone="amber">Private</Badge>}
            </div>
            {user.bio && <p className="mt-2 text-slate-700">{user.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
              {user.location && <span>📍 {user.location}</span>}
              {user.website && <a href={user.website} target="_blank" rel="noopener noreferrer nofollow" className="text-indigo-600">🔗 {user.website.replace(/^https?:\/\//, '')}</a>}
              <span>Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            </div>
            <div className="mt-2 flex gap-4 text-sm">
              <span><strong>{user.postCount}</strong> posts</span>
              <button onClick={() => setPanel('people')}><strong>{user.followerCount}</strong> followers</button>
              <button onClick={() => setPanel('people')}><strong>{user.followingCount}</strong> following</button>
            </div>
          </div>
          {me && !user.isMe && (
            <div className="flex gap-2">
              <button className={user.isFollowing ? 'btn-secondary' : 'btn-primary'} onClick={() => void toggleFollow()}>{user.isFollowing ? 'Following' : 'Follow'}</button>
              <button className="btn-secondary" onClick={() => void message()}>Message</button>
              <button className="btn-secondary" onClick={() => setPanel('support')}>Support</button>
            </div>
          )}
          {user.isMe && <Link href="/settings" className="btn-secondary">Edit profile</Link>}
        </div>
        {user.highlights.length > 0 && (
          <div className="mt-4 flex gap-3">
            {user.highlights.map((h) => (
              <div key={h.id} className="flex w-16 flex-col items-center gap-1 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.coverUrl} alt="" className="h-14 w-14 rounded-full border border-slate-200 object-cover" />
                <span className="truncate">{h.title}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {me && !user.isMe && <Connections userId={user.id} />}
      <div className="flex gap-2">
        <button className={panel === 'posts' ? 'tab-active' : 'tab'} onClick={() => setPanel('posts')}>Posts</button>
        <button className={panel === 'people' ? 'tab-active' : 'tab'} onClick={() => setPanel('people')}>Followers</button>
        {me && !user.isMe && <button className={panel === 'support' ? 'tab-active' : 'tab'} onClick={() => setPanel('support')}>Support</button>}
      </div>
      {panel === 'posts' && (user.posts.nodes.length === 0 ? <Empty>{user.isPrivate && !user.isFollowing && !user.isMe ? 'This account is private. Follow to see their posts.' : 'No posts yet.'}</Empty> : user.posts.nodes.map((p) => <PostCard key={p.id} post={p} meId={me?.id} onChanged={() => void refetch()} />))}
      {panel === 'people' && <People userId={user.id} />}
      {panel === 'support' && me && !user.isMe && <Support creatorId={user.id} name={user.displayName || user.username} />}
    </div>
  );
}

function Connections({ userId }: { userId: string }) {
  const { data } = useQuery<{ mutualConnections: UserLike[]; connectionPath: { distance: number; users: Array<{ id: string; username: string }> } | null }>(USER_CONNECTIONS, { variables: { userId } });
  if (!data) return null;
  const path = data.connectionPath;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      {data.mutualConnections.length > 0 && (
        <span>
          Followed by {data.mutualConnections.slice(0, 3).map((u) => <Link key={u.id} href={`/u/${u.username}`} className="font-medium text-slate-800">{u.username} </Link>)}
          {data.mutualConnections.length > 3 && `and ${data.mutualConnections.length - 3} more you follow`}.{' '}
        </span>
      )}
      {path ? <span>Connection: {path.users.map((u) => u.username).join(' → ')} ({path.distance} step{path.distance > 1 ? 's' : ''})</span> : <span>No connection path yet.</span>}
    </div>
  );
}

function People({ userId }: { userId: string }) {
  const { data } = useQuery<{ user: { followers: { nodes: UserLike[] }; following: { nodes: UserLike[] } } }>(FOLLOWERS, { variables: { id: userId } });
  if (!data) return <Loading />;
  const list = (title: string, users: UserLike[]) => (
    <Card title={`${title} (${users.length})`}>
      {users.length === 0 && <p className="text-sm text-slate-500">Nobody yet.</p>}
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <Avatar user={u} size={32} />
            <Link href={`/u/${u.username}`} className="text-sm font-medium">{u.displayName || u.username}</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list('Followers', data.user.followers.nodes)}
      {list('Following', data.user.following.nodes)}
    </div>
  );
}

function Support({ creatorId, name }: { creatorId: string; name: string }) {
  const { data } = useQuery<{ subscriptionTiers: Array<{ key: string; name: string; price: number; benefits: string[] }>; paymentMode: string }>(TIERS);
  const [tip, tipState] = useMutation(SEND_TIP);
  const [subscribe, subState] = useMutation(SUBSCRIBE);
  const [done, setDone] = useState<string | null>(null);
  const sendTip = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await tip({ variables: { to: creatorId, amount: Number(f.get('amount')), message: f.get('message') || null, anon: f.get('anon') === 'on' } }).catch(() => null);
    if (res) setDone(res.data.sendTip.payment.mode === 'demo' ? 'Tip sent (demo payment, no card was charged)' : 'Tip created: complete the payment with Stripe');
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={`Tip ${name}`}>
        <form onSubmit={sendTip} className="space-y-2">
          <input name="amount" type="number" min={1} max={1000} step="0.5" defaultValue={5} className="input" aria-label="Amount" />
          <input name="message" className="input" placeholder="Message (optional)" maxLength={500} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anon" /> Send anonymously</label>
          <button className="btn-primary" disabled={tipState.loading}>Send tip</button>
        </form>
        <ErrorText error={tipState.error} />
      </Card>
      <Card title="Subscribe">
        {data?.subscriptionTiers.map((t) => (
          <div key={t.key} className="mb-3 rounded-xl border border-slate-200 p-3">
            <div className="flex justify-between font-medium"><span>{t.name}</span><span>${t.price}/mo</span></div>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-500">{t.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
            <button className="btn-secondary mt-2 px-3 py-1" disabled={subState.loading} onClick={async () => { const r = await subscribe({ variables: { creatorId, tier: t.key } }).catch(() => null); if (r) setDone(`Subscribed to ${t.name}`); }}>Subscribe</button>
          </div>
        ))}
        <ErrorText error={subState.error} />
        {data?.paymentMode === 'demo' && <p className="text-xs text-slate-400">Payments run in demo mode (no Stripe key configured).</p>}
      </Card>
      {done && <p className="text-sm text-emerald-700 md:col-span-2">{done}</p>}
    </div>
  );
}
