'use client';

import { useMutation } from '@apollo/client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Card, Loading } from '@/components/ui';
import { VERIFY_EMAIL } from '@/lib/gql';

function Verify() {
  const token = useSearchParams().get('token');
  const [verify, { data, error, loading }] = useMutation(VERIFY_EMAIL);
  const sent = useRef(false);
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      void verify({ variables: { token } }).catch(() => undefined);
    }
  }, [token, verify]);
  return (
    <Card title="Email verification">
      {!token && <p className="text-sm text-rose-600">This link is missing its token.</p>}
      {loading && <p className="text-sm text-slate-500">Verifying…</p>}
      {data?.verifyEmail && <p className="text-sm text-emerald-700">Your email is verified. You are all set.</p>}
      {error && <p className="text-sm text-rose-600">{error.message}</p>}
      <Link href="/" className="btn-primary mt-4">Continue</Link>
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Verify />
    </Suspense>
  );
}
