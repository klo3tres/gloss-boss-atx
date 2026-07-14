'use client';

import { useState, useTransition } from 'react';
import { Gift, X } from 'lucide-react';
import { claimLoyaltyRewardAction } from '@/app/(dashboard)/dashboard/loyalty-actions';

export function LoyaltyClaimButton({
  count,
  rewardName,
  rewardCents,
  eligibleServices = [],
  serviceBased = false,
}: {
  count?: number;
  rewardName?: string;
  rewardCents?: number;
  eligibleServices?: Array<{ slug: string; name: string; priceCents: number }>;
  serviceBased?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selectedService, setSelectedService] = useState('');

  const valueLabel = rewardCents != null ? `$${(rewardCents / 100).toFixed(2)}` : 'Credit on account';
  const expiresNote = 'Valid 12 months after claim — auto-applies at checkout.';

  const onClaim = () => {
    startTransition(async () => {
      const res = await claimLoyaltyRewardAction(selectedService || undefined);
      if (res.ok) {
        setMsg({ type: 'ok', text: res.message ?? 'Reward claimed!' });
        setOpen(false);
      } else {
        setMsg({ type: 'err', text: res.error ?? 'Could not claim reward.' });
      }
    });
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setOpen(true);
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(52,211,153,0.2)] transition duration-300 hover:brightness-110"
      >
        <Gift className="h-4 w-4" />
        Claim reward{count && count > 1 ? ` (${count})` : ''}
      </button>

      {msg ? (
        <p className={`mt-2 text-center text-[10px] ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-gold/25 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Reward unlocked</p>
                <h3 className="mt-1 text-lg font-black text-white">{rewardName ?? 'Punch card reward'}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between rounded-lg border border-white/5 bg-black/40 px-3 py-2">
                <dt className="text-zinc-500">Value</dt>
                <dd className="font-mono font-bold text-gold-soft">{valueLabel}</dd>
              </div>
              <div className="rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-400">{expiresNote}</div>
            </dl>
            {serviceBased ? (
              <label className="mt-4 block text-xs font-bold text-zinc-300">
                Choose your eligible service
                <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black px-3 text-white">
                  <option value="">Select a service</option>
                  {eligibleServices.map((service) => <option key={service.slug} value={service.slug}>{service.name} · ${(service.priceCents / 100).toFixed(2)} retail</option>)}
                </select>
              </label>
            ) : null}
            <p className="mt-3 text-xs text-zinc-500">Credit is added to your account and shows at booking checkout, on invoices, and receipts.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={pending || (serviceBased && !selectedService)}
                onClick={onClaim}
                className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-60"
              >
                {pending ? 'Claiming…' : 'Confirm claim'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
