'use client';

import { useMutation } from '@apollo/client';
import { FormEvent, useRef, useState } from 'react';
import { CREATE_DRAFT, CREATE_POLL, CREATE_POST, SCHEDULE_POST } from '@/lib/gql';

/** New post: text with #hashtags/@mentions, images or video, an optional poll, or save as draft / schedule. */
export default function Composer({ groupId, pageId, onPosted, placeholder = "What's happening?" }: { groupId?: string; pageId?: string; onPosted?: () => void; placeholder?: string }) {
  const [createPost, { loading }] = useMutation(CREATE_POST);
  const [createPoll] = useMutation(CREATE_POLL);
  const [createDraft] = useMutation(CREATE_DRAFT);
  const [schedule] = useMutation(SCHEDULE_POST);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [scheduleAt, setScheduleAt] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setContent('');
    setFiles([]);
    setPollOpen(false);
    setQuestion('');
    setOptions(['', '']);
    setScheduleAt('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      if (scheduleAt) {
        await schedule({ variables: { content, scheduledFor: new Date(scheduleAt).toISOString() } });
        setMessage({ text: `Scheduled for ${new Date(scheduleAt).toLocaleString()}`, ok: true });
        reset();
        return;
      }
      const res = await createPost({ variables: { content: content || null, media: files.length ? files : null, groupId, pageId } });
      const filled = options.map((o) => o.trim()).filter(Boolean);
      if (pollOpen && question.trim() && filled.length >= 2) {
        await createPoll({ variables: { postId: res.data.createPost.id, question, options: filled } });
      }
      reset();
      setMessage({ text: 'Posted', ok: true });
      onPosted?.();
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
    }
  };

  const saveDraft = async () => {
    try {
      await createDraft({ variables: { content } });
      reset();
      setMessage({ text: 'Saved to drafts', ok: true });
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <textarea className="input min-h-[80px] resize-y border-0 px-0 text-base focus:ring-0" placeholder={placeholder} value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} aria-label="Post content" />
      {files.length > 0 && <div className="mb-2 text-xs text-slate-500">{files.map((f) => f.name).join(', ')}</div>}
      {pollOpen && (
        <div className="mb-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <input className="input" placeholder="Poll question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <input key={i} className="input" placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {options.length < 6 && (
            <button type="button" className="text-sm text-indigo-600" onClick={() => setOptions([...options, ''])}>
              + Add option
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <label className="cursor-pointer rounded-lg px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50">
          📷 Media
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" multiple hidden onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} />
        </label>
        {!groupId && !pageId && (
          <>
            <button type="button" className="rounded-lg px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50" onClick={() => setPollOpen(!pollOpen)}>
              📊 Poll
            </button>
            <input type="datetime-local" className="input w-auto py-1 text-sm" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-label="Schedule for" title="Schedule for later" />
            <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => void saveDraft()} disabled={!content.trim()}>
              Save draft
            </button>
          </>
        )}
        <button className="btn-primary ml-auto" disabled={loading || (!content.trim() && files.length === 0)}>
          {scheduleAt ? 'Schedule' : 'Post'}
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{message.text}</p>}
    </form>
  );
}
