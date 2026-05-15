'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const envReady = isSupabasePublicReady();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
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

    try {
      console.info('[Gloss Boss ATX][forgot-password] request', { email: email.trim() });

      const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (resetError) {
        console.warn('[Gloss Boss ATX][forgot-password] failed', resetError.message);
        setError(resetError.message);
        return;
      }

      console.info('[Gloss Boss ATX][forgot-password] email sent (if account exists)');
      setMessage('Password reset link sent. Check your inbox.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      console.warn('[Gloss Boss ATX][forgot-password] unexpected error', e);
      setError(msg);
    }
  };

  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground'>
      <form onSubmit={handleReset} className='w-full max-w-md rounded-2xl border border-gold/20 bg-zinc-950 p-6'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Customer Portal</p>
        <h1 className='mt-3 text-3xl font-black uppercase'>Reset Password</h1>
        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200'>
            Auth is in setup mode. Add Supabase env keys to activate password reset.
          </p>
        ) : null}

        <label className='mt-6 block text-sm'>
          <span className='mb-2 block text-zinc-300'>Email</span>
          <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
        </label>

        {error ? <p className='mt-4 text-sm text-red-400'>{error}</p> : null}
        {message ? <p className='mt-4 text-sm text-emerald-400'>{message}</p> : null}

        <button type='submit' disabled={!envReady} className='mt-6 w-full rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60'>
          Send Reset Link
        </button>

        <p className='mt-4 text-center text-xs text-zinc-400'>
          Return to{' '}
          <Link href='/login' className='text-gold-soft'>
            login
          </Link>
        </p>
      </form>
    </main>
  );
}
