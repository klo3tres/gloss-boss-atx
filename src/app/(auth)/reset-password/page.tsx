'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearAuthUxSession, setRoleCache, writeHydratedOnceFlag } from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { waitForSessionHydration } from '@/lib/auth/waitForSessionHydration';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

function formatResetFailure(outcome: { code: string; message?: string; rawRole?: string }): string {
  switch (outcome.code) {
    case 'MISSING_PROFILE':
      return 'Your staff profile was not found. Ask the owner to repair your account from Admin → Team, or complete your team invite first.';
    case 'PROFILE_QUERY_ERROR':
      return outcome.message ?? 'Could not load your profile. Try again or contact the owner.';
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    setSupabase(client);
    if (!client) return;

    void client.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
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
        setError(updateError.message);
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
        /* non-blocking — ensure-profile also runs inside fetchUserRole sync path */
      }

      const outcome = await fetchUserRole(client);
      if (!outcome.ok) {
        setError(formatResetFailure(outcome));
        return;
      }

      setRoleCache(outcome.userId, outcome.role);
      writeHydratedOnceFlag();

      const destination = resolveDashboardPathForRole(outcome.role, null, outcome.email);
      setMessage(`Password updated. Opening your ${outcome.role.replace('_', ' ')} portal…`);
      window.setTimeout(() => {
        window.location.assign(destination);
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground'>
      <form onSubmit={handleSubmit} className='w-full max-w-md rounded-2xl border border-gold/20 bg-card p-6 shadow-lg'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-3 text-3xl font-black'>Set new password</h1>
        <p className='mt-2 text-sm text-muted-foreground'>Choose a secure password for your staff or customer account.</p>

        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900'>
            Auth is in setup mode. Add Supabase env keys to activate password reset.
          </p>
        ) : null}

        {!ready ? (
          <p className='mt-4 text-sm text-amber-800'>
            Open the reset link from your email or SMS. If it expired,{' '}
            <Link href='/forgot-password' className='text-gold-soft underline'>
              request a new link
            </Link>
            .
          </p>
        ) : null}

        <label className='mt-6 block text-sm'>
          <span className='mb-2 block text-muted-foreground'>New password</span>
          <input
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className='gb-input w-full rounded-lg border border-border bg-input px-4 py-3'
            minLength={8}
            required
            disabled={!ready || !envReady}
          />
        </label>

        <label className='mt-4 block text-sm'>
          <span className='mb-2 block text-muted-foreground'>Confirm password</span>
          <input
            type='password'
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className='gb-input w-full rounded-lg border border-border bg-input px-4 py-3'
            minLength={8}
            required
            disabled={!ready || !envReady}
          />
        </label>

        {error ? <p className='mt-4 text-sm text-red-400'>{error}</p> : null}
        {message ? <p className='mt-4 text-sm text-emerald-400'>{message}</p> : null}

        <button
          type='submit'
          disabled={!envReady || !ready || submitting}
          className='mt-6 w-full rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60'
        >
          {submitting ? 'Saving…' : 'Update password'}
        </button>

        <p className='mt-4 text-center text-xs text-muted-foreground'>
          <Link href='/login' className='text-gold-soft'>
            Back to login
          </Link>
        </p>
      </form>
    </main>
  );
}
