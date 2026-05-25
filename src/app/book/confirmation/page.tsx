'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

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

function ConfirmationInner() {
  const sp = useSearchParams();
  const appointmentId = sp.get('appointment_id') ?? sp.get('appointmentId') ?? '';
  const token = sp.get('token') ?? '';
  const sessionId = sp.get('session_id') ?? '';

  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className='space-y-8'>
      <div>
        <p className='text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='gb-display-serif mt-3 text-3xl font-black text-white sm:text-4xl'>Booking confirmed</h1>
        <p className='mt-2 text-sm text-zinc-400'>Reference {summary.bookingNumber}</p>
      </div>

      <section className='gb-glass rounded-3xl border border-gold/25 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Appointment</h2>
        <p className='mt-3 text-xl font-bold text-white'>{chicago(summary.scheduledStart)}</p>
        <p className='mt-2 text-sm text-zinc-300'>{summary.serviceAddress || 'Mobile service at your address'}</p>
        <p className='mt-4 text-sm text-zinc-400'>
          {summary.guestName} · {summary.guestEmail} · {summary.guestPhone}
        </p>
      </section>

      <section className='gb-glass rounded-3xl border border-white/10 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Vehicles & services</h2>
        <ul className='mt-4 space-y-4'>
          {summary.vehicles.map((v, i) => (
            <li key={i} className='rounded-2xl border border-white/10 bg-black/40 p-4'>
              <p className='font-bold text-white'>{v.description}</p>
              <p className='text-xs text-zinc-500'>
                {v.serviceSlug.replace(/-/g, ' ')} · {v.vehicleClass}
              </p>
              {v.priceCents > 0 ? <p className='mt-2 text-sm text-gold-soft'>{money(v.priceCents)}</p> : null}
              {v.addOns.length > 0 ? (
                <ul className='mt-2 space-y-1 text-xs text-zinc-400'>
                  {v.addOns.map((a, j) => (
                    <li key={j}>
                      + {a.label} {a.priceCents > 0 ? money(a.priceCents) : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='gb-glass rounded-3xl border border-white/10 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Payment</h2>
        <dl className='mt-4 space-y-2 text-sm'>
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

      <section className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-relaxed text-amber-100'>
        <p className='font-bold text-amber-50'>Before we arrive</p>
        <ul className='mt-2 list-inside list-disc space-y-1 text-amber-100/90'>
          <li>Ensure water and power access at the service location.</li>
          <li>Clear space around each vehicle where possible.</li>
          <li>Gate codes and parking details help us arrive on time.</li>
        </ul>
      </section>

      <section className='gb-glass rounded-2xl border border-white/10 p-5 text-sm text-zinc-300'>
        <p className='font-bold text-white'>What happens next</p>
        <ol className='mt-2 list-inside list-decimal space-y-1'>
          <li>Confirmation email with receipt details (when payment processes).</li>
          <li>Sign your service agreement (required before your appointment).</li>
          <li>We arrive at your scheduled time — track updates in your dashboard.</li>
          <li>Pay any remaining balance after service if applicable.</li>
        </ol>
      </section>

      <div className='flex flex-wrap gap-3'>
        <Link href={signHref} className='rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase text-black'>
          Sign agreement
        </Link>
        <Link href='/signup' className='rounded-xl border border-gold/40 px-6 py-3 text-xs font-black uppercase text-gold-soft'>
          Create account
        </Link>
        <Link href='/login' className='rounded-xl border border-white/15 px-6 py-3 text-xs font-bold uppercase text-zinc-300'>
          Claim booking in dashboard
        </Link>
        <a
          href='mailto:info@glossbossatx.com'
          className='rounded-xl border border-white/15 px-6 py-3 text-xs font-bold uppercase text-zinc-300'
        >
          Contact Gloss Boss ATX
        </a>
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
