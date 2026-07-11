'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { humanizeAuthError } from '@/lib/auth/auth-event-log';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type InviteInfo = {
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  roleLabel: string;
};

function JoinTeamInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const notice = searchParams.get('notice');
  const queryError = searchParams.get('error');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (notice === 'complete_setup') {
      setBanner('Your invite email opened successfully. Paste your invite link with ?token=… or ask admin to resend / copy the team invite link.');
    }
    if (queryError === 'expired') {
      setError('This invite has expired. Ask your administrator to resend it.');
    }
  }, [notice, queryError]);

  useEffect(() => {
    if (!token) {
      if (!queryError && notice !== 'complete_setup') {
        setError('Missing invite token. Open the full invite link from your email or SMS, or ask admin for a copy-link.');
      }
      return;
    }
    void fetch(`/api/join-team/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; invite?: InviteInfo; error?: string }) => {
        if (!d.ok || !d.invite) {
          const raw = d.error ?? 'Invalid invite';
          if (/expired/i.test(raw)) {
            setError('This invite has expired. Ask your administrator to resend it.');
          } else if (/accepted|already/i.test(raw)) {
            setError('This invite was already accepted. Sign in instead.');
          } else if (/revoked/i.test(raw)) {
            setError('This invite was revoked. Contact your administrator.');
          } else {
            setError(humanizeAuthError(raw));
          }
        } else {
          setInvite(d.invite);
          void fetch('/api/auth/log-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventType: 'invite_opened', meta: { role: d.invite.role } }),
          }).catch(() => undefined);
        }
      })
      .catch(() => setError('Could not validate invite.'));
  }, [token, queryError, notice]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const email = String(fd.get('email') ?? '');
      const password = String(fd.get('password') ?? '');

      if (mode === 'link') {
        const client = createSupabaseBrowserClient();
        if (!client) {
          setError('Auth client unavailable.');
          return;
        }
        const { error: signErr } = await client.auth.signInWithPassword({ email, password });
        if (signErr) {
          setError(humanizeAuthError(signErr.message));
          return;
        }
      }

      const res = await fetch('/api/join-team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          mode,
          fullName: fd.get('fullName'),
          email,
          phone: fd.get('phone'),
          password: mode === 'create' ? password : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirect?: string };
      if (!data.ok) {
        setError(humanizeAuthError(data.error ?? 'Setup failed'));
        return;
      }

      if (mode === 'create') {
        const client = createSupabaseBrowserClient();
        if (!client) {
          setError('Auth client unavailable.');
          return;
        }
        const { error: signErr } = await client.auth.signInWithPassword({ email, password });
        if (signErr) {
          setError(humanizeAuthError(`Account created but sign-in failed: ${signErr.message}`));
          return;
        }
      }

      router.push(data.redirect ?? '/tech');
      router.refresh();
    });
  };

  if (error && !invite) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center px-4 py-16 pb-[max(4rem,env(safe-area-inset-bottom))]">
        <div className="w-full space-y-4 rounded-2xl border border-rose-500/30 bg-card p-6 text-center">
          <p className="text-sm text-rose-400">{error}</p>
          {banner ? <p className="text-xs text-muted-foreground">{banner}</p> : null}
          <div className="flex flex-col gap-2">
            <Link href="/login" className="min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-xs font-semibold">
              Back to login
            </Link>
            <Link href="/forgot-password" className="min-h-11 inline-flex items-center justify-center rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black">
              Forgot password
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center px-4 py-16">
        <div className="w-full space-y-3 text-center">
          {banner ? <p className="text-sm text-amber-800 dark:text-amber-200">{banner}</p> : null}
          <p className="text-sm text-muted-foreground">{token ? 'Validating invite…' : 'Waiting for invite token…'}</p>
          {!token ? (
            <Link href="/login" className="inline-flex min-h-11 items-center justify-center text-xs font-semibold text-gold-soft">
              Back to login
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-16 pb-[max(4rem,env(safe-area-inset-bottom))]">
      <div className="rounded-2xl border border-gold/25 bg-card p-6">
        <img src="/brand/glossboss-clean-logo.png" alt="Gloss Boss ATX" className="mx-auto h-12 w-auto object-contain" />
        <h1 className="mt-4 text-center text-xl font-black uppercase text-foreground">Join the team</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          You&apos;re invited as <strong className="text-gold-soft">{invite.roleLabel}</strong>
          {invite.email ? (
            <>
              {' '}
              · <span className="text-foreground">{invite.email}</span>
            </>
          ) : null}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`min-h-11 flex-1 rounded-lg border px-3 py-2 text-[10px] font-black uppercase ${mode === 'create' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-border text-muted-foreground'}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={`min-h-11 flex-1 rounded-lg border px-3 py-2 text-[10px] font-black uppercase ${mode === 'link' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-border text-muted-foreground'}`}
          >
            Sign in & link
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Full name
            <input name="fullName" autoComplete="name" required defaultValue={invite.fullName} className="mt-1 w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Email
            <input name="email" type="email" autoComplete="email" required defaultValue={invite.email ?? ''} className="mt-1 w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Phone
            <input name="phone" type="tel" autoComplete="tel" defaultValue={invite.phone ?? ''} className="mt-1 w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Password
            <input name="password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required minLength={8} className="mt-1 w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          {error ? <p className="text-xs text-rose-400" role="alert">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full min-h-11 rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50"
          >
            {pending ? 'Setting up…' : 'Complete setup'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function JoinTeamPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</main>}>
      <JoinTeamInner />
    </Suspense>
  );
}
