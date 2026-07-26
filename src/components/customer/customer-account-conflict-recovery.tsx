'use client';

import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function CustomerAccountConflictRecovery({
  message,
  bookingPath,
  compact = false,
  title = 'This booking is safe, but it is not linked to this login',
}: {
  message: string;
  bookingPath?: string;
  compact?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState<'guest' | 'login' | null>(null);
  const next = bookingPath || '/dashboard';
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  const leaveCurrentAccount = async (destination: string, mode: 'guest' | 'login') => {
    setBusy(mode);
    const client = createSupabaseBrowserClient();
    await client?.auth.signOut();
    window.location.assign(destination);
  };

  return (
    <section
      className={`rounded-2xl border border-amber-400/35 bg-amber-400/10 ${compact ? 'p-4' : 'p-6'}`}
      role='alert'
    >
      <p className='text-xs font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200'>Account needs attention</p>
      <h2 className={`${compact ? 'mt-2 text-lg' : 'mt-3 text-2xl'} font-black text-foreground`}>
        {title}
      </h2>
      <p className='mt-2 text-sm leading-6 text-muted-foreground'>{message}</p>
      <div className={`mt-5 grid gap-3 ${bookingPath ? 'sm:grid-cols-2' : ''}`}>
        {bookingPath ? (
          <button
            type='button'
            disabled={busy !== null}
            onClick={() => void leaveCurrentAccount(bookingPath, 'guest')}
            className='inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black disabled:opacity-60'
          >
            <LogOut className='h-4 w-4' />
            {busy === 'guest' ? 'Signing out…' : 'Sign out and continue as guest'}
          </button>
        ) : null}
        <button
          type='button'
          disabled={busy !== null}
          onClick={() => void leaveCurrentAccount(loginHref, 'login')}
          className='inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-xs font-black uppercase text-foreground disabled:opacity-60'
        >
          <LogIn className='h-4 w-4' />
          {busy === 'login' ? 'Signing out…' : 'Use the booking account'}
        </button>
      </div>
      {!bookingPath ? (
        <div className='mt-4 flex flex-wrap gap-4 text-xs font-bold text-gold-soft'>
          <a href='tel:+15124812319' className='underline underline-offset-4'>Call Gloss Boss</a>
          <a href='sms:+15124812319' className='underline underline-offset-4'>Text Gloss Boss</a>
        </div>
      ) : null}
    </section>
  );
}
