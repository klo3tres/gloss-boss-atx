'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function ConfirmedInner() {
  const sp = useSearchParams();
  const appointmentId = sp.get('appointment_id') ?? sp.get('appointmentId') ?? '';
  const token = sp.get('token') ?? '';
  const bookingRef = appointmentId ? appointmentId.slice(0, 8).toUpperCase() : '—';

  return (
    <div className='space-y-6'>
      <p className='rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-200'>
        Booking confirmed
      </p>
      <h1 className='gb-display-serif text-3xl font-black text-white sm:text-4xl'>You&apos;re on the schedule</h1>
      <p className='text-sm leading-relaxed text-zinc-400'>
        Thank you for choosing Gloss Boss ATX. Your appointment is reserved and our team has been notified.
      </p>
      <div className='gb-glass rounded-2xl border border-gold/25 p-5'>
        <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Booking reference</p>
        <p className='mt-2 font-mono text-lg text-white'>{bookingRef}</p>
        <ul className='mt-4 space-y-2 text-sm text-zinc-300'>
          <li>Confirmation email sent when payment is processed.</li>
          <li>Please ensure water and power access at your service location.</li>
          <li>We may reach out if gate codes or parking details are needed.</li>
        </ul>
      </div>
      <div className='flex flex-wrap gap-3'>
        {token && appointmentId ? (
          <Link
            href={`/book/complete?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`}
            className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'
          >
            Sign service agreement
          </Link>
        ) : null}
        <Link href='/dashboard' className='rounded-xl border border-gold/40 px-5 py-3 text-xs font-black uppercase text-gold-soft'>
          Customer dashboard
        </Link>
        <a href='mailto:info@glossbossatx.com' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-bold uppercase text-zinc-300'>
          Contact Gloss Boss ATX
        </a>
      </div>
    </div>
  );
}

export default function BookConfirmedPage() {
  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl'>
        <Suspense fallback={<p className='text-zinc-400'>Loading confirmation…</p>}>
          <ConfirmedInner />
        </Suspense>
      </div>
    </main>
  );
}
