'use client';

import { Suspense } from 'react';
import CompleteContent from '@/app/book/complete/complete-content';

/** Post-Stripe agreement signing (canonical URL after checkout). */
export default function AgreementPage() {
  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl'>
        <h1 className='text-3xl font-black uppercase'>Sign agreement</h1>
        <p className='mt-2 text-sm text-zinc-400'>Review and sign below to confirm your service details.</p>
        <div className='mt-8 rounded-2xl border border-gold/20 bg-zinc-950 p-6'>
          <Suspense fallback={<p className='text-zinc-400'>Loading…</p>}>
            <CompleteContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
