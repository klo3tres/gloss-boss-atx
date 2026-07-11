'use client';

import { Suspense } from 'react';
import CompleteContent from './complete-content';

/** Post-checkout signing — same flow as /agreement with deposit-complete framing. */
export default function BookCompletePage() {
  return (
    <main className='relative min-h-screen overflow-x-hidden bg-zinc-950 text-foreground'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.12),_transparent_55%),linear-gradient(180deg,#09090b_0%,#0c0a09_45%,#09090b_100%)]'
      />
      <div className='relative mx-auto max-w-lg px-4 pb-16 pt-10 sm:px-6 sm:pt-14'>
        <div className='mb-8 flex flex-col items-center text-center'>
          <img
            src='/brand/glossboss-clean-logo.png'
            alt='Gloss Boss ATX'
            className='h-14 w-auto object-contain brightness-110 sm:h-16'
          />
          <p className='mt-4 text-[11px] font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss ATX</p>
          <p className='mt-1 text-xs text-zinc-500'>Deposit received · Complete your acknowledgment</p>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_60px_rgba(212,175,55,0.08)] backdrop-blur-sm sm:p-7'>
          <Suspense fallback={<p className='py-12 text-center text-sm text-zinc-400'>Loading…</p>}>
            <CompleteContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
