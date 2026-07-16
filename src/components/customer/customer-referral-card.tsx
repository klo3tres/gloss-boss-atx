'use client';

import { useState } from 'react';
import { Copy, Download, Gift, Link2, Mail, MessageSquare, QrCode, Share2, Trophy } from 'lucide-react';
import type { ReferralRewardLadderTier } from '@/lib/referral/referral-codes';

type Props = {
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
  giveLabel?: string;
  getLabel?: string;
  givePercent?: number;
  getPercent?: number;
  rewardLadder?: ReferralRewardLadderTier[];
  enabled?: boolean;
};

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
  giveLabel,
  getLabel,
  givePercent,
  getPercent,
  rewardLadder = [],
  enabled = true,
}: Props) {
  const [copied, setCopied] = useState(false);
  if (!enabled) return null;

  const copy = async (value = referralLink) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const message = `Book Gloss Boss ATX with my referral link: ${referralLink}`;
  const shareSms = () => { window.location.href = `sms:?&body=${encodeURIComponent(message)}`; };
  const shareEmail = () => { window.location.href = `mailto:?subject=${encodeURIComponent('Gloss Boss ATX referral')}&body=${encodeURIComponent(`${message}\n\nCode: ${referralCode}`)}`; };
  const nativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Gloss Boss ATX referral', text: rewardRules || message, url: referralLink });
    } else {
      await copy();
    }
  };
  const shareFacebook = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`, '_blank', 'noopener,noreferrer');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(referralLink)}`;
  const ladder = rewardLadder.length > 0 ? rewardLadder : [
    { threshold: 1, rewardType: 'percent' as const, rewardValue: getPercent ?? 15, label: `${getPercent ?? 15}% off` },
    { threshold, rewardType: 'free_service' as const, rewardValue: 0, label: 'Free detail reward' },
  ];
  const nextTier = ladder.find((tier) => completedReferrals < tier.threshold) ?? ladder[ladder.length - 1];
  const progressTarget = Math.max(1, nextTier?.threshold ?? threshold);
  const progress = Math.min(100, Math.round((completedReferrals / progressTarget) * 100));
  const remaining = Math.max(0, progressTarget - completedReferrals);
  const buttonClass = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-2 py-2 text-[10px] font-bold uppercase text-zinc-300';

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-b from-black/60 to-zinc-950/80 p-4 backdrop-blur-xl sm:p-6">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-gold-soft"><Gift className="h-4 w-4" /> Rewards center · Refer friends</div>
      <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">Share your link. Both of you get rewarded.</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Your friend gets</p><p className="mt-1 text-base font-black text-white">{giveLabel ?? `${givePercent ?? 10}% off`}</p></div>
        <div className="rounded-2xl border border-gold/25 bg-gold/5 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">You get after completed payment</p><p className="mt-1 text-base font-black text-white">{getLabel ?? `${getPercent ?? 15}% off`}</p></div>
      </div>
      {rewardRules ? <p className="mt-3 text-xs leading-5 text-zinc-400">{rewardRules}</p> : null}

      <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] md:items-start">
        <div className="mx-auto w-full max-w-[240px] rounded-3xl border border-white/10 bg-white p-3 shadow-2xl sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt={`Referral QR code for ${referralCode}`} width={512} height={512} className="aspect-square h-auto w-full rounded-xl object-contain" />
          <p className="mt-1 flex items-center justify-center gap-1 text-[9px] font-black uppercase text-zinc-600"><QrCode className="h-3 w-3" /> Scan to book</p>
          <a href={qrUrl} download={`gloss-boss-referral-${referralCode}.png`} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 text-[10px] font-black uppercase text-white"><Download className="h-4 w-4" /> Download QR</a>
        </div>

        <div className="min-w-0 rounded-3xl border border-white/10 bg-black/30 p-3 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <code className="flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-950 px-2 text-center text-xs font-mono text-gold-soft">{referralCode}</code>
            <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gold px-2 text-[10px] font-black uppercase text-black"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}</button>
            <button type="button" onClick={shareSms} className={buttonClass}><MessageSquare className="h-3.5 w-3.5" /> SMS</button>
            <button type="button" onClick={shareEmail} className={buttonClass}><Mail className="h-3.5 w-3.5" /> Email</button>
            <button type="button" onClick={() => void copy(`${referralLink}\nCode: ${referralCode}`)} className={buttonClass}>IG copy</button>
            <button type="button" onClick={shareFacebook} className={buttonClass}>Facebook</button>
            <button type="button" onClick={() => void nativeShare()} className={`${buttonClass} border-gold/25 text-gold-soft sm:col-span-3`}><Share2 className="h-3.5 w-3.5" /> Share</button>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950 p-3"><p className="flex min-w-0 items-start gap-1.5 break-all text-[11px] text-zinc-400"><Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {referralLink}</p></div>
        </div>
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase text-zinc-500 sm:grid-cols-3 lg:grid-cols-6">
        {[['Invites', sentReferrals ?? 0, 'text-white'], ['Pending', pendingReferrals ?? 0, 'text-amber-300'], ['Booked', bookedReferrals ?? 0, 'text-white'], ['Completed', completedReferrals, 'text-emerald-300'], ['Earned', rewardsEarned ?? 0, 'text-white'], ['Available', rewardsAvailable ?? 0, 'text-gold-soft']].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-xl border border-white/5 bg-black/20 p-3"><p>{label}</p><p className={`text-lg font-black ${color}`}>{value}</p></div>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-400"><Trophy className="h-3.5 w-3.5 text-gold-soft" /> Reward ladder</div>
        <ul className="mt-2 space-y-2">
          {ladder.map((tier) => {
            const unlocked = completedReferrals >= tier.threshold;
            const active = !unlocked && tier.threshold === nextTier?.threshold;
            return <li key={`${tier.threshold}-${tier.label}`} className={`flex flex-col gap-1 rounded-xl border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${unlocked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : active ? 'border-gold/30 bg-gold/5 text-gold-soft' : 'border-white/5 text-zinc-500'}`}><span>Refer {tier.threshold} friend{tier.threshold === 1 ? '' : 's'}</span><span className="font-bold">{tier.label}</span></li>;
          })}
        </ul>
      </div>
      <div className="mt-4"><div className="flex flex-wrap justify-between gap-2 text-[10px] uppercase text-zinc-500"><span>{remaining > 0 ? `${remaining} to next: ${nextTier?.label ?? 'reward'}` : 'Next reward unlocked!'}</span><span>{completedReferrals}/{progressTarget}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-all" style={{ width: `${progress}%` }} /></div></div>
    </section>
  );
}
