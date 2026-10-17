'use client';

import { useQuery } from '@apollo/client';
import { useParams } from 'next/navigation';
import PostCard, { PostData } from '@/components/PostCard';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { HASHTAG } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

export default function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { me } = useMe();
  const { data, error } = useQuery<{ postsByHashtag: { nodes: PostData[] } }>(HASHTAG, { variables: { tag: decodeURIComponent(tag) } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">#{decodeURIComponent(tag)}</h1>
      <ErrorText error={error} />
      {!data ? <Loading /> : data.postsByHashtag.nodes.length === 0 ? <Empty>No posts with this hashtag yet.</Empty> : data.postsByHashtag.nodes.map((p) => <PostCard key={p.id} post={p} meId={me?.id} />)}
    </div>
  );
}
