'use client';

import { useState } from 'react';
import { Copy, Gift, Link2, Mail, MessageSquare, Share2, Trophy } from 'lucide-react';
import type { ReferralRewardLadderTier } from '@/lib/referral/referral-codes';

export function CustomerReferralCard({
  referralCode,
  referralLink,
  completedReferrals,
  bookedReferrals,
  pendingReferrals,
  sentReferrals,
  rewardsEarned,
  rewardsAvailable,
  threshold,
  rewardRules,
  givePercent,
  getPercent,
  rewardLadder = [],
  enabled = true,
}: {
  referralCode: string;
  referralLink: string;
  completedReferrals: number;
  bookedReferrals?: number;
  pendingReferrals?: number;
  sentReferrals?: number;
  rewardsEarned?: number;
  rewardsAvailable?: number;
  threshold: number;
  rewardRules?: string;
  givePercent?: number;
  getPercent?: number;
  rewardLadder?: ReferralRewardLadderTier[];
  enabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!enabled) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const shareSms = () => {
    const body = encodeURIComponent(`Book Gloss Boss ATX with my referral link: ${referralLink}`);
    window.open(`sms:?&body=${body}`, '_blank');
  };

  const shareEmail = () => {
    const subject = encodeURIComponent('Gloss Boss ATX referral');
    const body = encodeURIComponent(`Use my referral link to book Gloss Boss ATX and save:\n\n${referralLink}\n\nCode: ${referralCode}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const ladder = rewardLadder.length > 0 ? rewardLadder : [
    { threshold: 1, rewardType: 'percent' as const, rewardValue: getPercent ?? 20, label: `${getPercent ?? 20}% off` },
    { threshold: threshold, rewardType: 'free_service' as const, rewardValue: 0, label: 'Free detail reward' },
  ];
  const nextTier = ladder.find((t) => completedReferrals < t.threshold) ?? ladder[ladder.length - 1];
  const progressTarget = nextTier?.threshold ?? threshold;
  const progress = Math.min(100, Math.round((completedReferrals / Math.max(1, progressTarget)) * 100));
  const remaining = Math.max(0, progressTarget - completedReferrals);

  return (
    <section className="rounded-3xl border border-gold/20 bg-gradient-to-b from-black/60 to-zinc-950/80 p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">
        <Gift className="h-4 w-4" /> Rewards center · Refer friends
      </div>
      <p className="mt-2 text-lg font-black text-white">
        Give {givePercent ?? 10}%, get {getPercent ?? 20}%
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {rewardRules ?? 'Share your link. When friends book and complete, you unlock Gloss Boss rewards automatically.'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-mono text-gold-soft">{referralCode}</code>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={shareSms} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-bold uppercase text-zinc-300">
          <MessageSquare className="h-3.5 w-3.5" /> SMS
        </button>
        <button type="button" onClick={shareEmail} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-bold uppercase text-zinc-300">
          <Mail className="h-3.5 w-3.5" /> Email
        </button>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl border border-gold/25 px-3 py-2 text-[10px] font-bold uppercase text-gold-soft">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
        <Link2 className="h-3.5 w-3.5 shrink-0" /> {referralLink}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase text-zinc-500 sm:grid-cols-5">
        <div className="rounded-xl border border-white/5 p-2"><p>Invites</p><p className="text-lg font-black text-white">{sentReferrals ?? 0}</p></div>
        <div className="rounded-xl border border-white/5 p-2"><p>Pending</p><p className="text-lg font-black text-amber-300">{pendingReferrals ?? 0}</p></div>
        <div className="rounded-xl border border-white/5 p-2"><p>Booked</p><p className="text-lg font-black text-white">{bookedReferrals ?? 0}</p></div>
        <div className="rounded-xl border border-white/5 p-2"><p>Completed</p><p className="text-lg font-black text-emerald-300">{completedReferrals}</p></div>
        <div className="rounded-xl border border-white/5 p-2 col-span-2 sm:col-span-1"><p>Rewards</p><p className="text-lg font-black text-gold-soft">{rewardsAvailable ?? 0} avail</p></div>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-400">
          <Trophy className="h-3.5 w-3.5 text-gold-soft" />
          Reward ladder
        </div>
        <ul className="mt-2 space-y-2">
          {ladder.map((tier) => {
            const unlocked = completedReferrals >= tier.threshold;
            const active = !unlocked && tier.threshold === nextTier?.threshold;
            return (
              <li
                key={`${tier.threshold}-${tier.label}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                  unlocked
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                    : active
                      ? 'border-gold/30 bg-gold/5 text-gold-soft'
                      : 'border-white/5 text-zinc-500'
                }`}
              >
                <span>
                  Refer {tier.threshold} friend{tier.threshold === 1 ? '' : 's'}
                </span>
                <span className="font-bold">{tier.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[10px] uppercase text-zinc-500">
          <span>{remaining > 0 ? `${remaining} to next: ${nextTier?.label ?? 'reward'}` : 'Next reward unlocked!'}</span>
          <span>{completedReferrals}/{progressTarget}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
