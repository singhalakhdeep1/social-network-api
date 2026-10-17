'use client';

import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import SignInPrompt from '@/components/SignInPrompt';
import { Avatar, Badge, Card, ErrorText, Loading } from '@/components/ui';
import { CHANGE_PASSWORD, CREATE_WEBHOOK, DELETE_WEBHOOK, DISABLE_2FA, ENABLE_2FA, RESEND_VERIFICATION, SETUP_2FA, UPDATE_NOTIFICATION_PREFS, UPDATE_PROFILE, UPLOAD_AVATAR, WEBHOOKS } from '@/lib/gql';
import { useMe } from '@/lib/hooks';

export default function SettingsPage() {
  const { me, signedIn, refetch } = useMe();
  const [updateProfile, profileState] = useMutation(UPDATE_PROFILE);
  const [uploadAvatar, avatarState] = useMutation(UPLOAD_AVATAR);
  const [savePrefs] = useMutation(UPDATE_NOTIFICATION_PREFS);
  const [changePassword, pwState] = useMutation(CHANGE_PASSWORD);
  const [resend] = useMutation(RESEND_VERIFICATION);
  const [saved, setSaved] = useState<string | null>(null);
  if (!signedIn) return <SignInPrompt what="change your settings" />;
  if (!me) return <Loading />;

  const flash = (text: string) => {
    setSaved(text);
    setTimeout(() => setSaved(null), 3000);
  };

  const submitProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await updateProfile({
      variables: {
        input: {
          displayName: f.get('displayName') || null,
          bio: f.get('bio') || null,
          website: f.get('website') || null,
          location: f.get('location') || null,
          isPrivate: f.get('isPrivate') === 'on',
          interests: String(f.get('interests') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
          birthYear: f.get('birthYear') ? Number(f.get('birthYear')) : null,
        },
      },
    }).then(() => { flash('Profile saved'); void refetch(); }).catch(() => undefined);
  };

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await changePassword({ variables: { current: f.get('current'), next: f.get('next') } }).then(() => { form.reset(); flash('Password changed'); }).catch(() => undefined);
  };

  const prefs = me.notificationPreferences ?? {};
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saved}</p>}
      <Card title="Profile">
        <div className="mb-4 flex items-center gap-4">
          <Avatar user={me} size={64} />
          <label className="btn-secondary cursor-pointer">
            Change photo
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) await uploadAvatar({ variables: { file } }).then(() => { flash('Photo updated'); void refetch(); }).catch(() => undefined); }} />
          </label>
          <ErrorText error={avatarState.error} />
        </div>
        <form onSubmit={submitProfile} className="grid gap-3 md:grid-cols-2">
          <label className="label">Display name<input name="displayName" className="input" defaultValue={me.displayName ?? ''} maxLength={50} /></label>
          <label className="label">Location<input name="location" className="input" defaultValue={me.location ?? ''} maxLength={100} /></label>
          <label className="label md:col-span-2">Bio<textarea name="bio" className="input" defaultValue={me.bio ?? ''} maxLength={500} /></label>
          <label className="label">Website<input name="website" type="url" className="input" defaultValue={me.website ?? ''} /></label>
          <label className="label">Birth year (for ad targeting)<input name="birthYear" type="number" min={1900} max={new Date().getFullYear()} className="input" /></label>
          <label className="label md:col-span-2">Interests (comma separated)<input name="interests" className="input" defaultValue={me.interests.join(', ')} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrivate" defaultChecked={me.isPrivate} /> Private account (only followers see your posts)</label>
          <button className="btn-primary md:col-span-2" disabled={profileState.loading}>Save profile</button>
        </form>
        <ErrorText error={profileState.error} />
      </Card>

      <Card title="Account">
        <p className="text-sm">
          {me.email} {me.emailVerified ? <Badge tone="emerald">verified</Badge> : <><Badge tone="amber">not verified</Badge> <button className="text-indigo-600" onClick={() => resend().then(() => flash('Verification email sent'))}>Resend email</button></>}
        </p>
        <form onSubmit={submitPassword} className="mt-3 grid gap-2 md:grid-cols-3">
          <input name="current" type="password" className="input" placeholder="Current password" required autoComplete="current-password" />
          <input name="next" type="password" className="input" placeholder="New password" required minLength={8} autoComplete="new-password" />
          <button className="btn-secondary" disabled={pwState.loading}>Change password</button>
        </form>
        <ErrorText error={pwState.error} />
      </Card>

      <TwoFactor enabled={Boolean(me.twoFactorEnabled)} onChange={() => { void refetch(); flash('Two-factor settings updated'); }} />

      <Card title="Notifications">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(['email', 'push', 'mentions', 'follows', 'likes', 'comments', 'messages'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm capitalize">
              <input type="checkbox" defaultChecked={prefs[key] ?? true} onChange={(e) => savePrefs({ variables: { input: { [key]: e.target.checked } } }).then(() => flash('Preferences saved'))} />
              {key}
            </label>
          ))}
        </div>
      </Card>

      <Webhooks />
    </div>
  );
}

function TwoFactor({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [setup, setupState] = useMutation(SETUP_2FA);
  const [enable, enableState] = useMutation(ENABLE_2FA);
  const [disable, disableState] = useMutation(DISABLE_2FA);
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  return (
    <Card title="Two-factor authentication" actions={enabled ? <Badge tone="emerald">on</Badge> : <Badge>off</Badge>}>
      {!enabled && !secret && <button className="btn-secondary" onClick={async () => { const r = await setup(); setSecret(r.data.setupTwoFactor); }}>Set up authenticator app</button>}
      {!enabled && secret && (
        <form className="space-y-2" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); await enable({ variables: { code } }); setSecret(null); onChange(); }}>
          <p className="text-sm text-slate-600">Add this key to Google Authenticator, 1Password or similar, then enter the 6-digit code:</p>
          <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 text-sm">{secret.secret}</code>
          <a href={secret.otpauthUrl} className="text-xs text-indigo-600">Open in authenticator app</a>
          <div className="flex gap-2">
            <input name="code" className="input w-40" placeholder="123456" inputMode="numeric" required />
            <button className="btn-primary">Enable</button>
          </div>
        </form>
      )}
      {enabled && (
        <form className="flex flex-wrap gap-2" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); await disable({ variables: { password: f.get('password'), code: f.get('code') || null } }); onChange(); }}>
          <input name="password" type="password" className="input w-48" placeholder="Password" required />
          <input name="code" className="input w-32" placeholder="Code" inputMode="numeric" />
          <button className="btn-danger">Turn off</button>
        </form>
      )}
      <ErrorText error={setupState.error ?? enableState.error ?? disableState.error} />
    </Card>
  );
}

function Webhooks() {
  const { data, refetch } = useQuery<{ myWebhooks: Array<{ id: string; url: string; events: string[]; isActive: boolean; triggerCount: number; failureCount: number; lastStatus: number | null }>; webhookEvents: string[] }>(WEBHOOKS);
  const [create, createState] = useMutation(CREATE_WEBHOOK);
  const [remove] = useMutation(DELETE_WEBHOOK);
  const [secret, setSecret] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const res = await create({ variables: { url: f.get('url'), events: f.getAll('events') } }).catch(() => null);
    if (res) {
      setSecret(res.data.createWebhook.secret);
      form.reset();
      void refetch();
    }
  };
  return (
    <Card title="Webhooks">
      <p className="mb-2 text-sm text-slate-600">Receive signed POST requests when things happen on your account. Verify <code>X-Webhook-Signature</code> with the secret.</p>
      {secret && <p className="mb-2 break-all rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Signing secret: <code>{secret}</code></p>}
      {data?.myWebhooks.map((w) => (
        <div key={w.id} className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{w.url} <span className="text-xs text-slate-500">({w.events.join(', ')}) · {w.triggerCount} sent · {w.failureCount} failed{w.lastStatus ? ` · last ${w.lastStatus}` : ''}</span></span>
          <button className="text-rose-600" onClick={async () => { await remove({ variables: { id: w.id } }); void refetch(); }}>Delete</button>
        </div>
      ))}
      <form onSubmit={submit} className="mt-2 space-y-2">
        <input name="url" type="url" className="input" placeholder="https://example.com/webhook" required />
        <div className="flex flex-wrap gap-3">
          {data?.webhookEvents.map((ev) => <label key={ev} className="flex items-center gap-1 text-xs"><input type="checkbox" name="events" value={ev} /> {ev}</label>)}
        </div>
        <button className="btn-secondary" disabled={createState.loading}>Add webhook</button>
      </form>
      <ErrorText error={createState.error} />
    </Card>
  );
}
