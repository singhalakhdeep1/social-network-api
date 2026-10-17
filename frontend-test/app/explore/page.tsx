'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { useState } from 'react';
import PostCard, { PostData } from '@/components/PostCard';
import { Card, Empty, ErrorText, Loading } from '@/components/ui';
import { EXPLORE, TRENDING_POSTS } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

export default function ExplorePage() {
  const { me } = useMe();
  const [tab, setTab] = useState<'latest' | 'trending'>('latest');
  const latest = useQuery<{ posts: { nodes: PostData[]; nextCursor: string | null; hasMore: boolean }; trendingHashtags: Array<{ tag: string; count: number }> }>(EXPLORE);
  const trending = useQuery<{ trendingPosts: PostData[] }>(TRENDING_POSTS, { skip: tab !== 'trending' });
  const posts = tab === 'latest' ? latest.data?.posts.nodes : trending.data?.trendingPosts;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button className={tab === 'latest' ? 'tab-active' : 'tab'} onClick={() => setTab('latest')}>Latest</button>
          <button className={tab === 'trending' ? 'tab-active' : 'tab'} onClick={() => setTab('trending')}>Trending</button>
        </div>
        <ErrorText error={latest.error ?? trending.error} />
        {!posts ? <Loading /> : posts.length === 0 ? <Empty>Nothing here yet.</Empty> : posts.map((p) => <PostCard key={p.id} post={p} meId={me?.id} onChanged={() => void latest.refetch()} />)}
        {tab === 'latest' && latest.data?.posts.hasMore && (
          <button
            className="btn-secondary w-full"
            onClick={() =>
              latest.fetchMore({
                variables: { cursor: latest.data!.posts.nextCursor },
                updateQuery: (prev, { fetchMoreResult }) => ({ ...fetchMoreResult, posts: { ...fetchMoreResult.posts, nodes: [...prev.posts.nodes, ...fetchMoreResult.posts.nodes] } }),
              })
            }
          >
            Load more
          </button>
        )}
      </div>
      <aside>
        <Card title="Trending hashtags">
          <ol className="space-y-2 text-sm">
            {latest.data?.trendingHashtags.map((h, i) => (
              <li key={h.tag} className="flex justify-between">
                <Link href={`/hashtag/${encodeURIComponent(h.tag)}`} className="text-indigo-600 hover:underline">
                  {i + 1}. #{h.tag}
                </Link>
                <span className="text-slate-400">{h.count}</span>
              </li>
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}
