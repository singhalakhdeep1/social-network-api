'use client';

import { useMutation, useQuery } from '@apollo/client';
import { useParams } from 'next/navigation';
import Composer from '@/components/Composer';
import PostCard, { PostData } from '@/components/PostCard';
import { Badge, Card, Empty, ErrorText, Loading } from '@/components/ui';
import { FOLLOW_PAGE, PAGE, PAGE_POSTS, UNFOLLOW_PAGE } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface PageData {
  id: string;
  name: string;
  handle: string;
  description: string;
  category: string;
  website: string | null;
  location: string | null;
  followerCount: number;
  isFollowing: boolean;
  isAdmin: boolean;
  isVerified: boolean;
}

export default function PageDetail() {
  const { handle } = useParams<{ handle: string }>();
  const { me } = useMe();
  const { data, error } = useQuery<{ page: PageData }>(PAGE, { variables: { id: `@${handle}` } });
  const page = data?.page;
  const posts = useQuery<{ pagePosts: { nodes: PostData[] } }>(PAGE_POSTS, { variables: { id: page?.id }, skip: !page });
  const [follow] = useMutation(FOLLOW_PAGE);
  const [unfollow] = useMutation(UNFOLLOW_PAGE);
  if (error) return <ErrorText error={error} />;
  if (!page) return <Loading />;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{page.name} {page.isVerified && <span className="text-sky-500">✔</span>}</h1>
            <div className="text-sm text-slate-500">@{page.handle} · <Badge>{page.category}</Badge> · {page.followerCount} followers</div>
            <p className="mt-2 text-slate-700">{page.description}</p>
            {page.website && <a href={page.website} className="text-sm text-indigo-600" target="_blank" rel="noopener noreferrer nofollow">{page.website}</a>}
          </div>
          {me && <button className={page.isFollowing ? 'btn-secondary' : 'btn-primary'} onClick={() => (page.isFollowing ? unfollow : follow)({ variables: { id: page.id } })}>{page.isFollowing ? 'Following' : 'Follow'}</button>}
        </div>
      </Card>
      {page.isAdmin && <Composer pageId={page.id} placeholder={`Post as ${page.name}…`} onPosted={() => void posts.refetch()} />}
      {!posts.data ? <Loading /> : posts.data.pagePosts.nodes.length === 0 ? <Empty>No posts yet.</Empty> : posts.data.pagePosts.nodes.map((p) => <PostCard key={p.id} post={p} meId={me?.id} onChanged={() => void posts.refetch()} />)}
    </div>
  );
}
