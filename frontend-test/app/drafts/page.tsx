'use client';

import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Badge, Card, Loading } from '@/components/ui';
import { ARCHIVED, CONTENT_CALENDAR, DELETE_DRAFT, DELETE_SCHEDULED, PUBLISH_DRAFT, PUBLISH_SCHEDULED, UNARCHIVE, UPDATE_DRAFT } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface Calendar {
  contentCalendar: { totalScheduled: number; totalDrafts: number; drafts: Array<{ id: string; content: string; updatedAt: string }> };
  myScheduledPosts: Array<{ id: string; content: string; scheduledFor: string; status: string; publishedAt: string | null; errorMessage: string | null }>;
}

export default function DraftsPage() {
  const { signedIn } = useMe();
  const { data, refetch } = useQuery<Calendar>(CONTENT_CALENDAR, { skip: !signedIn });
  const archived = useQuery<{ archivedPosts: { nodes: Array<{ id: string; content: string; createdAt: string }> } }>(ARCHIVED, { skip: !signedIn });
  const [publishDraft] = useMutation(PUBLISH_DRAFT);
  const [deleteDraft] = useMutation(DELETE_DRAFT);
  const [updateDraft] = useMutation(UPDATE_DRAFT);
  const [publishScheduled] = useMutation(PUBLISH_SCHEDULED);
  const [deleteScheduled] = useMutation(DELETE_SCHEDULED);
  const [unarchive] = useMutation(UNARCHIVE);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!signedIn) return <SignInPrompt what="manage drafts and scheduled posts" />;
  if (!data) return <Loading />;
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refetch();
      await archived.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Content calendar</h1>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Card title={`Scheduled (${data.contentCalendar.totalScheduled} pending)`}>
        {data.myScheduledPosts.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled. Pick a date in the composer to schedule a post.</p>}
        <ul className="divide-y divide-slate-100">
          {data.myScheduledPosts.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate">{s.content}</div>
                <div className="text-xs text-slate-500">{new Date(s.scheduledFor).toLocaleString()} {s.errorMessage && <span className="text-rose-600">· {s.errorMessage}</span>}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={s.status === 'published' ? 'emerald' : s.status === 'failed' ? 'rose' : 'amber'}>{s.status}</Badge>
                {s.status === 'pending' && (
                  <>
                    <button className="text-indigo-600" onClick={() => act(() => publishScheduled({ variables: { id: s.id } }))}>Publish now</button>
                    <button className="text-rose-600" onClick={() => act(() => deleteScheduled({ variables: { id: s.id } }))}>Delete</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Drafts (${data.contentCalendar.totalDrafts})`}>
        {data.contentCalendar.drafts.length === 0 && <p className="text-sm text-slate-500">No drafts. Use “Save draft” in the composer.</p>}
        <ul className="divide-y divide-slate-100">
          {data.contentCalendar.drafts.map((d) => (
            <li key={d.id} className="py-2 text-sm">
              {editing?.id === d.id ? (
                <div className="space-y-2">
                  <textarea className="input" value={editing.content} onChange={(e) => setEditing({ id: d.id, content: e.target.value })} />
                  <button className="btn-primary px-3 py-1" onClick={() => act(async () => { await updateDraft({ variables: { id: d.id, content: editing.content } }); setEditing(null); })}>Save</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">{d.content}</span>
                  <span className="flex shrink-0 gap-2">
                    <button className="text-slate-600" onClick={() => setEditing({ id: d.id, content: d.content })}>Edit</button>
                    <button className="text-indigo-600" onClick={() => act(() => publishDraft({ variables: { id: d.id } }))}>Publish</button>
                    <button className="text-rose-600" onClick={() => act(() => deleteDraft({ variables: { id: d.id } }))}>Delete</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Archived posts">
        {archived.data?.archivedPosts.nodes.length === 0 && <p className="text-sm text-slate-500">Nothing archived.</p>}
        {archived.data?.archivedPosts.nodes.map((p) => (
          <div key={p.id} className="flex justify-between gap-3 py-1 text-sm">
            <span className="truncate">{p.content}</span>
            <button className="text-indigo-600" onClick={() => act(() => unarchive({ variables: { postId: p.id } }))}>Restore</button>
          </div>
        ))}
      </Card>
    </div>
  );
}
