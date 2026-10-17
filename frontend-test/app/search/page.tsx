'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import PostCard, { PostData } from '@/components/PostCard';
import { Avatar, Card, Empty, ErrorText, Loading, UserLike } from '@/components/ui';
import { AUTOCOMPLETE, CLEAR_HISTORY, DELETE_SAVED_SEARCH, SAVE_SEARCH, SEARCH, SEARCH_HISTORY } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState<'posts' | 'people' | 'tags'>('posts');
  useEffect(() => {
    setInput(q);
  }, [q]);
  const { data, error, loading } = useQuery<{ search: { users: Array<UserLike & { bio: string | null; followerCount: number }>; posts: PostData[]; hashtags: Array<{ tag: string; count: number }> } }>(SEARCH, { variables: { q }, skip: !q });
  const suggestions = useQuery<{ autocompleteSuggestions: string[] }>(AUTOCOMPLETE, { variables: { q: input }, skip: input.trim().length < 2 || input === q });
  const history = useQuery<{ searchHistory: Array<{ id: string; query: string }>; savedSearches: Array<{ id: string; query: string; name: string | null }> }>(SEARCH_HISTORY, { skip: !me });
  const [save] = useMutation(SAVE_SEARCH);
  const [removeSaved] = useMutation(DELETE_SAVED_SEARCH);
  const [clear] = useMutation(CLEAR_HISTORY);

  const go = (value: string) => router.push(`/search?q=${encodeURIComponent(value)}`);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) go(input.trim());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        <form onSubmit={submit} className="relative">
          <input className="input py-3 text-base" placeholder="Search posts, people and #hashtags" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Search query" />
          {(suggestions.data?.autocompleteSuggestions.length ?? 0) > 0 && input !== q && (
            <ul className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {suggestions.data!.autocompleteSuggestions.map((s) => (
                <li key={s}><button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => go(s)}>{s}</button></li>
              ))}
            </ul>
          )}
        </form>
        {q && (
          <div className="flex items-center gap-2">
            {(['posts', 'people', 'tags'] as const).map((t) => (
              <button key={t} className={tab === t ? 'tab-active' : 'tab'} onClick={() => setTab(t)}>
                {t === 'posts' ? `Posts (${data?.search.posts.length ?? 0})` : t === 'people' ? `People (${data?.search.users.length ?? 0})` : `Hashtags (${data?.search.hashtags.length ?? 0})`}
              </button>
            ))}
            {me && <button className="ml-auto text-sm text-indigo-600" onClick={async () => { await save({ variables: { query: q } }); void history.refetch(); }}>☆ Save search</button>}
          </div>
        )}
        <ErrorText error={error} />
        {!q ? (
          <Empty>Type something to search.</Empty>
        ) : loading && !data ? (
          <Loading />
        ) : tab === 'posts' ? (
          data?.search.posts.length ? data.search.posts.map((p) => <PostCard key={p.id} post={p} meId={me?.id} />) : <Empty>No posts found.</Empty>
        ) : tab === 'people' ? (
          <Card>
            {data?.search.users.length ? (
              <ul className="space-y-3">
                {data.search.users.map((u) => (
                  <li key={u.id} className="flex items-center gap-3">
                    <Avatar user={u} />
                    <div className="min-w-0">
                      <Link href={`/u/${u.username}`} className="font-medium">{u.displayName || u.username}</Link> <span className="text-sm text-slate-500">@{u.username} · {u.followerCount} followers</span>
                      {u.bio && <p className="truncate text-sm text-slate-600">{u.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No people found.</p>
            )}
          </Card>
        ) : (
          <Card>
            {data?.search.hashtags.map((h) => (
              <Link key={h.tag} href={`/hashtag/${encodeURIComponent(h.tag)}`} className="mr-3 inline-block text-indigo-600">#{h.tag} <span className="text-slate-400">({h.count})</span></Link>
            ))}
          </Card>
        )}
      </div>
      {me && (
        <aside className="space-y-4">
          <Card title="Saved searches">
            {history.data?.savedSearches.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
            {history.data?.savedSearches.map((s) => (
              <div key={s.id} className="flex justify-between text-sm">
                <button className="text-indigo-600" onClick={() => go(s.query)}>{s.name || s.query}</button>
                <button className="text-slate-400" onClick={async () => { await removeSaved({ variables: { id: s.id } }); void history.refetch(); }} aria-label="Remove">✕</button>
              </div>
            ))}
          </Card>
          <Card title="Recent" actions={<button className="text-xs text-slate-500" onClick={async () => { await clear(); void history.refetch(); }}>Clear</button>}>
            {history.data?.searchHistory.map((h) => (
              <button key={h.id} className="block text-sm text-slate-700 hover:text-indigo-600" onClick={() => go(h.query)}>{h.query}</button>
            ))}
          </Card>
        </aside>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchView />
    </Suspense>
  );
}
