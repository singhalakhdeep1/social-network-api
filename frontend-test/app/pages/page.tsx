'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Badge, Card, ErrorText, Loading } from '@/components/ui';
import { CREATE_PAGE, FOLLOW_PAGE, PAGES, UNFOLLOW_PAGE } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface PageRow {
  id: string;
  name: string;
  handle: string;
  description: string;
  category: string;
  followerCount: number;
  isFollowing: boolean;
  isVerified: boolean;
}

export default function PagesPage() {
  const { signedIn } = useMe();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data } = useQuery<{ pages: { nodes: PageRow[] } }>(PAGES, { skip: !signedIn, variables: { search: search || null } });
  const [follow] = useMutation(FOLLOW_PAGE);
  const [unfollow] = useMutation(UNFOLLOW_PAGE);
  const [create, createState] = useMutation(CREATE_PAGE);
  if (!signedIn) return <SignInPrompt what="browse pages" />;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await create({ variables: { name: f.get('name'), handle: f.get('handle'), description: f.get('description'), category: f.get('category') || 'business' } }).catch(() => null);
    if (res) router.push(`/pages/${res.data.createPage.handle}`);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <input className="input" placeholder="Search pages" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search pages" />
        {!data ? <Loading /> : data.pages.nodes.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/pages/${p.handle}`} className="text-lg font-semibold hover:underline">{p.name}</Link> {p.isVerified && <span className="text-sky-500">✔</span>} <Badge>{p.category}</Badge>
                <div className="text-sm text-slate-500">@{p.handle} · {p.followerCount} followers</div>
                <p className="text-sm text-slate-600">{p.description}</p>
              </div>
              <button className={p.isFollowing ? 'btn-secondary px-3 py-1' : 'btn-primary px-3 py-1'} onClick={() => (p.isFollowing ? unfollow : follow)({ variables: { id: p.id } })}>
                {p.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          </Card>
        ))}
      </div>
      <Card title="Create a page">
        <form onSubmit={submit} className="space-y-2">
          <input name="name" className="input" placeholder="Page name" required />
          <input name="handle" className="input" placeholder="handle (letters, digits, _)" required pattern="[a-zA-Z0-9_]{3,30}" />
          <textarea name="description" className="input" placeholder="Description" required />
          <input name="category" className="input" placeholder="Category" />
          <button className="btn-primary w-full" disabled={createState.loading}>Create page</button>
        </form>
        <ErrorText error={createState.error} />
      </Card>
    </div>
  );
}
