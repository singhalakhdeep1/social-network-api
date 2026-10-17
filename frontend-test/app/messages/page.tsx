'use client';

import { useLazyQuery, useMutation, useQuery, useSubscription } from '@apollo/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Avatar, Empty, ErrorText, Loading, Media, UserLike, timeAgo } from '@/components/ui';
import { CONVERSATIONS, CREATE_CONVERSATION, DELETE_MESSAGE, MARK_CONVERSATION_READ, MESSAGE_SENT, MESSAGES, REACT_MESSAGE, SEARCH, SEND_MESSAGE, SET_TYPING, TYPING } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface Conv {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  participants: UserLike[];
  lastMessage: { id: string; content: string; sender: { id: string } } | null;
}

function title(c: { isGroup: boolean; groupName: string | null; participants: UserLike[] }, meId: string) {
  return c.isGroup ? c.groupName || 'Group chat' : c.participants.filter((p) => p.id !== meId).map((p) => p.displayName || p.username).join(', ') || 'Just you';
}

function Inbox() {
  const { me, signedIn } = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get('c');
  const { data, refetch } = useQuery<{ conversations: Conv[] }>(CONVERSATIONS, { skip: !signedIn, pollInterval: 15_000 });
  if (!signedIn) return <SignInPrompt what="read your messages" />;
  if (!data || !me) return <Loading />;
  return (
    <div className="grid h-[calc(100vh-6rem)] gap-4 md:grid-cols-[18rem_1fr]">
      <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
        <NewChat onCreated={(id) => { void refetch(); router.push(`/messages?c=${id}`); }} />
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {data.conversations.length === 0 && <li className="p-4 text-sm text-slate-500">No conversations yet.</li>}
          {data.conversations.map((c) => {
            const other = c.participants.find((p) => p.id !== me.id) ?? c.participants[0];
            return (
              <li key={c.id}>
                <button onClick={() => router.push(`/messages?c=${c.id}`)} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${active === c.id ? 'bg-indigo-50' : ''}`}>
                  {other && <Avatar user={other} size={36} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium">{title(c, me.id)}</span>
                      {c.lastMessageAt && <span className="text-xs text-slate-400">{timeAgo(c.lastMessageAt)}</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">{c.lastMessage?.content ?? 'No messages yet'}</div>
                  </div>
                  {c.unreadCount > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-xs text-white">{c.unreadCount}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {active ? <Thread key={active} conversationId={active} meId={me.id} onActivity={() => void refetch()} /> : <Empty>Select a conversation or start a new one.</Empty>}
    </div>
  );
}

function NewChat({ onCreated }: { onCreated: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [find, { data }] = useLazyQuery<{ search: { users: UserLike[] } }>(SEARCH);
  const [create, { error }] = useMutation(CREATE_CONVERSATION);
  const [picked, setPicked] = useState<UserLike[]>([]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) void find({ variables: { q: q.trim() } });
  };
  return (
    <div className="border-b border-slate-200 p-3">
      <form onSubmit={submit} className="flex gap-2">
        <input className="input" placeholder="Find people…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find people" />
        <button className="btn-secondary px-3">Find</button>
      </form>
      {data?.search.users.map((u) => (
        <label key={u.id} className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={picked.some((p) => p.id === u.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, u] : picked.filter((p) => p.id !== u.id))} />
          {u.displayName || u.username}
        </label>
      ))}
      {picked.length > 0 && (
        <button
          className="btn-primary mt-2 w-full"
          onClick={async () => {
            const res = await create({ variables: { ids: picked.map((p) => p.id), isGroup: picked.length > 1, groupName: picked.length > 1 ? picked.map((p) => p.username).join(', ') : null } });
            setPicked([]);
            setQ('');
            onCreated(res.data.createConversation.id);
          }}
        >
          Start chat with {picked.length}
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

interface Msg {
  id: string;
  content: string;
  createdAt: string;
  isDeleted: boolean;
  sender: UserLike;
  reactions: Array<{ emoji: string; user: { id: string } }>;
  media: Array<{ url: string; type: string }>;
}

function Thread({ conversationId, meId, onActivity }: { conversationId: string; meId: string; onActivity: () => void }) {
  const { data, refetch, error } = useQuery<{ conversation: { id: string; isGroup: boolean; groupName: string | null; participants: UserLike[] }; messages: { nodes: Msg[] } }>(MESSAGES, { variables: { conversationId } });
  const [send, sendState] = useMutation(SEND_MESSAGE);
  const [markRead] = useMutation(MARK_CONVERSATION_READ);
  const [typing] = useMutation(SET_TYPING);
  const [react] = useMutation(REACT_MESSAGE);
  const [remove] = useMutation(DELETE_MESSAGE);
  const [text, setText] = useState('');
  const [typers, setTypers] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  useSubscription(MESSAGE_SENT, { variables: { conversationId }, onData: () => { void refetch(); void markRead({ variables: { id: conversationId } }); onActivity(); } });
  useSubscription<{ typingIndicator: { isTyping: boolean; userId: string } }>(TYPING, {
    variables: { conversationId },
    onData: ({ data: ev }) => {
      const t = ev.data?.typingIndicator;
      if (!t || t.userId === meId) return;
      setTypers((list) => (t.isTyping ? [...new Set([...list, t.userId])] : list.filter((u) => u !== t.userId)));
    },
  });

  useEffect(() => {
    void markRead({ variables: { id: conversationId } }).then(onActivity).catch(() => undefined);
  }, [conversationId, markRead]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.nodes.length]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const messages = [...data.messages.nodes].reverse();
  const nameOf = (id: string) => data.conversation.participants.find((p) => p.id === id)?.username ?? 'someone';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await send({ variables: { conversationId, content: text } });
    setText('');
    void typing({ variables: { id: conversationId, isTyping: false } });
    void refetch();
    onActivity();
  };
  const onType = (value: string) => {
    setText(value);
    clearTimeout(typingTimer.current);
    void typing({ variables: { id: conversationId, isTyping: true } }).catch(() => undefined);
    typingTimer.current = setTimeout(() => void typing({ variables: { id: conversationId, isTyping: false } }).catch(() => undefined), 3000);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3 font-semibold">{title(data.conversation, meId)}</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" data-testid="thread">
        {messages.map((m) => {
          const mine = m.sender.id === meId;
          return (
            <div key={m.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {data.conversation.isGroup && !mine && <div className="mb-0.5 text-xs font-semibold opacity-70">{m.sender.username}</div>}
                {m.isDeleted ? <em className="opacity-70">Message deleted</em> : m.content}
                <Media items={m.media} />
                <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
                  {timeAgo(m.createdAt)}
                  {m.reactions.length > 0 && <span>{m.reactions.map((r) => r.emoji).join('')}</span>}
                  {!m.isDeleted && <button className="hidden group-hover:inline" onClick={() => react({ variables: { id: m.id, emoji: '👍' } }).then(() => refetch())}>👍</button>}
                  {mine && !m.isDeleted && <button className="hidden group-hover:inline" onClick={() => remove({ variables: { id: m.id } }).then(() => refetch())}>delete</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {typers.length > 0 && <div className="px-4 pb-1 text-xs text-slate-500">{typers.map(nameOf).join(', ')} typing…</div>}
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3">
        <input className="input" placeholder="Message (encrypted at rest)" value={text} onChange={(e) => onType(e.target.value)} maxLength={5000} aria-label="Message" />
        <button className="btn-primary" disabled={sendState.loading || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}
