'use client';

import { useEffect } from 'react';

export default function SegmentError({
  error,
  reset,
  title = 'Something went wrong',
  homeHref = '/',
  homeLabel = 'Home',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.warn('[segment/error]', error.message, error.digest);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Error</p>
      <h1 className="mt-3 text-2xl font-black uppercase text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Your session is safe. Try again or return to {homeLabel.toLowerCase()}.
        {error.digest ? ` · Ref ${error.digest}` : ''}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-black"
        >
          Try again
        </button>
        <a
          href={homeHref}
          className="rounded-lg border border-border px-5 py-3 text-xs font-bold uppercase tracking-wider text-foreground"
        >
          {homeLabel}
        </a>
      </div>
    </main>
  );
}
