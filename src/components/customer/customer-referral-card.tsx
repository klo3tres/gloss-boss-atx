'use client';

import { useState } from 'react';
import { Copy, Gift, Link2 } from 'lucide-react';

export function CustomerReferralCard({
  referralCode,
  referralLink,
  completedReferrals,
  threshold,
}: {
  referralCode: string;
  referralLink: string;
  completedReferrals: number;
  threshold: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const progress = Math.min(100, Math.round((completedReferrals / Math.max(1, threshold)) * 100));

  return (
    <section className="rounded-3xl border border-gold/20 bg-black/55 p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">
        <Gift className="h-4 w-4" /> Refer friends · earn rewards
      </div>
      <p className="mt-2 text-sm text-zinc-400">Share your link. When friends book and complete, you unlock Gloss Boss rewards.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-mono text-gold-soft">{referralCode}</code>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
        <Link2 className="h-3.5 w-3.5 shrink-0" /> {referralLink}
      </p>
      <div className="mt-4">
        <div className="flex justify-between text-[10px] uppercase text-zinc-500">
          <span>{completedReferrals} completed referrals</span>
          <span>{threshold} for free detail</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
