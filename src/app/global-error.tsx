'use client';

import './globals.css';

/**
 * Replaces the entire root layout when active — must import globals.css here
 * or this tree has no Tailwind (Next.js global-error contract).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>Gloss Boss ATX — error</title>
      </head>
      <body className='min-h-screen bg-background font-sans text-foreground antialiased'>
        <div className='flex min-h-screen items-center justify-center px-4 py-16'>
          <div className='w-full max-w-md rounded-2xl border border-amber-500/40 bg-zinc-950 p-8 shadow-[0_0_40px_rgba(212,166,77,0.12)]'>
            <p className='text-xs font-bold uppercase tracking-[0.22em] text-gold-soft'>Gloss Boss ATX</p>
            <h1 className='mt-3 text-2xl font-black uppercase tracking-wide text-white'>Critical error</h1>
            <p className='mt-3 text-sm leading-relaxed text-zinc-400'>{error.message}</p>
            <div className='mt-8 flex flex-wrap gap-3'>
              <button
                type='button'
                onClick={() => reset()}
                className='rounded-lg bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'
              >
                Try again
              </button>
              <button
                type='button'
                onClick={() => {
                  window.location.href = '/';
                }}
                className='rounded-lg border border-gold/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gold-soft'
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
