'use client';

import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import PostCard, { PostData } from '@/components/PostCard';
import { Avatar, Card, ErrorText, Loading, RichText, UserLike, timeAgo } from '@/components/ui';
import { ADD_COMMENT, COMMENTS, DELETE_COMMENT, LIKE_COMMENT, POST_DETAIL, REPLIES, TRACK, UNLIKE_COMMENT } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
  author: UserLike;
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { data, error, refetch } = useQuery<{ post: PostData }>(POST_DETAIL, { variables: { id } });
  const comments = useQuery<{ comments: { nodes: CommentData[]; nextCursor: string | null; hasMore: boolean } }>(COMMENTS, { variables: { postId: id } });
  const [track] = useMutation(TRACK);
  useEffect(() => {
    if (me) void track({ variables: { type: 'post_viewed', postId: id } }).catch(() => undefined);
  }, [me, id, track]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const post = data.post;
  const reload = () => {
    void refetch();
    void comments.refetch();
  };
  return (
    <div className="space-y-4">
      <PostCard post={post} meId={me?.id} onChanged={() => refetch().catch(() => router.push('/'))} />
      <Card title={`Comments (${post.commentCount})`}>
        {me ? <CommentForm postId={post.id} onDone={reload} /> : <p className="text-sm text-slate-500"><Link href="/login" className="text-indigo-600">Sign in</Link> to comment.</p>}
        <ErrorText error={comments.error} />
        <ul className="mt-4 space-y-4">
          {comments.data?.comments.nodes.map((c) => (
            <li key={c.id}>
              <Comment comment={c} postId={post.id} meId={me?.id} onChanged={reload} />
            </li>
          ))}
        </ul>
        {comments.data?.comments.hasMore && (
          <button
            className="btn-secondary mt-3 w-full"
            onClick={() =>
              comments.fetchMore({
                variables: { cursor: comments.data!.comments.nextCursor },
                updateQuery: (prev, { fetchMoreResult }) => ({ comments: { ...fetchMoreResult.comments, nodes: [...prev.comments.nodes, ...fetchMoreResult.comments.nodes] } }),
              })
            }
          >
            More comments
          </button>
        )}
      </Card>
    </div>
  );
}

function CommentForm({ postId, parentId, onDone, placeholder = 'Write a comment…' }: { postId: string; parentId?: string; onDone: () => void; placeholder?: string }) {
  const [add, { loading, error }] = useMutation(ADD_COMMENT);
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await add({ variables: { postId, content: text, parentId } }).catch(() => undefined);
    setText('');
    onDone();
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input className="input" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label={placeholder} />
      <button className="btn-primary" disabled={loading || !text.trim()}>Reply</button>
      <ErrorText error={error} />
    </form>
  );
}

function Comment({ comment, postId, meId, onChanged, isReply }: { comment: CommentData; postId: string; meId?: string; onChanged: () => void; isReply?: boolean }) {
  const [like] = useMutation(LIKE_COMMENT);
  const [unlike] = useMutation(UNLIKE_COMMENT);
  const [remove] = useMutation(DELETE_COMMENT);
  const [loadReplies, replies] = useLazyQuery<{ commentReplies: { nodes: CommentData[] } }>(REPLIES, { variables: { commentId: comment.id }, fetchPolicy: 'network-only' });
  const [replying, setReplying] = useState(false);
  const refreshReplies = () => {
    if (replies.called) void replies.refetch();
    else void loadReplies();
  };
  return (
    <div>
      <div className="flex gap-3">
        <Avatar user={comment.author} size={32} />
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-slate-100 px-3 py-2">
            <Link href={`/u/${comment.author.username}`} className="text-sm font-semibold">{comment.author.displayName || comment.author.username}</Link>
            <div className="text-sm"><RichText text={comment.content} /></div>
          </div>
          <div className="mt-1 flex gap-3 px-2 text-xs text-slate-500">
            <span>{timeAgo(comment.createdAt)}</span>
            {meId && (
              <button className={comment.isLiked ? 'font-semibold text-rose-600' : ''} onClick={() => (comment.isLiked ? unlike : like)({ variables: { id: comment.id } })}>
                Like{comment.likeCount ? ` (${comment.likeCount})` : ''}
              </button>
            )}
            {meId && !isReply && <button onClick={() => setReplying(!replying)}>Reply</button>}
            {!isReply && comment.replyCount > 0 && !replies.called && <button onClick={() => void loadReplies()}>View {comment.replyCount} repl{comment.replyCount > 1 ? 'ies' : 'y'}</button>}
            {meId === comment.author.id && (
              <button className="text-rose-600" onClick={async () => { await remove({ variables: { id: comment.id } }); onChanged(); }}>Delete</button>
            )}
          </div>
          {replying && (
            <div className="mt-2">
              <CommentForm postId={postId} parentId={comment.id} placeholder={`Reply to ${comment.author.username}…`} onDone={() => { setReplying(false); refreshReplies(); onChanged(); }} />
            </div>
          )}
        </div>
      </div>
      {(replies.data?.commentReplies.nodes.length ?? 0) > 0 && (
        <ul className="ml-10 mt-3 space-y-3 border-l border-slate-200 pl-4">
          {replies.data!.commentReplies.nodes.map((r) => (
            <li key={r.id}>
              <Comment comment={r} postId={postId} meId={meId} onChanged={refreshReplies} isReply />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
