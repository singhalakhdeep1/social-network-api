'use client';

import { useMutation } from '@apollo/client';
import Link from 'next/link';
import { useState } from 'react';
import { ARCHIVE, DELETE_POST, LIKE_POST, PIN, REACT, SHARE_PLATFORM, SHARE_POST, UNARCHIVE, UNLIKE_POST, UNPIN, UNREACT, UPDATE_POST, VOTE_POLL } from '@/lib/gql';
import { Avatar, Badge, Media, RichText, UserLike, UserName, timeAgo } from './ui';

export interface PostData {
  id: string;
  content: string;
  createdAt: string;
  hashtags: string[];
  likeCount: number;
  commentCount: number;
  sharesCount: number;
  reactionCount: number;
  isLiked: boolean;
  myReaction: string | null;
  isPinned: boolean;
  isArchived: boolean;
  reactions: Array<{ emoji: string; count: number }>;
  media: Array<{ url: string; type: string }>;
  author: UserLike;
  group?: { id: string; name: string } | null;
  page?: { id: string; name: string; handle: string } | null;
  sharedFrom?: { id: string; content: string; createdAt: string; media: Array<{ url: string; type: string }>; author: UserLike } | null;
  poll?: {
    id: string;
    question: string;
    multipleChoice: boolean;
    totalVotes: number;
    hasVoted: boolean;
    myVotes: string[];
    isActive: boolean;
    options: Array<{ id: string; text: string; voteCount: number }>;
  } | null;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function PostCard({ post, meId, onChanged, reason }: { post: PostData; meId?: string | null; onChanged?: () => void; reason?: string }) {
  const [like] = useMutation(LIKE_POST);
  const [unlike] = useMutation(UNLIKE_POST);
  const [react] = useMutation(REACT);
  const [unreact] = useMutation(UNREACT);
  const [share] = useMutation(SHARE_POST);
  const [sharePlatform] = useMutation(SHARE_PLATFORM);
  const [pin] = useMutation(PIN);
  const [unpin] = useMutation(UNPIN);
  const [archive] = useMutation(ARCHIVE);
  const [unarchive] = useMutation(UNARCHIVE);
  const [remove] = useMutation(DELETE_POST);
  const [update] = useMutation(UPDATE_POST);
  const [vote] = useMutation(VOTE_POLL);
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [error, setError] = useState<string | null>(null);
  const mine = meId === post.author.id;

  const run = async (fn: () => Promise<unknown>, refresh = false) => {
    if (!meId) return setError('Sign in to interact with posts');
    setError(null);
    try {
      await fn();
      if (refresh) onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="post">
      {post.isPinned && <div className="mb-2 text-xs font-medium text-slate-500">📌 Pinned</div>}
      {reason && <div className="mb-2 text-xs text-slate-400">{reason}</div>}
      <div className="flex gap-3">
        <Link href={`/u/${post.author.username}`}>
          <Avatar user={post.author} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm">
              <UserName user={post.author} />
              <span className="text-slate-400"> · </span>
              <Link href={`/p/${post.id}`} className="text-slate-500 hover:underline">
                {timeAgo(post.createdAt)}
              </Link>
              {post.group && (
                <>
                  {' '}
                  in{' '}
                  <Link href={`/groups/${post.group.id}`} className="text-indigo-600">
                    {post.group.name}
                  </Link>
                </>
              )}
              {post.page && (
                <>
                  {' '}
                  on{' '}
                  <Link href={`/pages/${post.page.handle}`} className="text-indigo-600">
                    {post.page.name}
                  </Link>
                </>
              )}
            </div>
            {mine && (
              <div className="relative">
                <button className="rounded px-2 text-slate-400 hover:bg-slate-100" onClick={() => setMenu(!menu)} aria-label="Post menu">
                  ⋯
                </button>
                {menu && (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
                    <button className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => { setEditing(true); setMenu(false); }}>Edit</button>
                    <button className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => run(() => (post.isPinned ? unpin : pin)({ variables: { postId: post.id } }), true)}>{post.isPinned ? 'Unpin' : 'Pin to profile'}</button>
                    <button className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => run(() => (post.isArchived ? unarchive : archive)({ variables: { postId: post.id } }), true)}>{post.isArchived ? 'Unarchive' : 'Archive'}</button>
                    <button className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-slate-50" onClick={() => confirm('Delete this post?') && run(() => remove({ variables: { id: post.id } }), true)}>Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => run(async () => { await update({ variables: { id: post.id, content: draft } }); setEditing(false); })}>Save</button>
                <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            post.content && <div className="mt-1"><RichText text={post.content} /></div>
          )}
          <Media items={post.media} />

          {post.sharedFrom && (
            <Link href={`/p/${post.sharedFrom.id}`} className="mt-3 block rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
              <div className="text-sm">
                <span className="font-semibold">{post.sharedFrom.author.displayName || post.sharedFrom.author.username}</span>{' '}
                <span className="text-slate-500">· {timeAgo(post.sharedFrom.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-slate-700">{post.sharedFrom.content}</p>
            </Link>
          )}

          {post.poll && (
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 font-medium">{post.poll.question}</div>
              <div className="space-y-1.5">
                {post.poll.options.map((o) => {
                  const pct = post.poll!.totalVotes ? Math.round((o.voteCount / post.poll!.totalVotes) * 100) : 0;
                  const chosen = post.poll!.myVotes.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      disabled={!post.poll!.isActive}
                      onClick={() => run(() => vote({ variables: { pollId: post.poll!.id, optionIds: [o.id] } }))}
                      className={`relative block w-full overflow-hidden rounded-lg border px-3 py-1.5 text-left text-sm ${chosen ? 'border-indigo-500' : 'border-slate-200'}`}
                    >
                      <span className="absolute inset-y-0 left-0 bg-indigo-100" style={{ width: `${post.poll!.hasVoted ? pct : 0}%` }} />
                      <span className="relative flex justify-between">
                        <span>{o.text}</span>
                        {post.poll!.hasVoted && <span>{pct}%</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {post.poll.totalVotes} votes {post.poll.isActive ? '' : '· closed'}
              </div>
            </div>
          )}

          {post.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {post.reactions.map((r) => (
                <Badge key={r.emoji}>
                  {r.emoji} {r.count}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-1 text-sm text-slate-500">
            <button className={`rounded-lg px-2 py-1 hover:bg-rose-50 ${post.isLiked ? 'text-rose-600' : ''}`} onClick={() => run(() => (post.isLiked ? unlike : like)({ variables: { postId: post.id } }))} aria-label={post.isLiked ? 'Unlike' : 'Like'}>
              {post.isLiked ? '♥' : '♡'} {post.likeCount}
            </button>
            <Link href={`/p/${post.id}`} className="rounded-lg px-2 py-1 hover:bg-slate-100">
              💬 {post.commentCount}
            </Link>
            <button className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => run(async () => { await share({ variables: { postId: post.id } }); setError('Shared to your followers'); })}>
              🔁 {post.sharesCount}
            </button>
            <div className="relative">
              <button className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => setPicker(!picker)} aria-label="React">
                {post.myReaction ?? '☺'}
              </button>
              {picker && (
                <div className="absolute z-10 flex gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg">
                  {EMOJIS.map((e) => (
                    <button key={e} className="text-lg hover:scale-125" onClick={() => { setPicker(false); void run(() => (post.myReaction === e ? unreact({ variables: { postId: post.id } }) : react({ variables: { postId: post.id, emoji: e } })), true); }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="ml-auto rounded-lg px-2 py-1 hover:bg-slate-100"
              onClick={() =>
                run(async () => {
                  const res = await sharePlatform({ variables: { postId: post.id, platform: 'copy_link' } });
                  await navigator.clipboard?.writeText(res.data.shareToPlatform.url).catch(() => undefined);
                  setError('Link copied');
                })
              }
            >
              🔗
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
        </div>
      </div>
    </article>
  );
}
