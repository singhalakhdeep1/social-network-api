'use client';

import { useMutation, useQuery } from '@apollo/client';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Avatar, Card, Empty, ErrorText, Loading, Media, UserLike, timeAgo } from '@/components/ui';
import { CREATE_STORY, REACT_STORY, REPLY_STORY, STORY_TRAY, VIEW_STORY } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface StoryItem {
  id: string;
  content: string | null;
  createdAt: string;
  expiresAt: string;
  hasViewed: boolean;
  viewerCount: number;
  media: Array<{ url: string; type: string }>;
}

function Stories() {
  const { signedIn } = useMe();
  const params = useSearchParams();
  const { data, refetch } = useQuery<{ storyTray: Array<{ hasUnseen: boolean; author: UserLike; stories: StoryItem[] }>; myStories: Array<{ id: string; viewerCount: number; content: string | null }> }>(STORY_TRAY, { skip: !signedIn });
  const [selected, setSelected] = useState<string | null>(params.get('u'));
  if (!signedIn) return <SignInPrompt what="see stories" />;
  if (!data) return <Loading />;
  const reel = data.storyTray.find((t) => t.author.id === selected);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto">
          {data.storyTray.map((t) => (
            <button key={t.author.id} onClick={() => setSelected(t.author.id)} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
              <div className={`rounded-full p-0.5 ${t.hasUnseen ? 'bg-gradient-to-tr from-amber-400 to-pink-600' : 'bg-slate-200'}`}>
                <Avatar user={t.author} size={52} />
              </div>
              <span className="w-full truncate">{t.author.username}</span>
            </button>
          ))}
        </div>
        {reel ? <Reel author={reel.author} stories={reel.stories} onSeen={() => void refetch()} /> : <Empty>{data.storyTray.length ? 'Pick a story to watch.' : 'No stories from people you follow in the last 24 hours.'}</Empty>}
      </div>
      <aside className="space-y-4">
        <NewStory open={params.get('new') === '1'} onDone={() => void refetch()} />
        <Card title="Your active stories">
          {data.myStories.length === 0 && <p className="text-sm text-slate-500">None right now.</p>}
          {data.myStories.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="truncate">{s.content || 'Photo'}</span>
              <span className="text-slate-500">{s.viewerCount} views</span>
            </div>
          ))}
        </Card>
      </aside>
    </div>
  );
}

function Reel({ author, stories, onSeen }: { author: UserLike; stories: StoryItem[]; onSeen: () => void }) {
  const [index, setIndex] = useState(Math.max(0, stories.findIndex((s) => !s.hasViewed)));
  const [view] = useMutation(VIEW_STORY);
  const [reply] = useMutation(REPLY_STORY);
  const [react] = useMutation(REACT_STORY);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const story = stories[index];
  useEffect(() => {
    if (story && !story.hasViewed) void view({ variables: { id: story.id } }).then(onSeen).catch(() => undefined);
  }, [story, view]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!story) return null;
  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-white" data-testid="story-viewer">
      <div className="mb-3 flex gap-1">
        {stories.map((s, i) => <div key={s.id} className={`h-1 flex-1 rounded ${i <= index ? 'bg-white' : 'bg-white/30'}`} />)}
      </div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Avatar user={author} size={28} /> {author.username} <span className="text-white/60">{timeAgo(story.createdAt)}</span>
      </div>
      <Media items={story.media} />
      {story.content && <p className="mt-3 text-lg">{story.content}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button className="rounded-full bg-white/10 px-3 py-1" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
        <button className="rounded-full bg-white/10 px-3 py-1" disabled={index === stories.length - 1} onClick={() => setIndex(index + 1)}>›</button>
        {['❤️', '😂', '🔥'].map((e) => (
          <button key={e} className="text-xl" onClick={() => react({ variables: { id: story.id, emoji: e } }).then(() => setNote('Reaction sent'))}>{e}</button>
        ))}
        <form className="ml-auto flex gap-2" onSubmit={async (ev: FormEvent) => { ev.preventDefault(); if (!text.trim()) return; await reply({ variables: { id: story.id, content: text } }); setText(''); setNote('Reply sent'); }}>
          <input className="rounded-full bg-white/10 px-3 py-1 text-sm placeholder-white/50 outline-none" placeholder="Reply…" value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      </div>
      {note && <p className="mt-2 text-xs text-white/70">{note}</p>}
    </div>
  );
}

function NewStory({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [create, { loading, error }] = useMutation(CREATE_STORY);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await create({ variables: { media: file ? [file] : null, mediaUrls: url ? [url] : null, content: text || null } });
    setFile(null);
    setUrl('');
    setText('');
    setOk(true);
    onDone();
  };
  return (
    <Card title={open ? 'Share a story' : 'New story'}>
      <form onSubmit={submit} className="space-y-2">
        <input type="file" accept="image/*,video/mp4,video/webm" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Story media" />
        <input className="input" placeholder="…or an image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="input" placeholder="Caption" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <button className="btn-primary w-full" disabled={loading || (!file && !url && !text)}>Share for 24 hours</button>
      </form>
      <ErrorText error={error} />
      {ok && <p className="mt-2 text-sm text-emerald-700">Story shared.</p>}
    </Card>
  );
}

export default function StoriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Stories />
    </Suspense>
  );
}
