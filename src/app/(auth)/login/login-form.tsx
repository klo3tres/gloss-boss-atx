'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearAuthUxSession, setRoleCache, writeHydratedOnceFlag } from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { getSafeInternalRedirect } from '@/lib/auth/safe-redirect';
import { resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { waitForSessionHydration } from '@/lib/auth/waitForSessionHydration';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

function formatLoginFailure(outcome: { code: string; message?: string; rawRole?: string }): string {
  switch (outcome.code) {
    case 'MISSING_PROFILE':
      return 'Profile not found — contact admin.';
    case 'PROFILE_QUERY_ERROR':
      return outcome.message ?? 'Could not load your profile. Try again or contact admin.';
    case 'INVALID_ROLE':
      return `Your profile role is invalid (${outcome.rawRole ?? 'unknown'}). Contact admin.`;
    case 'NO_SESSION':
      return 'Could not read your session after sign-in. Please try again.';
    default:
      return 'Sign-in could not be completed. Please try again.';
  }
}

export default function LoginForm() {
  const envReady = isSupabasePublicReady();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'finishing'>('idle');

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!envReady) {
      setError('Supabase keys are not configured yet. Add them in .env.local to enable login.');
      return;
    }

    const client = supabase ?? createSupabaseBrowserClient();
    if (!client) {
      setError('Auth client is not available. Check Supabase environment variables.');
      return;
    }

    setPhase('submitting');

    try {
      clearAuthUxSession();

      const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setPhase('idle');
        return;
      }

      if (!data.session?.user) {
        setError('Could not establish a session. Please try again.');
        setPhase('idle');
        return;
      }

      setPhase('finishing');
      console.info('[CRM_DEBUG_AUTH]', 'sign_in_ok', { userId: data.session.user.id });

      await waitForSessionHydration(client);

      const { data: sessionSnap } = await client.auth.getSession();
      if (!sessionSnap.session) {
        console.warn('[CRM_DEBUG_AUTH]', 'session_missing_after_hydration');
        setError('Session did not persist after sign-in. Check cookies / same-site settings and try again.');
        setPhase('idle');
        return;
      }
      console.info('[CRM_DEBUG_AUTH]', 'session_ready', { userId: sessionSnap.session.user.id });

      let syncRes: Response;
      try {
        syncRes = await fetchWithTimeout('/api/auth/ensure-profile', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          timeoutMs: 5000,
        });
      } catch (err) {
        console.warn('[CRM_DEBUG_AUTH]', 'ensure-profile fetch', err);
        syncRes = new Response(null, { status: 408 });
      }

      if (!syncRes.ok) {
        const j = (await syncRes.json().catch(() => ({}))) as { error?: string; hint?: string };
        console.warn('[CRM_DEBUG_AUTH]', 'ensure_profile_http_error', syncRes.status, j);
        if (syncRes.status === 401) {
          setError(j.error ?? 'Not authenticated for profile sync. Please try signing in again.');
          await client.auth.signOut();
          setPhase('idle');
          return;
        }
        /* Recovery: never sign out or block login on profile sync / schema drift — role resolution uses safe fallbacks. */
      } else {
        console.info('[CRM_DEBUG_AUTH]', 'ensure_profile_ok');
      }

      const outcome = await fetchUserRole(client);

      if (!outcome.ok) {
        console.warn('[CRM_DEBUG_AUTH]', 'role_resolution_failed', outcome);
        await client.auth.signOut();
        setError(formatLoginFailure(outcome));
        setPhase('idle');
        return;
      }

      setRoleCache(outcome.userId, outcome.role);
      writeHydratedOnceFlag();

      const nextRaw = searchParams.get('next');
      const fallback = resolveDashboardPathForRole(outcome.role, null, outcome.email);
      const destination = nextRaw ? getSafeInternalRedirect(nextRaw, fallback) : fallback;

      console.info(
        '[AUTH_FLOW]',
        JSON.stringify({
          step: 'login_ok',
          userId: outcome.userId,
          role: outcome.role,
          source: outcome.source,
          redirect: destination,
        }),
      );

      console.info('[CRM_DEBUG_AUTH]', 'redirect_assign', { destination });

      if (typeof window !== 'undefined') {
        window.location.assign(destination);
      } else {
        router.push(destination);
        router.refresh();
        setPhase('idle');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      console.warn('[AUTH] login error', e);
      setError(msg);
      setPhase('idle');
    }
  };

  return (
    <main className='relative flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground'>
      {phase === 'finishing' ? (
        <div className='pointer-events-none fixed inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]'>
          <div className='flex flex-col items-center gap-3'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold-soft' aria-hidden />
            <p className='text-sm text-zinc-300'>Opening your dashboard…</p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleLogin}
        className={`relative z-[20] w-full max-w-md rounded-2xl border border-gold/20 bg-zinc-950 p-6 transition-opacity ${phase === 'finishing' ? 'opacity-40' : 'opacity-100'}`}
      >
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Customer Portal</p>
        <h1 className='mt-3 text-3xl font-black uppercase'>Login</h1>
        <p className='mt-2 text-sm text-zinc-400'>Secure access to appointments, invoices, and vehicle records.</p>
        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200'>
            Auth is in setup mode. Add Supabase env keys to activate login.
          </p>
        ) : null}

        <div className='mt-6 space-y-4'>
          <label className='block text-sm'>
            <span className='mb-2 block text-zinc-300'>Email</span>
            <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
          </label>
          <label className='block text-sm'>
            <span className='mb-2 block text-zinc-300'>Password</span>
            <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
          </label>
        </div>

        {error ? (
          <p className='mt-4 text-sm text-red-400' role='alert' aria-live='assertive'>
            {error}
          </p>
        ) : null}

        <button
          type='submit'
          disabled={phase === 'submitting' || phase === 'finishing' || !envReady}
          className='mt-6 w-full rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60'
        >
          {phase === 'submitting' || phase === 'finishing' ? 'Signing in...' : 'Sign In'}
        </button>

        <div className='mt-4 flex items-center justify-between text-xs text-zinc-400'>
          <Link href='/signup' className='hover:text-gold-soft'>
            Create account
          </Link>
          <Link href='/forgot-password' className='hover:text-gold-soft'>
            Forgot password?
          </Link>
        </div>
      </form>
    </main>
  );
}
