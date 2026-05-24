'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function PendingBody() {
  const searchParams = useSearchParams();
  const id = searchParams.get('appointment_id');
  const token = searchParams.get('token');
  const payLater = searchParams.get('pay_later') === '1';

  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto max-w-lg rounded-2xl border border-gold/20 bg-zinc-950 p-8 text-center'>
        <p className='text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Booking received</p>
        <h1 className='mt-3 text-2xl font-black uppercase'>{payLater ? 'Booking saved — pay later' : 'Pending payment'}</h1>
        <p className='mt-4 text-sm text-zinc-300'>
          {payLater
            ? 'Your appointment is confirmed in our system. Gloss Boss ATX will send secure payment instructions separately — no action needed right now.'
            : 'Your appointment is saved. Online deposit checkout is not active yet — Gloss Boss ATX will contact you to confirm and collect the deposit.'}
        </p>
        {id ? (
          <p className='mt-4 break-all font-mono text-[10px] text-zinc-500'>
            Ref: {id}
            {token ? ` · token ${token.slice(0, 8)}…` : null}
          </p>
        ) : null}
        <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center'>
          <Link href='/' className='rounded-lg bg-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-black'>
            Home
          </Link>
          <Link href='/book' className='rounded-lg border border-white/20 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white'>
            Another booking
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function BookPendingPage() {
  return (
    <Suspense
      fallback={
        <main className='flex min-h-screen items-center justify-center bg-background text-zinc-400'>Loading…</main>
      }
    >
      <PendingBody />
    </Suspense>
  );
}
