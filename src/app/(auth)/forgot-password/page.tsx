'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';
import { passwordResetRedirectUrl } from '@/lib/auth/action-link-registry';
import { humanizeAuthError } from '@/lib/auth/auth-event-log';

export default function ForgotPasswordPage() {
  const envReady = isSupabasePublicReady();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'expired') {
        setError('That reset link expired. Enter your email to send a new one.');
      }
    }
  }, []);

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!envReady) {
      setError('Supabase keys are not configured yet. Add them in .env.local to enable reset email.');
      return;
    }

    const client = supabase ?? createSupabaseBrowserClient();
    if (!client) {
      setError('Auth client is not available. Check Supabase environment variables.');
      return;
    }

    setBusy(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}&type=recovery`
          : passwordResetRedirectUrl();

      const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (resetError) {
        setError(humanizeAuthError(resetError.message));
        return;
      }

      setMessage(`If an account exists for ${email.trim()}, a reset link was sent. Open it on this device to set a new password.`);
    } catch (e) {
      setError(humanizeAuthError(e instanceof Error ? e.message : 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground'>
      <form onSubmit={handleReset} className='w-full max-w-md rounded-2xl border border-gold/20 bg-card p-6 shadow-lg'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-3 text-3xl font-black'>Reset password</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          We email a secure link that opens the password form — not the login page.
        </p>
        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900'>
            Auth is in setup mode. Add Supabase env keys to activate password reset.
          </p>
        ) : null}

        <label className='mt-6 block text-sm'>
          <span className='mb-2 block text-muted-foreground'>Email</span>
          <input
            type='email'
            autoComplete='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className='gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3'
            required
          />
        </label>

        {error ? <p className='mt-4 text-sm text-red-400'>{error}</p> : null}
        {message ? <p className='mt-4 text-sm text-emerald-600 dark:text-emerald-400'>{message}</p> : null}

        <button
          type='submit'
          disabled={!envReady || busy}
          className='mt-6 w-full min-h-11 rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60'
        >
          {busy ? 'Sending…' : 'Send Reset Link'}
        </button>

        <p className='mt-4 text-center text-xs text-muted-foreground'>
          Return to{' '}
          <Link href='/login' className='text-gold-soft'>
            login
          </Link>
        </p>
      </form>
    </main>
  );
}
