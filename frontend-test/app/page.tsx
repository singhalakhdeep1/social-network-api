'use client';

import { useMutation, useQuery, useSubscription } from '@apollo/client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Composer from '@/components/Composer';
import PostCard, { PostData } from '@/components/PostCard';
import SignInPrompt from '@/components/SignInPrompt';
import { Avatar, Card, Empty, ErrorText, Loading, UserLike } from '@/components/ui';
import { AD_CLICK, AD_IMPRESSION, ADS_FOR_YOU, FEED, FEED_UPDATED, FOLLOW, STORY_TRAY, SUGGESTED } from '@/lib/gql';
import { useMe } from '@/lib/hooks';
import { mediaUrl } from '@/lib/session';

interface FeedData {
  feed: { nextCursor: string | null; hasMore: boolean; items: Array<{ score: number; reason: string; post: PostData }> };
}

export default function HomePage() {
  const { me, signedIn } = useMe();
  const { data, loading, error, fetchMore, refetch } = useQuery<FeedData>(FEED, { skip: !signedIn, variables: { refresh: false }, notifyOnNetworkStatusChange: true });
  const [fresh, setFresh] = useState(0);

  // "New posts" pill: people you follow published while you were reading.
  useSubscription(FEED_UPDATED, { skip: !signedIn, onData: () => setFresh((n) => n + 1) });

  if (!signedIn) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white">
          <h1 className="text-3xl font-bold">Your people, your feed.</h1>
          <p className="mt-2 text-indigo-100">Follow friends, join groups, share stories and chat in real time.</p>
          <div className="mt-4 flex gap-2">
            <Link href="/login?mode=register" className="rounded-full bg-white px-5 py-2 font-semibold text-indigo-700">
              Create account
            </Link>
            <Link href="/explore" className="rounded-full border border-white/50 px-5 py-2 font-semibold">
              Explore
            </Link>
          </div>
        </div>
        <SignInPrompt what="see your personalised feed" />
      </div>
    );
  }

  const items = data?.feed.items ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <StoryStrip />
        <Composer onPosted={() => void refetch({ refresh: true })} />
        {fresh > 0 && (
          <button
            className="btn-primary w-full"
            onClick={() => {
              setFresh(0);
              void refetch({ refresh: true });
            }}
          >
            Show {fresh} new post{fresh > 1 ? 's' : ''}
          </button>
        )}
        <ErrorText error={error} />
        {loading && !data ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>
            Your feed is empty. <Link href="/explore" className="text-indigo-600">Find people to follow</Link>.
          </Empty>
        ) : (
          items.map((i) => <PostCard key={i.post.id} post={i.post} meId={me?.id} reason={i.reason === 'own' ? undefined : i.reason} onChanged={() => void refetch({ refresh: true })} />)
        )}
        {data?.feed.hasMore && (
          <button
            className="btn-secondary w-full"
            disabled={loading}
            onClick={() =>
              fetchMore({
                variables: { cursor: data.feed.nextCursor },
                updateQuery: (prev, { fetchMoreResult }) => ({ feed: { ...fetchMoreResult.feed, items: [...prev.feed.items, ...fetchMoreResult.feed.items] } }),
              })
            }
          >
            Load more
          </button>
        )}
      </div>
      <aside className="space-y-4">
        <Suggestions />
        <AdSlot />
      </aside>
    </div>
  );
}

function StoryStrip() {
  const { data } = useQuery<{ storyTray: Array<{ hasUnseen: boolean; author: UserLike }> }>(STORY_TRAY);
  const tray = data?.storyTray ?? [];
  return (
    <div className="flex gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3">
      <Link href="/stories?new=1" className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs text-slate-600">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-xl">+</div>
        Your story
      </Link>
      {tray.map((t) => (
        <Link key={t.author.id} href={`/stories?u=${t.author.id}`} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs text-slate-600">
          <div className={`rounded-full p-0.5 ${t.hasUnseen ? 'bg-gradient-to-tr from-amber-400 to-pink-600' : 'bg-slate-200'}`}>
            <div className="rounded-full bg-white p-0.5">
              <Avatar user={t.author} size={44} />
            </div>
          </div>
          <span className="w-full truncate text-center">{t.author.username}</span>
        </Link>
      ))}
    </div>
  );
}

function Suggestions() {
  const { data, refetch } = useQuery<{ suggestedUsers: Array<{ mutualCount: number; user: UserLike }> }>(SUGGESTED);
  const [follow] = useMutation(FOLLOW);
  const list = data?.suggestedUsers ?? [];
  return (
    <Card title="People you may know">
      {list.length === 0 && <p className="text-sm text-slate-500">Follow a few people to get suggestions.</p>}
      <ul className="space-y-3">
        {list.map((s) => (
          <li key={s.user.id} className="flex items-center gap-2">
            <Avatar user={s.user} size={32} />
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/u/${s.user.username}`} className="block truncate font-medium">
                {s.user.displayName || s.user.username}
              </Link>
              <span className="text-xs text-slate-500">{s.mutualCount} mutual</span>
            </div>
            <button className="btn-secondary px-3 py-1" onClick={async () => { await follow({ variables: { userId: s.user.id } }); void refetch(); }}>
              Follow
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AdSlot() {
  const { data } = useQuery<{ adsForYou: Array<{ id: string; title: string; description: string; targetUrl: string; media: Array<{ url: string }>; advertiser: { username: string } }> }>(ADS_FOR_YOU);
  const [impression] = useMutation(AD_IMPRESSION);
  const [click] = useMutation(AD_CLICK);
  const ad = data?.adsForYou[0];
  useEffect(() => {
    if (ad) void impression({ variables: { id: ad.id } }).catch(() => undefined);
  }, [ad, impression]);
  if (!ad) return null;
  return (
    <Card title="Sponsored">
      {ad.media[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(ad.media[0].url)} alt="" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
      )}
      <div className="font-medium">{ad.title}</div>
      <p className="text-sm text-slate-600">{ad.description}</p>
      <button
        className="mt-2 text-sm font-medium text-indigo-600"
        onClick={async () => {
          const res = await click({ variables: { id: ad.id } });
          window.open(res.data.recordAdClick, '_blank', 'noopener');
        }}
      >
        Learn more →
      </button>
      <div className="mt-1 text-xs text-slate-400">by @{ad.advertiser.username}</div>
    </Card>
  );
}
