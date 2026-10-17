'use client';

import { ApolloError, useMutation } from '@apollo/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Card, Loading } from '@/components/ui';
import { useAuth } from '@/lib/apollo';
import { FORGOT_PASSWORD, LOGIN, REGISTER } from '@/lib/gql';

type Mode = 'login' | 'register' | 'forgot';

function AuthForms() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'login');
  const [needsCode, setNeedsCode] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [login, loginState] = useMutation(LOGIN);
  const [register, registerState] = useMutation(REGISTER);
  const [forgot, forgotState] = useMutation(FORGOT_PASSWORD);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMessage(null);
    try {
      if (mode === 'forgot') {
        await forgot({ variables: { email: f.get('email') } });
        setMessage({ text: 'If that email has an account, a reset link is on its way.', ok: true });
        return;
      }
      const res =
        mode === 'login'
          ? (await login({ variables: { email: f.get('email'), password: f.get('password'), code: f.get('code') || null } })).data.login
          : (await register({ variables: { username: f.get('username'), email: f.get('email'), password: f.get('password'), displayName: f.get('displayName') || null } })).data.register;
      signIn(res.accessToken, res.refreshToken);
      router.push(mode === 'register' ? '/explore' : '/');
    } catch (err) {
      const code = (err as ApolloError).graphQLErrors?.[0]?.extensions?.code;
      if (code === 'TWO_FACTOR_REQUIRED') {
        setNeedsCode(true);
        setMessage({ text: 'Enter the 6-digit code from your authenticator app.', ok: true });
      } else setMessage({ text: (err as Error).message, ok: false });
    }
  };

  const busy = loginState.loading || registerState.loading || forgotState.loading;
  return (
    <Card>
      <h1 className="mb-1 text-center text-2xl font-bold text-indigo-600">Circle</h1>
      <div className="mb-4 flex justify-center gap-2">
        {(['login', 'register'] as const).map((m) => (
          <button key={m} className={mode === m ? 'tab-active' : 'tab'} onClick={() => { setMode(m); setMessage(null); }}>
            {m === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <>
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" name="username" className="input" required pattern="[A-Za-z0-9_]{3,30}" title="3-30 letters, digits or _" autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" className="input" maxLength={50} />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        {mode !== 'forgot' && (
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} />
            {mode === 'register' && <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>}
          </div>
        )}
        {mode === 'login' && needsCode && (
          <div>
            <label className="label" htmlFor="code">Authentication code</label>
            <input id="code" name="code" className="input" inputMode="numeric" autoComplete="one-time-code" required />
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</p>}
      <div className="mt-4 text-center text-sm">
        {mode === 'forgot' ? (
          <button className="text-indigo-600" onClick={() => setMode('login')}>Back to sign in</button>
        ) : (
          <button className="text-slate-500 hover:text-indigo-600" onClick={() => setMode('forgot')}>Forgot password?</button>
        )}
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthForms />
    </Suspense>
  );
}
