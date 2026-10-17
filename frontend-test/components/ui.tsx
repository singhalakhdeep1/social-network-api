'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { mediaUrl } from '@/lib/session';

export interface UserLike {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
  isVerified?: boolean | null;
}

export function Avatar({ user, size = 40 }: { user: Pick<UserLike, 'username' | 'avatar'>; size?: number }) {
  const src = mediaUrl(user.avatar);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={user.username} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const hue = [...user.username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 3);
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: `hsl(${hue} 55% 50%)`, fontSize: size / 2.5 }}>
      {user.username[0]?.toUpperCase()}
    </div>
  );
}

export function UserName({ user }: { user: UserLike }) {
  return (
    <Link href={`/u/${user.username}`} className="font-semibold text-slate-900 hover:underline">
      {user.displayName || user.username}
      {user.isVerified && <span className="ml-1 text-sky-500" title="Verified">✔</span>}
      <span className="ml-1 font-normal text-slate-500">@{user.username}</span>
    </Link>
  );
}

export function timeAgo(value: string | number | Date): string {
  const d = new Date(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString();
}

/** Renders #hashtags and @mentions as links. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+|@[A-Za-z0-9_]+)/u);
  return (
    <p className="whitespace-pre-wrap break-words text-slate-800">
      {parts.map((part, i) =>
        part.startsWith('#') ? (
          <Link key={i} href={`/hashtag/${encodeURIComponent(part.slice(1).toLowerCase())}`} className="text-indigo-600 hover:underline">
            {part}
          </Link>
        ) : part.startsWith('@') ? (
          <Link key={i} href={`/u/${part.slice(1)}`} className="text-indigo-600 hover:underline">
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Loading() {
  return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;
}

export function ErrorText({ error }: { error?: { message: string } | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error.message}</p>;
}

export function Media({ items }: { items: Array<{ url: string; type: string }> }) {
  if (!items.length) return null;
  return (
    <div className={`mt-3 grid gap-2 ${items.length > 1 ? 'grid-cols-2' : ''}`}>
      {items.map((m) =>
        m.type === 'video' ? (
          <video key={m.url} src={mediaUrl(m.url)} controls className="max-h-96 w-full rounded-xl bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.url} src={mediaUrl(m.url)} alt="" className="max-h-96 w-full rounded-xl object-cover" />
        ),
      )}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', indigo: 'bg-indigo-100 text-indigo-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-700' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
