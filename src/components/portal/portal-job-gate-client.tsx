'use client';

import Link from 'next/link';
import { Calendar, LogIn, UserPlus } from 'lucide-react';

export function PortalJobGateClient({
  guestName,
  guestEmail,
  whenLabel,
  service,
  portalPath,
  expired,
}: {
  guestName: string;
  guestEmail: string;
  whenLabel: string;
  service: string;
  portalPath: string;
  expired: boolean;
}) {
  const loginHref = `/login?${new URLSearchParams({
    next: portalPath,
    ...(guestEmail ? { email: guestEmail } : {}),
  }).toString()}`;
  const signupHref = `/signup?${new URLSearchParams({
    next: portalPath,
    ...(guestEmail ? { email: guestEmail } : {}),
  }).toString()}`;

  return (
    <main className="gb-luxury-page min-h-screen px-4 py-20 text-foreground sm:px-6">
      <div className="mx-auto max-w-lg space-y-6">
        <section className="gb-premium-hero rounded-3xl px-6 py-8 text-center sm:px-10">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-gold-soft">Gloss Boss ATX</p>
          <h1 className="gb-display-serif mt-3 text-3xl font-black text-white sm:text-4xl">Your appointment portal</h1>
          <p className="mt-3 text-sm text-zinc-300">Hi {guestName}, your detail is confirmed.</p>
        </section>

        {expired ? (
          <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100">
            This secure link has expired. Contact Gloss Boss ATX and we will send a fresh portal link.
          </p>
        ) : null}

        <section className="gb-glass rounded-3xl border border-gold/20 p-6">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-gold-soft" />
            <div>
              <p className="text-sm font-bold text-white">{whenLabel}</p>
              <p className="mt-1 text-xs text-zinc-400">{service}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-300">
            Create an account or sign in to view your appointment, live status updates, before/after photos, loyalty rewards, and referral link.
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-4 text-sm font-black uppercase text-black"
          >
            <UserPlus className="h-4 w-4" />
            Create account
          </Link>
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold/40 px-6 py-4 text-sm font-black uppercase text-gold-soft"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </div>

        <p className="text-center text-[11px] text-zinc-500">
          Use {guestEmail || 'the email on your booking'} to link this appointment to your account — no duplicate profiles.
        </p>
      </div>
    </main>
  );
}
