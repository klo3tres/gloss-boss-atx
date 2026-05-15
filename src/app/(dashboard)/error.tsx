'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.warn('[dashboard/error]', error.message);
  }, [error]);

  return (
    <main className='flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center'>
      <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Dashboard</p>
      <h1 className='mt-3 text-2xl font-black uppercase text-white'>Something went wrong</h1>
      <p className='mt-2 max-w-md text-sm text-zinc-400'>Your session is safe. Try again or return to the home page.</p>
      <div className='mt-6 flex flex-wrap justify-center gap-3'>
        <button
          type='button'
          onClick={() => reset()}
          className='rounded-lg bg-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-black'
        >
          Try again
        </button>
        <a href='/' className='rounded-lg border border-white/20 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white'>
          Home
        </a>
      </div>
    </main>
  );
}
