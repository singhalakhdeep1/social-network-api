'use client';

import { useMutation, useQuery } from '@apollo/client';
import { FormEvent } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Badge, Card, ErrorText, Loading, UserLike, timeAgo } from '@/components/ui';
import { CANCEL_SUBSCRIPTION, CREATE_AD, CREATOR, MY_ANALYTICS, PAUSE_AD, RESUME_AD } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

interface CreatorData {
  paymentMode: string;
  creatorDashboard: {
    totalEarnings: number;
    totalTips: number;
    totalSubscriptions: number;
    subscriberCount: number;
    tipsByMonth: Array<{ month: string; total: number }>;
    recentTips: Array<{ id: string; amount: number; message: string | null; isAnonymous: boolean; createdAt: string; sender: UserLike | null }>;
  };
  mySubscribers: Array<{ id: string; tier: string; price: number; endDate: string; subscriber: UserLike }>;
  mySubscriptions: Array<{ id: string; tier: string; price: number; endDate: string; creator: UserLike }>;
  myAds: Array<{ id: string; title: string; status: string; budget: number; spent: number; impressions: number; clicks: number; ctr: number; endDate: string }>;
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function CreatorPage() {
  const { signedIn } = useMe();
  const { data, refetch } = useQuery<CreatorData>(CREATOR, { skip: !signedIn });
  const analytics = useQuery<{ myAnalytics: { totalPosts: number; totalLikes: number; totalComments: number; totalShares: number; totalFollowers: number; profileViews: number; engagementRate: number; dailyActivity: Array<{ date: string; events: number }>; topPosts: Array<{ id: string; content: string; likeCount: number; commentCount: number }> } }>(MY_ANALYTICS, { skip: !signedIn });
  const [createAd, adState] = useMutation(CREATE_AD);
  const [pause] = useMutation(PAUSE_AD);
  const [resume] = useMutation(RESUME_AD);
  const [cancelSub] = useMutation(CANCEL_SUBSCRIPTION);
  if (!signedIn) return <SignInPrompt what="see your creator dashboard" />;
  if (!data) return <Loading />;
  const d = data.creatorDashboard;
  const a = analytics.data?.myAnalytics;
  const maxDaily = Math.max(1, ...(a?.dailyActivity.map((x) => x.events) ?? [1]));

  const submitAd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const list = (k: string) => String(f.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const res = await createAd({
      variables: {
        title: f.get('title'),
        description: f.get('description'),
        targetUrl: f.get('url'),
        budget: Number(f.get('budget')),
        start: new Date().toISOString(),
        end: new Date(String(f.get('end'))).toISOString(),
        mediaUrls: f.get('image') ? [f.get('image')] : null,
        audience: { interests: list('interests'), locations: list('locations'), ageRange: f.get('minAge') ? { min: Number(f.get('minAge')), max: Number(f.get('maxAge') || 99) } : null },
      },
    }).catch(() => null);
    if (res) {
      form.reset();
      void refetch();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Creator studio</h1>
        <Badge tone={data.paymentMode === 'stripe' ? 'indigo' : 'amber'}>{data.paymentMode === 'stripe' ? 'Stripe payments' : 'Demo payments'}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total earnings" value={usd(d.totalEarnings)} />
        <Stat label="Tips" value={usd(d.totalTips)} />
        <Stat label="Subscriptions" value={usd(d.totalSubscriptions)} />
        <Stat label="Subscribers" value={String(d.subscriberCount)} />
      </div>
      {a && (
        <Card title="Your analytics">
          <div className="mb-3 grid grid-cols-3 gap-3 text-sm md:grid-cols-6">
            <div><strong>{a.totalPosts}</strong> posts</div>
            <div><strong>{a.totalLikes}</strong> likes</div>
            <div><strong>{a.totalComments}</strong> comments</div>
            <div><strong>{a.totalShares}</strong> shares</div>
            <div><strong>{a.profileViews}</strong> profile views</div>
            <div><strong>{a.engagementRate}%</strong> engagement</div>
          </div>
          <div className="flex h-24 items-end gap-1" aria-label="Daily activity">
            {a.dailyActivity.map((x) => (
              <div key={x.date} className="flex-1 rounded-t bg-indigo-400" style={{ height: `${(x.events / maxDaily) * 100}%` }} title={`${x.date}: ${x.events}`} />
            ))}
          </div>
          {a.topPosts.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {a.topPosts.map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="truncate">{p.content}</span><span className="shrink-0 text-slate-500">♥ {p.likeCount} · 💬 {p.commentCount}</span></li>)}
            </ul>
          )}
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent tips">
          {d.recentTips.length === 0 && <p className="text-sm text-slate-500">No tips yet.</p>}
          {d.recentTips.map((t) => (
            <div key={t.id} className="flex justify-between gap-2 py-1 text-sm">
              <span>{t.isAnonymous || !t.sender ? 'Anonymous' : t.sender.username}{t.message && <span className="text-slate-500">: “{t.message}”</span>}</span>
              <span className="shrink-0">{usd(t.amount)} · {timeAgo(t.createdAt)}</span>
            </div>
          ))}
        </Card>
        <Card title="Subscribers">
          {data.mySubscribers.length === 0 && <p className="text-sm text-slate-500">No subscribers yet.</p>}
          {data.mySubscribers.map((s) => <div key={s.id} className="flex justify-between text-sm"><span>{s.subscriber.username} <Badge>{s.tier}</Badge></span><span>{usd(s.price)}/mo</span></div>)}
        </Card>
        <Card title="You support">
          {data.mySubscriptions.length === 0 && <p className="text-sm text-slate-500">You are not subscribed to anyone.</p>}
          {data.mySubscriptions.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span>{s.creator.username} <Badge>{s.tier}</Badge> until {new Date(s.endDate).toLocaleDateString()}</span>
              <button className="text-rose-600" onClick={async () => { await cancelSub({ variables: { id: s.id } }); void refetch(); }}>Cancel</button>
            </div>
          ))}
        </Card>
        <Card title="Your ads">
          {data.myAds.map((ad) => (
            <div key={ad.id} className="mb-2 rounded-xl border border-slate-200 p-2 text-sm">
              <div className="flex justify-between"><span className="font-medium">{ad.title}</span><Badge tone={ad.status === 'active' ? 'emerald' : 'slate'}>{ad.status}</Badge></div>
              <div className="text-xs text-slate-500">{ad.impressions} impressions · {ad.clicks} clicks · CTR {ad.ctr}% · spent {usd(ad.spent)} of {usd(ad.budget)}</div>
              {ad.status === 'active' && <button className="text-xs text-indigo-600" onClick={() => pause({ variables: { id: ad.id } })}>Pause</button>}
              {ad.status === 'paused' && <button className="text-xs text-indigo-600" onClick={() => resume({ variables: { id: ad.id } })}>Resume</button>}
            </div>
          ))}
          <form onSubmit={submitAd} className="mt-3 grid gap-2 md:grid-cols-2">
            <input name="title" className="input" placeholder="Ad title" required />
            <input name="url" type="url" className="input" placeholder="https://destination" required />
            <input name="description" className="input md:col-span-2" placeholder="Description" required />
            <input name="image" type="url" className="input md:col-span-2" placeholder="Image URL (optional)" />
            <input name="interests" className="input" placeholder="Interests (comma separated)" />
            <input name="locations" className="input" placeholder="Locations (comma separated)" />
            <input name="minAge" type="number" className="input" placeholder="Min age" />
            <input name="maxAge" type="number" className="input" placeholder="Max age" />
            <input name="budget" type="number" min={5} step="1" className="input" placeholder="Budget (USD)" required />
            <input name="end" type="date" className="input" required aria-label="End date" />
            <button className="btn-primary md:col-span-2" disabled={adState.loading}>Launch ad</button>
          </form>
          <ErrorText error={adState.error} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
