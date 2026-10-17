'use client';

import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Badge, Card, Empty, ErrorText, Loading } from '@/components/ui';
import { CREATE_EVENT, EVENTS } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface EventRow {
  id: string;
  title: string;
  startDate: string;
  isOnline: boolean;
  attendeeCount: number;
  maxAttendees: number | null;
  isAttending: boolean;
  isWaitlisted: boolean;
  location: { name: string };
}

export default function EventsPage() {
  const { signedIn } = useMe();
  const router = useRouter();
  const { data } = useQuery<{ events: { nodes: EventRow[] } }>(EVENTS, { skip: !signedIn });
  const [create, { loading, error }] = useMutation(CREATE_EVENT);
  if (!signedIn) return <SignInPrompt what="see events" />;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const online = f.get('online') === 'on';
    const res = await create({
      variables: {
        input: {
          title: f.get('title'),
          description: f.get('description'),
          startDate: new Date(String(f.get('start'))).toISOString(),
          endDate: new Date(String(f.get('end'))).toISOString(),
          isOnline: online,
          meetingUrl: online ? f.get('meetingUrl') || null : null,
          maxAttendees: f.get('max') ? Number(f.get('max')) : null,
          location: { name: String(f.get('place') || (online ? 'Online' : 'TBA')), address: String(f.get('address') || '') || (online ? 'Online' : 'TBA') },
          category: f.get('category') || 'social',
        },
      },
    }).catch(() => null);
    if (res) router.push(`/events/${res.data.createEvent.id}`);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Upcoming events</h1>
        {!data ? <Loading /> : data.events.nodes.length === 0 ? <Empty>No upcoming events.</Empty> : data.events.nodes.map((ev) => (
          <Card key={ev.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/events/${ev.id}`} className="text-lg font-semibold hover:underline">{ev.title}</Link>
                <div className="text-sm text-slate-500">
                  {new Date(ev.startDate).toLocaleString()} · {ev.isOnline ? 'Online' : ev.location.name}
                </div>
                <div className="text-xs text-slate-400">{ev.attendeeCount}{ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''} going</div>
              </div>
              {ev.isAttending ? <Badge tone="emerald">Going</Badge> : ev.isWaitlisted ? <Badge tone="amber">Waitlist</Badge> : null}
            </div>
          </Card>
        ))}
      </div>
      <Card title="Host an event">
        <form onSubmit={submit} className="space-y-2">
          <input name="title" className="input" placeholder="Title" required />
          <textarea name="description" className="input" placeholder="Description" required />
          <label className="label">Starts<input name="start" type="datetime-local" className="input" required /></label>
          <label className="label">Ends<input name="end" type="datetime-local" className="input" required /></label>
          <input name="place" className="input" placeholder="Venue name" />
          <input name="address" className="input" placeholder="Address" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="online" /> Online event</label>
          <input name="meetingUrl" className="input" placeholder="Meeting link (online)" />
          <input name="max" type="number" min={1} className="input" placeholder="Capacity (optional)" />
          <input name="category" className="input" placeholder="Category" />
          <button className="btn-primary w-full" disabled={loading}>Create event</button>
        </form>
        <ErrorText error={error} />
      </Card>
    </div>
  );
}
