'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CustomerBookingLifecycle } from '@/components/booking/customer-booking-lifecycle';
import { SocialLinksRow } from '@/components/marketing/social-links';

type VehicleView = {
  description: string;
  serviceSlug: string;
  vehicleClass: string;
  priceCents: number;
  addOns: Array<{ label: string; priceCents: number }>;
};

type Summary = {
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  scheduledStart: string;
  serviceAddress: string;
  vehicles: VehicleView[];
  promoCode: string | null;
  finalTotalCents: number;
  depositCents: number;
  depositPaidCents: number;
  balanceDueCents: number;
  paymentStatus: string;
  onlineDiscountCents: number;
  multiCarDiscountCents: number;
  promoDiscountCents: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function chicago(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
}

function googleCalendarHref(summary: Summary) {
  const start = new Date(summary.scheduledStart);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const title = encodeURIComponent('Gloss Boss ATX — Mobile Detail');
  const details = encodeURIComponent(`Booking ${summary.bookingNumber} · ${summary.guestPhone}`);
  const location = encodeURIComponent(summary.serviceAddress || 'Mobile service');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
}

function ConfirmationInner() {
  const sp = useSearchParams();
  const appointmentId = sp.get('appointment_id') ?? sp.get('appointmentId') ?? '';
  const token = sp.get('token') ?? '';
  const sessionId = sp.get('session_id') ?? '';

  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState({ instagramUrl: '', facebookUrl: '', tiktokUrl: '', youtubeUrl: '' });

  useEffect(() => {
    fetch('/api/public/site-data', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.socialLinks) setSocialLinks(d.socialLinks);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!appointmentId || !token) {
      setError('Missing booking reference. Check your email for a confirmation link.');
      return;
    }
    void fetch(
      `/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
    )
      .then(async (r) => {
        const j = (await r.json()) as Summary & { ok?: boolean; error?: string };
        if (!r.ok || !(j as { ok?: boolean }).ok) throw new Error(j.error ?? 'Could not load booking');
        const { ok: _ok, error: _e, ...rest } = j;
        setSummary(rest as Summary);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [appointmentId, token]);

  if (error) {
    return (
      <p className='rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200'>{error}</p>
    );
  }

  if (!summary) {
    return <p className='text-zinc-400'>Loading your confirmation…</p>;
  }

  const paidDeposit = summary.depositPaidCents > 0 || summary.paymentStatus.includes('deposit');
  const signHref = `/book/complete?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`;

  const calHref = googleCalendarHref(summary);
  const icsHref = appointmentId ? `/api/calendar/appointment/${appointmentId}` : '';

  return (
    <div className='space-y-6'>
      <section className='gb-premium-hero rounded-3xl px-6 py-8 text-center sm:px-10'>
        <p className='text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='gb-display-serif mt-3 text-3xl font-black text-white sm:text-5xl'>You&apos;re booked</h1>
        <p className='mt-2 text-sm text-zinc-400'>Ref {summary.bookingNumber}</p>
        <p className='mt-4 text-xl font-bold text-white'>{chicago(summary.scheduledStart)}</p>
        <p className='mt-2 text-sm text-zinc-300'>{summary.serviceAddress || 'Mobile service at your address'}</p>
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          {calHref ? (
            <a
              href={calHref}
              target='_blank'
              rel='noreferrer'
              className='inline-flex rounded-2xl border border-gold/40 bg-gold/10 px-6 py-3 text-xs font-black uppercase text-gold-soft'
            >
              Add to Google Calendar
            </a>
          ) : null}
          {icsHref ? (
            <a
              href={icsHref}
              className='inline-flex rounded-2xl border border-white/20 px-6 py-3 text-xs font-black uppercase text-zinc-200'
            >
              Download .ics
            </a>
          ) : null}
        </div>
      </section>

      <section className='gb-glass rounded-3xl border border-gold/20 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Your detail</h2>
        <ul className='mt-4 space-y-3'>
          {summary.vehicles.map((v, i) => (
            <li key={i} className='rounded-2xl border border-white/10 bg-black/40 p-4'>
              <p className='font-bold text-white'>{v.description}</p>
              <p className='text-xs text-zinc-500'>
                {v.serviceSlug.replace(/-/g, ' ')} · {v.vehicleClass}
                {v.priceCents > 0 ? ` · ${money(v.priceCents)}` : ''}
              </p>
              {v.addOns.length > 0 ? (
                <p className='mt-2 text-xs text-zinc-400'>{v.addOns.map((a) => a.label).join(' · ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
        <dl className='mt-6 space-y-2 border-t border-white/10 pt-4 text-sm'>
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Total</dt>
            <dd className='font-bold text-white'>{money(summary.finalTotalCents)}</dd>
          </div>
          {summary.promoCode ? (
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-400'>Promo</dt>
              <dd className='text-gold-soft'>{summary.promoCode}</dd>
            </div>
          ) : null}
          {summary.onlineDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Online discount</dt>
              <dd>−{money(summary.onlineDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.multiCarDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Multi-car discount</dt>
              <dd>−{money(summary.multiCarDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.promoDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Promo savings</dt>
              <dd>−{money(summary.promoDiscountCents)}</dd>
            </div>
          ) : null}
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Deposit</dt>
            <dd className='text-white'>{money(summary.depositCents)}</dd>
          </div>
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Deposit paid</dt>
            <dd className={paidDeposit ? 'text-emerald-300' : 'text-amber-200'}>
              {paidDeposit ? money(summary.depositPaidCents || summary.depositCents) : 'Pending'}
            </dd>
          </div>
          <div className='flex justify-between gap-4 border-t border-white/10 pt-2'>
            <dt className='text-zinc-400'>Balance due</dt>
            <dd className='font-bold text-gold-soft'>{money(summary.balanceDueCents)}</dd>
          </div>
        </dl>
      </section>

      {appointmentId && token ? <CustomerBookingLifecycle appointmentId={appointmentId} token={token} /> : null}

      <section className='rounded-2xl border border-white/10 bg-black/50 p-5 text-sm text-zinc-300'>
        <p className='font-black uppercase tracking-wider text-gold-soft'>Next steps</p>
        <ol className='mt-3 space-y-2'>
          <li>1 — Sign your service agreement (required)</li>
          <li>2 — Watch for confirmation email & receipt</li>
          <li>3 — Water & power access ready at arrival</li>
          <li>4 — Track live updates in your dashboard</li>
        </ol>
      </section>

      <div className='grid gap-3 sm:grid-cols-2'>
        <Link href={signHref} className='rounded-2xl bg-gold px-6 py-4 text-center text-sm font-black uppercase text-black shadow-[0_0_32px_rgba(212,175,55,0.35)]'>
          Sign agreement now
        </Link>
        <Link
          href={`/portal/job?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`}
          className='rounded-2xl border border-gold/40 px-6 py-4 text-center text-sm font-black uppercase text-gold-soft'
        >
          Open customer portal
        </Link>
        <Link
          href={`/signup?email=${encodeURIComponent(summary.guestEmail)}&next=${encodeURIComponent(`/portal/job?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`)}`}
          className='rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-black uppercase text-zinc-300'
        >
          Create your account
        </Link>
        <Link
          href={`/login?email=${encodeURIComponent(summary.guestEmail)}&next=${encodeURIComponent(`/portal/job?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`)}`}
          className='rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-black uppercase text-zinc-300 sm:col-span-2'
        >
          Sign in to view in dashboard
        </Link>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Follow Gloss Boss ATX</p>
        <SocialLinksRow links={socialLinks} className="mt-3 justify-center" />
      </div>
    </div>
  );
}

export default function BookConfirmationPage() {
  return (
    <main className='gb-luxury-page min-h-screen px-4 py-20 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl'>
        <Suspense fallback={<p className='text-zinc-400'>Loading…</p>}>
          <ConfirmationInner />
        </Suspense>
      </div>
    </main>
  );
}
