'use client';

import { useMutation } from '@apollo/client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Card, Loading } from '@/components/ui';
import { RESET_PASSWORD } from '@/lib/gql';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const [reset, { data, error, loading }] = useMutation(RESET_PASSWORD);
  const [mismatch, setMismatch] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirm')) return setMismatch(true);
    setMismatch(false);
    await reset({ variables: { token, password: f.get('password') } }).catch(() => undefined);
  };
  if (data?.resetPassword)
    return (
      <Card title="Password changed">
        <p className="text-sm text-slate-600">All other sessions were signed out.</p>
        <Link href="/login" className="btn-primary mt-4">Sign in</Link>
      </Card>
    );
  return (
    <Card title="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
        <input name="password" type="password" className="input" placeholder="New password" required minLength={8} autoComplete="new-password" />
        <input name="confirm" type="password" className="input" placeholder="Repeat password" required autoComplete="new-password" />
        <button className="btn-primary w-full" disabled={loading || !token}>Save password</button>
      </form>
      {mismatch && <p className="mt-2 text-sm text-rose-600">Passwords do not match.</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error.message}</p>}
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Reset />
    </Suspense>
  );
}
