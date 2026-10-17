'use client';

import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { gql } from '@apollo/client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Avatar, Badge, Card, ErrorText, Loading, UserLike } from '@/components/ui';
import { CANCEL_RSVP, EVENT, RSVP } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

const EVENT_RSVP = gql`subscription EventRsvp($id: ID!) { eventRSVP(eventId: $id) { id attendeeCount waitlistCount } }`;

interface EventData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isOnline: boolean;
  meetingUrl: string | null;
  maxAttendees: number | null;
  attendeeCount: number;
  waitlistCount: number;
  isAttending: boolean;
  isWaitlisted: boolean;
  isHost: boolean;
  category: string;
  location: { name: string; address: string };
  host: UserLike;
  attendees: UserLike[];
}

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data, error, refetch } = useQuery<{ event: EventData }>(EVENT, { variables: { id } });
  const [rsvp, rsvpState] = useMutation(RSVP);
  const [cancel] = useMutation(CANCEL_RSVP);
  useSubscription(EVENT_RSVP, { variables: { id }, skip: !me, onData: () => void refetch() });
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const ev = data.event;
  const full = ev.maxAttendees !== null && ev.attendeeCount >= ev.maxAttendees;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <Card>
        <Badge>{ev.category}</Badge>
        <h1 className="mt-2 text-2xl font-bold">{ev.title}</h1>
        <p className="text-sm text-slate-500">
          {new Date(ev.startDate).toLocaleString()} – {new Date(ev.endDate).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-slate-500">{ev.isOnline ? <>Online {ev.meetingUrl && (ev.isAttending || ev.isHost) && <a className="text-indigo-600" href={ev.meetingUrl} target="_blank" rel="noopener noreferrer">join link</a>}</> : `${ev.location.name}, ${ev.location.address}`}</p>
        <p className="mt-4 whitespace-pre-wrap text-slate-700">{ev.description}</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {ev.attendeeCount}{ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''} going{ev.waitlistCount ? ` · ${ev.waitlistCount} on waitlist` : ''}
          </span>
          {me && !ev.isHost && (ev.isAttending || ev.isWaitlisted ? (
            <button className="btn-secondary" onClick={() => cancel({ variables: { id } })}>{ev.isAttending ? 'Cancel RSVP' : 'Leave waitlist'}</button>
          ) : (
            <button className="btn-primary" disabled={rsvpState.loading} onClick={() => rsvp({ variables: { id, attending: true } })}>{full ? 'Join waitlist' : "I'm going"}</button>
          ))}
          {ev.isAttending && <Badge tone="emerald">You are going</Badge>}
          {ev.isWaitlisted && <Badge tone="amber">You are on the waitlist</Badge>}
        </div>
        <ErrorText error={rsvpState.error} />
      </Card>
      <Card title="Who's going">
        <p className="mb-2 text-xs text-slate-500">Hosted by <Link href={`/u/${ev.host.username}`} className="text-indigo-600">{ev.host.username}</Link></p>
        {ev.attendees.map((u) => (
          <div key={u.id} className="mb-2 flex items-center gap-2 text-sm"><Avatar user={u} size={24} /> {u.displayName || u.username}</div>
        ))}
      </Card>
    </div>
  );
}
