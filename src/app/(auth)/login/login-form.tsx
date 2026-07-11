'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearAuthUxSession, setRoleCache, writeHydratedOnceFlag } from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { resolveSafePostLoginRedirect, resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { waitForSessionHydration } from '@/lib/auth/waitForSessionHydration';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { humanizeAuthError } from '@/lib/auth/auth-event-log';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

function formatLoginFailure(outcome: { code: string; message?: string; rawRole?: string }): string {
  switch (outcome.code) {
    case 'MISSING_PROFILE':
      return 'Your account signed in, but no staff profile is linked yet. Ask the owner to repair your account from Admin → Team, or open your team invite link.';
    case 'PROFILE_QUERY_ERROR':
      return humanizeAuthError(outcome.message);
    case 'INVALID_ROLE':
      return `Your profile role is invalid (${outcome.rawRole ?? 'unknown'}). Contact your administrator.`;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'finishing'>('idle');
  const [resendBusy, setResendBusy] = useState(false);
  
  const [brand, setBrand] = useState<{
    businessDisplayName: string;
    logoUrl: string | null;
  }>({
    businessDisplayName: 'Gloss Boss ATX',
    logoUrl: '/brand/glossboss-clean-logo.png',
  });

  useEffect(() => {
    fetch('/api/public/brand')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setBrand({
            businessDisplayName: data.businessDisplayName || 'Gloss Boss ATX',
            logoUrl: data.logoUrl || '/brand/glossboss-clean-logo.png',
          });
        }
      })
      .catch((err) => console.warn('Failed to load public brand for login:', err));
  }, []);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    if (/type=recovery/i.test(hash) || /type=invite/i.test(hash)) {
      const target = /type=recovery/i.test(hash) ? '/reset-password' : '/join-team';
      window.location.replace(`${target}${hash}`);
      return;
    }
    const err = searchParams.get('error');
    const n = searchParams.get('notice');
    if (err) setError(humanizeAuthError(err));
    if (n === 'invite_already_accepted') setNotice('This invite was already accepted. Sign in with your staff email.');
    if (n === 'password_already_updated') setNotice('Password already updated. Sign in with your new password.');
    if (n === 'already_confirmed') setNotice('Email already confirmed. Sign in below.');
    if (n === 'signed_in') setNotice('Signed in. Choose your destination after we verify your role.');
  }, [searchParams]);

  useEffect(() => {
    const prefillEmail = searchParams.get('email');
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [searchParams, email]);

  useEffect(() => {
    if (phase !== 'finishing') return;
    const watchdog = window.setTimeout(() => {
      setError('Redirect is taking too long. Try again, or open the site in a fresh tab.');
      setPhase('idle');
    }, 18000);
    return () => clearTimeout(watchdog);
  }, [phase]);

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
        setError(humanizeAuthError(signInError.message));
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
          if (outcome.code !== 'NO_SESSION') {
            await client.auth.signOut();
          }
          setError(formatLoginFailure(outcome));
          setPhase('idle');
          return;
        }

      setRoleCache(outcome.userId, outcome.role);
      writeHydratedOnceFlag();

      const nextRaw = searchParams.get('next');
      const fallback = resolveDashboardPathForRole(outcome.role, null, outcome.email);
      const destination = nextRaw ? resolveSafePostLoginRedirect(outcome.role, nextRaw, outcome.email) : fallback;

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
      setError(humanizeAuthError(msg));
      setPhase('idle');
    }
  };

  const resendConfirmation = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap Resend confirmation.');
      return;
    }
    const client = supabase ?? createSupabaseBrowserClient();
    if (!client) return;
    setResendBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: resendErr } = await client.auth.resend({ type: 'signup', email: email.trim() });
      if (resendErr) setError(humanizeAuthError(resendErr.message));
      else setNotice(`If ${email.trim()} needs confirmation, a new email was sent.`);
    } catch (e) {
      setError(humanizeAuthError(e instanceof Error ? e.message : 'Could not resend.'));
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <main className='relative flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground gb-luxury-page'>
      {/* Background scrims */}
      <div className='pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_45%)]' aria-hidden />

      {phase === 'finishing' ? (
        <div className='pointer-events-none fixed inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]'>
          <div className='flex flex-col items-center gap-3'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold-soft' aria-hidden />
            <p className='text-sm text-zinc-300 font-bold uppercase tracking-wider'>Opening your dashboard…</p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleLogin}
        className={`relative z-[20] w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-lg gb-premium-card transition-opacity duration-300 ${phase === 'finishing' ? 'opacity-40' : 'opacity-100'}`}
      >
        <div className="flex flex-col items-center mb-6">
          <img src={brand.logoUrl || "/brand/glossboss-clean-logo.png"} alt={brand.businessDisplayName} className="h-16 w-auto object-contain filter brightness-110 mb-4" />
          <p className='text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft'>{brand.businessDisplayName}</p>
        </div>

        <h1 className='text-2xl font-black uppercase tracking-tight text-foreground text-center'>Portal Sign In</h1>
        <p className='mt-2 text-xs text-muted-foreground text-center leading-relaxed'>
          Secure workspace access for clients, technicians, and administrators.
        </p>

        {!envReady ? (
          <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200'>
            Auth is in setup mode. Add Supabase env keys to activate login.
          </p>
        ) : null}

        <div className='mt-6 space-y-4'>
          <label className='block text-xs font-bold uppercase text-muted-foreground'>
            <span className='mb-2 block'>Email Address</span>
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='gb-input'
              required
            />
          </label>
          <label className='block text-xs font-bold uppercase text-muted-foreground'>
            <span className='mb-2 block'>Password</span>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='gb-input'
              required
            />
          </label>
        </div>

        {error ? (
          <p className='mt-4 text-xs text-red-400 font-semibold bg-red-950/20 border border-red-500/20 p-2.5 rounded-xl' role='alert' aria-live='assertive'>
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className='mt-4 text-xs text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl'>
            {notice}
          </p>
        ) : null}

        <button
          type='submit'
          disabled={phase === 'submitting' || phase === 'finishing' || !envReady}
          className='mt-6 w-full min-h-11 rounded-2xl bg-gold py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-60 hover:bg-gold-soft transition shadow-[0_0_15px_rgba(212,175,55,0.25)]'
        >
          {phase === 'submitting' || phase === 'finishing' ? 'Signing in...' : 'Sign In'}
        </button>

        <div className='mt-4 flex flex-col gap-2 text-xs text-muted-foreground'>
          <button
            type='button'
            disabled={resendBusy || !envReady}
            onClick={() => void resendConfirmation()}
            className='min-h-11 rounded-xl border border-border px-3 py-2 font-semibold hover:border-gold/30 hover:text-gold-soft disabled:opacity-50'
          >
            {resendBusy ? 'Sending…' : 'Resend confirmation email'}
          </button>
          <Link href='/join-team' className='min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 font-semibold hover:border-gold/30 hover:text-gold-soft'>
            Accept team invite
          </Link>
        </div>

        <div className='mt-6 flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4'>
          <Link href='/signup' className='hover:text-gold-soft font-semibold'>
            Create account
          </Link>
          <Link href='/forgot-password' className='hover:text-gold-soft font-semibold'>
            Forgot password?
          </Link>
        </div>
      </form>
    </main>
  );
}
