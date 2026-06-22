'use client';

import { useTransition } from 'react';
import { dismissExceptionAction } from '@/app/(dashboard)/admin/exceptions/exception-actions';

export function ExceptionDismissMenu({
  fingerprint,
  disabled,
  onDone,
}: {
  fingerprint: string;
  disabled?: boolean;
  onDone?: (msg: string, err?: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  const snooze = (days: number) => {
    startTransition(async () => {
      const res = await dismissExceptionAction(fingerprint, undefined, days);
      if (res.error) onDone?.('', res.error);
      else onDone?.(days === 0 ? 'Dismissed.' : `Snoozed ${days} days.`);
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => snooze(7)}
        className="rounded border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50"
      >
        Snooze 7d
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => snooze(30)}
        className="rounded border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50"
      >
        30d
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => snooze(60)}
        className="rounded border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50"
      >
        60d
      </button>
    </div>
  );
}
