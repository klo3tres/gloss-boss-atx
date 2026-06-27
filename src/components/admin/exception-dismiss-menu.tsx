'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const act = (days: number | null) => {
    startTransition(async () => {
      const res = await dismissExceptionAction(fingerprint, undefined, days ?? undefined);
      if (res.error) onDone?.('', res.error);
      else {
        onDone?.(days ? `Snoozed ${days} days.` : 'Dismissed.');
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" disabled={disabled || pending} onClick={() => act(null)} className="rounded border border-emerald-500/30 px-2 py-1 text-[9px] font-black uppercase text-emerald-300 hover:text-emerald-100 disabled:opacity-50">
        Dismiss
      </button>
      <button type="button" disabled={disabled || pending} onClick={() => act(7)} className="rounded border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50">
        Snooze 7d
      </button>
      <button type="button" disabled={disabled || pending} onClick={() => act(30)} className="rounded border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50">
        30d
      </button>
    </div>
  );
}
