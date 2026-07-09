'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setError('Missing invite token.');
      return;
    }
    void fetch(`/api/join-team/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; invite?: InviteInfo; error?: string }) => {
        if (!d.ok || !d.invite) setError(d.error ?? 'Invalid invite');
        else setInvite(d.invite);
      })
      .catch(() => setError('Could not validate invite.'));
  }, [token]);

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
          setError(signErr.message);
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
        setError(data.error ?? 'Setup failed');
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
          setError(`Account created but sign-in failed: ${signErr.message}`);
          return;
        }
      }

      router.push(data.redirect ?? '/tech');
      router.refresh();
    });
  };

  if (error && !invite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-16">
        <div className="w-full rounded-2xl border border-rose-500/30 bg-card p-6 text-center">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-16">
        <p className="text-sm text-muted-foreground">Validating invite…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-gold/25 bg-card p-6">
        <img src="/brand/glossboss-clean-logo.png" alt="Gloss Boss ATX" className="mx-auto h-12 w-auto object-contain" />
        <h1 className="mt-4 text-center text-xl font-black uppercase text-foreground">Join the team</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          You&apos;re invited as <strong className="text-gold-soft">{invite.roleLabel}</strong>
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-black uppercase ${mode === 'create' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-border text-muted-foreground'}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-black uppercase ${mode === 'link' ? 'border-gold bg-gold/10 text-gold-soft' : 'border-border text-muted-foreground'}`}
          >
            Sign in & link
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Full name
            <input name="fullName" required defaultValue={invite.fullName} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Email
            <input name="email" type="email" required defaultValue={invite.email ?? ''} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Phone
            <input name="phone" type="tel" defaultValue={invite.phone ?? ''} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Password
            <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </label>
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50"
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
