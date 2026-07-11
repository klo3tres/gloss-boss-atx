'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearAuthUxSession, setRoleCache, writeHydratedOnceFlag } from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { humanizeAuthError } from '@/lib/auth/auth-event-log';
import { resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { waitForSessionHydration } from '@/lib/auth/waitForSessionHydration';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

type ResetState =
  | 'checking'
  | 'ready'
  | 'missing_session'
  | 'expired'
  | 'already_used'
  | 'success'
  | 'error';

function formatResetFailure(outcome: { code: string; message?: string; rawRole?: string }): string {
  switch (outcome.code) {
    case 'MISSING_PROFILE':
      return 'Your staff profile was not found. Ask the owner to repair your account from Admin → Team, or complete your team invite first.';
    case 'PROFILE_QUERY_ERROR':
      return humanizeAuthError(outcome.message ?? 'Could not load your profile.');
    case 'INVALID_ROLE':
      return `Your profile role is invalid (${outcome.rawRole ?? 'unknown'}). Contact the owner.`;
    case 'NO_SESSION':
      return 'Session expired. Open the reset link from your email again.';
    default:
      return 'Password was saved but we could not route you to the correct portal. Try signing in.';
  }
}

export default function ResetPasswordPage() {
  const envReady = isSupabasePublicReady();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [state, setState] = useState<ResetState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    setSupabase(client);
    if (!client) {
      setState('missing_session');
      return;
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err === 'expired' || err === 'otp_expired') {
        setState('expired');
        setError('This reset link has expired. Request a new one.');
        return;
      }
      if (err === 'already_used') {
        setState('already_used');
        setError('This reset link was already used. Sign in with your new password, or request another reset.');
        return;
      }
    }

    void client.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAccountEmail(data.session.user.email ?? null);
        setState('ready');
      } else {
        setState('missing_session');
      }
    });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setAccountEmail(session?.user.email ?? null);
        setState('ready');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least one letter and one number.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const client = supabase ?? createSupabaseBrowserClient();
    if (!client) {
      setError('Auth client unavailable.');
      return;
    }

    setSubmitting(true);
    try {
      clearAuthUxSession();

      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        const raw = updateError.message;
        if (/same password|identical/i.test(raw)) {
          setState('already_used');
          setError('That password matches your current one, or this link was already completed. Sign in or request a new reset.');
        } else {
          setError(humanizeAuthError(raw));
        }
        return;
      }

      await waitForSessionHydration(client);

      try {
        await fetchWithTimeout('/api/auth/ensure-profile', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          timeoutMs: 8000,
        });
      } catch {
        /* non-blocking */
      }

      try {
        await fetchWithTimeout('/api/auth/log-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'password_updated' }),
          timeoutMs: 4000,
        });
      } catch {
        /* non-blocking */
      }

      const outcome = await fetchUserRole(client);
      if (!outcome.ok) {
        setState('success');
        setMessage('Password updated. We could not auto-open your portal — use Sign in.');
        setError(formatResetFailure(outcome));
        return;
      }

      setRoleCache(outcome.userId, outcome.role);
      writeHydratedOnceFlag();

      const destination = resolveDashboardPathForRole(outcome.role, null, outcome.email);
      setState('success');
      setMessage(`Password updated. Opening your ${outcome.role.replace('_', ' ')} portal…`);
      window.setTimeout(() => {
        window.location.assign(destination);
      }, 600);
    } catch (e) {
      setError(humanizeAuthError(e instanceof Error ? e.message : 'Could not update password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const blocked = state === 'missing_session' || state === 'expired' || state === 'already_used';
  const formReady = state === 'ready' || state === 'success';

  return (
    <main className='flex min-h-[100dvh] items-center justify-center bg-background px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-28 text-foreground'>
      <form onSubmit={handleSubmit} className='w-full max-w-md rounded-2xl border border-gold/20 bg-card p-6 shadow-lg'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-3 text-3xl font-black'>Set new password</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {accountEmail ? (
            <>
              Updating password for <span className='font-semibold text-foreground'>{accountEmail}</span>
            </>
          ) : (
            'Choose a secure password for your staff or customer account.'
          )}
        </p>

        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900'>
            Auth is in setup mode. Add Supabase env keys to activate password reset.
          </p>
        ) : null}

        {state === 'checking' ? (
          <p className='mt-4 text-sm text-muted-foreground'>Verifying your reset link…</p>
        ) : null}

        {blocked ? (
          <div className='mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100'>
            <p>{error ?? 'This reset link is not valid.'}</p>
            <div className='flex flex-col gap-2'>
              <Link href='/forgot-password' className='min-h-11 inline-flex items-center justify-center rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
                Request a new reset link
              </Link>
              <Link href='/login' className='min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-xs font-semibold'>
                Back to login
              </Link>
            </div>
          </div>
        ) : null}

        {formReady ? (
          <>
            <p className='mt-4 text-xs text-muted-foreground'>Requirements: at least 8 characters, one letter, one number.</p>

            <label className='mt-4 block text-sm'>
              <span className='mb-2 block text-muted-foreground'>New password</span>
              <div className='relative'>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name='new-password'
                  autoComplete='new-password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className='gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3 pr-20'
                  minLength={8}
                  required
                  disabled={!envReady || submitting || state === 'success'}
                />
                <button
                  type='button'
                  className='absolute right-2 top-1/2 -translate-y-1/2 min-h-11 px-2 text-xs font-semibold text-muted-foreground'
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className='mt-4 block text-sm'>
              <span className='mb-2 block text-muted-foreground'>Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                name='confirm-password'
                autoComplete='new-password'
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className='gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3'
                minLength={8}
                required
                disabled={!envReady || submitting || state === 'success'}
              />
            </label>

            {error ? <p className='mt-4 text-sm text-red-400' role='alert'>{error}</p> : null}
            {message ? <p className='mt-4 text-sm text-emerald-600 dark:text-emerald-400'>{message}</p> : null}

            <button
              type='submit'
              disabled={!envReady || submitting || state === 'success'}
              className='mt-6 w-full min-h-11 rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60'
            >
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </>
        ) : null}

        <p className='mt-4 text-center text-xs text-muted-foreground'>
          Need help? Contact your administrator ·{' '}
          <Link href='/login' className='text-gold-soft'>
            Back to login
          </Link>
        </p>
      </form>
    </main>
  );
}
