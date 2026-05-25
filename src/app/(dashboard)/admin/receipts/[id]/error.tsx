'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ReceiptDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[admin/receipts] render error', error.message, error.digest);
  }, [error]);

  return (
    <div className='mx-auto max-w-lg rounded-2xl border border-red-500/40 bg-red-950/40 p-6'>
      <p className='text-xs font-black uppercase tracking-widest text-red-300'>Receipt could not load</p>
      <p className='mt-2 text-sm text-zinc-200'>This page hit a server error. Check admin logs for the exact message.</p>
      <pre className='mt-4 max-h-40 overflow-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-red-100'>{error.message}</pre>
      {error.digest ? <p className='mt-2 font-mono text-[10px] text-zinc-500'>Digest: {error.digest}</p> : null}
      <div className='mt-4 flex flex-wrap gap-2'>
        <button type='button' onClick={() => reset()} className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
          Retry
        </button>
        <Link href='/admin/receipts' className='rounded-xl border border-white/20 px-4 py-2 text-xs font-black uppercase text-zinc-200'>
          All receipts
        </Link>
      </div>
    </div>
  );
}
