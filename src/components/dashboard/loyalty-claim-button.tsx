'use client';

import { useState, useTransition } from 'react';
import { Gift } from 'lucide-react';
import { claimLoyaltyRewardAction } from '@/app/(dashboard)/dashboard/loyalty-actions';

export function LoyaltyClaimButton({ count }: { count?: number }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await claimLoyaltyRewardAction();
            setMsg(res.ok ? res.message ?? 'Reward claimed!' : res.error ?? 'Could not claim reward.');
          });
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(52,211,153,0.2)] hover:brightness-110 transition duration-300 disabled:opacity-60"
      >
        <Gift className="h-4 w-4" />
        {pending ? 'Claiming…' : `Claim reward${count && count > 1 ? ` (${count})` : ''}`}
      </button>
      {msg ? <p className="mt-2 text-center text-[10px] text-emerald-300">{msg}</p> : null}
    </div>
  );
}
