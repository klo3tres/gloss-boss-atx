'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';
import { clearAuthUxSession, setRoleCache, writeHydratedOnceFlag } from '@/lib/auth/auth-session-ux';
import { signupConfirmRedirectUrl } from '@/lib/auth/action-link-registry';
import { humanizeAuthError } from '@/lib/auth/auth-event-log';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { getSafeInternalRedirect } from '@/lib/auth/safe-redirect';
import { resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { SMS_CONSENT_COPY } from '@/lib/sms-consent';
import { waitForSessionHydration } from '@/lib/auth/waitForSessionHydration';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

export default function SignupForm() {
  const envReady = isSupabasePublicReady();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'finishing'>('idle');
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    const prefillEmail = searchParams.get('email');
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [searchParams, email]);

  const resendConfirmation = async () => {
    setError(null);
    setInfoMessage(null);
    const client = supabase ?? createSupabaseBrowserClient();
    if (!client || !email.trim()) {
      setError('Enter the email you used to sign up, then try Resend.');
      return;
    }
    setResendBusy(true);
    try {
      const emailRedirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}&type=signup`
          : signupConfirmRedirectUrl();
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo },
      });
      if (resendError) {
        setError(humanizeAuthError(resendError.message));
        return;
      }
      const masked = email.trim().replace(/(.{2}).+(@.+)/, '$1***$2');
      setInfoMessage(`Confirmation email requested for ${masked}. Check inbox and spam.`);
    } catch (e) {
      setError(humanizeAuthError(e instanceof Error ? e.message : 'Could not resend confirmation.'));
    } finally {
      setResendBusy(false);
    }
  };

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!envReady) {
      setError('Supabase keys are not configured yet. Add them in .env.local to enable signup.');
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

      const emailRedirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}&type=signup`
          : signupConfirmRedirectUrl();

      const { data, error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name: fullName,
            sms_consent: smsConsent,
            sms_consent_source: 'account_signup',
            sms_status: smsConsent ? 'opted_in' : 'opted_out',
          },
        },
      });

      if (signUpError) {
        setError(humanizeAuthError(signUpError.message));
        setPhase('idle');
        return;
      }

      if (!data.session?.user) {
        const masked = email.trim().replace(/(.{2}).+(@.+)/, '$1***$2');
        setInfoMessage(
          `If confirmation is required, we asked Supabase to email ${masked}. Use Resend if nothing arrives within a few minutes.`,
        );
        setPhase('idle');
        return;
      }

      setPhase('finishing');
      await waitForSessionHydration(client);

      try {
        await fetchWithTimeout('/api/auth/ensure-profile', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          timeoutMs: 8000,
        });
      } catch {
        /* continue */
      }

      const outcome = await fetchUserRole(client);
      if (!outcome.ok) {
        clearAuthUxSession();
        await client.auth.signOut();
        if (outcome.code === 'MISSING_PROFILE') {
          setError('Profile not found — contact admin. If you just signed up, wait a moment and try signing in again.');
        } else if (outcome.code === 'PROFILE_QUERY_ERROR') {
          setError(humanizeAuthError(outcome.message ?? 'Could not load your profile.'));
        } else if (outcome.code === 'INVALID_ROLE') {
          setError('Your profile role is invalid. Contact admin.');
        } else {
          setError('Could not complete signup session. Please sign in manually.');
        }
        setPhase('idle');
        return;
      }

      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user?.id) {
        clearAuthUxSession();
        setError('Could not read your session after signup. Please sign in.');
        setPhase('idle');
        return;
      }

      setRoleCache(user.id, outcome.role);
      writeHydratedOnceFlag();

      const nextRaw = searchParams.get('next');
      const fallback = resolveDashboardPathForRole(outcome.role, null, outcome.email);
      const destination = nextRaw ? getSafeInternalRedirect(nextRaw, fallback) : fallback;

      if (typeof window !== 'undefined') {
        window.location.assign(destination);
      } else {
        router.push(destination);
        router.refresh();
      }
      setPhase('idle');
    } catch (e) {
      setError(humanizeAuthError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'));
      setPhase('idle');
    }
  };

  const loginHref = `/login${searchParams.get('next') ? `?next=${encodeURIComponent(searchParams.get('next')!)}${searchParams.get('email') ? `&email=${encodeURIComponent(searchParams.get('email')!)}` : ''}` : ''}`;

  return (
    <SafeRenderBoundary label="Create account">
      <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-28 text-foreground">
        {phase === 'finishing' ? (
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold-soft" aria-hidden />
              <p className="text-sm text-zinc-300">Opening your dashboard…</p>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={handleSignup}
          className={`relative z-[20] w-full max-w-md rounded-2xl border border-gold/20 bg-card p-6 shadow-lg transition-opacity ${phase === 'finishing' ? 'opacity-40' : 'opacity-100'}`}
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Gloss Boss ATX</p>
          <h1 className="mt-3 text-3xl font-black uppercase">Create Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Link your booking and view appointments, photos, and rewards.</p>
          {!envReady ? (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              Auth is in setup mode. Add Supabase env keys to activate account creation.
            </p>
          ) : null}

          <div className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-2 block text-muted-foreground">Full name</span>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-muted-foreground">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-muted-foreground">Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="gb-input w-full min-h-11 rounded-lg border border-border bg-input px-4 py-3"
                required
              />
            </label>
            <fieldset className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <legend className="px-1 text-xs font-black uppercase tracking-wider text-gold-soft">Optional SMS updates</legend>
              <p className="text-xs leading-relaxed text-muted-foreground">{SMS_CONSENT_COPY}</p>
              <div className="mt-3 grid gap-2">
                <label className="rounded-lg border border-border px-3 py-3 text-xs font-semibold text-foreground">
                  <input type="radio" name="smsConsent" checked={smsConsent} onChange={() => setSmsConsent(true)} className="mr-2 accent-[var(--gold)]" />
                  Yes, I agree to receive SMS updates.
                </label>
                <label className="rounded-lg border border-border px-3 py-3 text-xs font-semibold text-foreground">
                  <input type="radio" name="smsConsent" checked={!smsConsent} onChange={() => setSmsConsent(false)} className="mr-2 accent-[var(--gold)]" />
                  No, do not send me SMS updates.
                </label>
              </div>
            </fieldset>
          </div>

          {error ? <p className="mt-4 text-sm text-red-400" role="alert">{error}</p> : null}
          {infoMessage ? <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{infoMessage}</p> : null}

          <button
            type="submit"
            disabled={phase === 'submitting' || phase === 'finishing' || !envReady}
            className="mt-6 w-full min-h-11 rounded-lg bg-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60"
          >
            {phase === 'submitting' || phase === 'finishing' ? 'Creating account...' : 'Create Account'}
          </button>

          <button
            type="button"
            disabled={resendBusy || !envReady}
            onClick={() => void resendConfirmation()}
            className="mt-3 w-full min-h-11 rounded-lg border border-border px-4 py-3 text-xs font-semibold text-muted-foreground hover:border-gold/30 hover:text-gold-soft disabled:opacity-50"
          >
            {resendBusy ? 'Sending…' : 'Resend confirmation email'}
          </button>

          <p className="mt-4 text-center text-xs text-zinc-400">
            Already have an account?{' '}
            <Link href={loginHref} className="text-gold-soft">
              Sign in
            </Link>
          </p>
        </form>
      </main>
    </SafeRenderBoundary>
  );
}
