'use client';

import './globals.css';
import Link from 'next/link';
import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[STABILITY_DEBUG_RUNTIME]', 'app_error_boundary', { message: error.message, digest: error.digest });
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div
      className='flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center text-foreground'
      style={{ backgroundColor: '#000000', color: '#ffffff' }}
    >
      <div className='max-w-md'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-4 text-2xl font-black uppercase'>Something broke</h1>
        <p className='mt-4 text-sm text-zinc-400'>
          This view hit an unexpected error. Try again, or return home. Check the browser console if it keeps happening.
        </p>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <button type='button' onClick={() => reset()} className='rounded-lg bg-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black'>
            Try again
          </button>
          <Link href='/' className='rounded-lg border border-white/20 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white'>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
