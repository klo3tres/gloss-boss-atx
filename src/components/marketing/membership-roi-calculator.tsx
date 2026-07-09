'use client';

import { useMemo, useState } from 'react';
import { Check, Clock, Gift, Shield, Sparkles, Star } from 'lucide-react';
import {
  MEMBERSHIP_TIER_CATALOG,
  bestFitTierForVisits,
  type MembershipTierKey,
} from '@/lib/membership-tier-catalog';

const VALUE_PROPS = [
  { icon: Clock, label: 'Priority scheduling', desc: 'Members-only slots — front-of-line on Gold' },
  { icon: Gift, label: 'Included credits', desc: 'Quarterly detail credits and annual upgrade value on higher tiers' },
  { icon: Sparkles, label: 'Free wash credits', desc: 'Maintenance exterior wash every 6 months on every tier' },
  { icon: Star, label: 'Member-only promotions', desc: 'Exclusive offers not shown to one-time clients' },
  { icon: Shield, label: 'VIP support', desc: 'Priority rescheduling and dedicated member lane' },
  { icon: Check, label: 'Digital punch card', desc: 'Track visits and rewards in your member dashboard' },
] as const;

export function MembershipRoiCalculator({ plans }: { plans: Array<{ tier: string; price_monthly_cents: number; discount_percent: number }> }) {
  const [visits, setVisits] = useState(6);
  const [avgTicket, setAvgTicket] = useState(225);
  const [tier, setTier] = useState<MembershipTierKey>('silver');

  const plan = plans.find((p) => p.tier.toLowerCase().includes(tier));
  const meta = MEMBERSHIP_TIER_CATALOG[tier];
  const monthly = (plan?.price_monthly_cents ?? meta.monthlyAnchorCents) / 100;
  const discount = plan?.discount_percent ?? meta.discountPercent;
  const bestFit = bestFitTierForVisits(visits);

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const result = useMemo(() => {
    const visitsPerYear = Math.min(24, Math.max(1, visits));
    const ticket = Math.min(2000, Math.max(50, avgTicket));
    const grossSpend = visitsPerYear * ticket;
    const memberDiscount = Math.round(grossSpend * (discount / 100));
    const annualDues = monthly * 12;
    const quarterlyCredits = meta.quarterlyCreditCents ? (meta.quarterlyCreditCents / 100) * 4 : 0;
    const annualCredits = meta.annualCreditCents ? meta.annualCreditCents / 100 : 0;
    const upgradeCredits = meta.upgradeCreditCents ? (meta.upgradeCreditCents / 100) * 4 : 0;
    const freeWashValue = (meta.freeWashCreditCents / 100) * 2;
    const credits = quarterlyCredits + annualCredits + upgradeCredits + freeWashValue;
    const netSavings = memberDiscount + credits - annualDues;
    return {
      grossSpend,
      memberDiscount,
      annualDues,
      credits,
      quarterlyCredits,
      annualCredits,
      upgradeCredits,
      freeWashValue,
      netSavings,
      visitsPerYear,
      ticket,
    };
  }, [visits, avgTicket, tier, monthly, discount, meta]);

  const isBestFit = tier === bestFit;
  const showPositivePitch = result.netSavings >= 0 || isBestFit;

  return (
    <section id="roi-calculator" className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/5 via-black to-zinc-950 p-6 sm:p-8">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Why pay every month?</p>
      <h2 className="mt-2 text-2xl font-black uppercase text-white sm:text-3xl">Membership ROI calculator</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        See service discounts, included credits, free wash value, and membership cost for your driving habits. Higher tiers
        deliver stronger value when you detail more often.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-xs text-zinc-500">
            Visits per year
            <input type="range" min={1} max={24} value={visits} onChange={(e) => setVisits(Number(e.target.value))} className="mt-2 w-full accent-[var(--gb-gold)]" />
            <span className="mt-1 block font-mono text-white">{visits}× / year</span>
          </label>
          <label className="block text-xs text-zinc-500">
            Avg detail ticket ($)
            <input type="number" min={50} max={2000} step={5} value={avgTicket} onChange={(e) => setAvgTicket(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white" />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['bronze', 'silver', 'gold'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase ${tier === t ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-400'}`}
              >
                {t}
                {bestFit === t ? ' · best fit' : ''}
              </button>
            ))}
          </div>
          <p className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs text-zinc-400">
            <span className="font-black text-gold-soft">Best fit for {visits} visits/yr:</span>{' '}
            {MEMBERSHIP_TIER_CATALOG[bestFit].tier.toUpperCase()} — {MEMBERSHIP_TIER_CATALOG[bestFit].bestFor}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/50 p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Annual spend (non-member)</dt><dd className="font-mono text-white">{fmt(result.grossSpend)}</dd></div>
            <p className="text-[10px] text-zinc-600">{result.visitsPerYear} visits × {fmt(result.ticket)} avg ticket</p>
            <div className="flex justify-between"><dt className="text-zinc-500">Service discount savings ({discount}%)</dt><dd className="font-mono text-emerald-300">+{fmt(result.memberDiscount)}</dd></div>
            {result.quarterlyCredits > 0 ? (
              <div className="flex justify-between"><dt className="text-zinc-500">Quarterly detail credits</dt><dd className="font-mono text-emerald-300">+{fmt(result.quarterlyCredits)}</dd></div>
            ) : null}
            {result.annualCredits > 0 ? (
              <div className="flex justify-between"><dt className="text-zinc-500">Annual detail credit</dt><dd className="font-mono text-emerald-300">+{fmt(result.annualCredits)}</dd></div>
            ) : null}
            {result.upgradeCredits > 0 ? (
              <div className="flex justify-between"><dt className="text-zinc-500">Quarterly upgrade credits</dt><dd className="font-mono text-emerald-300">+{fmt(result.upgradeCredits)}</dd></div>
            ) : null}
            <div className="flex justify-between"><dt className="text-zinc-500">Free wash credits (2×/yr est.)</dt><dd className="font-mono text-emerald-300">+{fmt(result.freeWashValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Annual membership cost</dt><dd className="font-mono text-zinc-400">−{fmt(result.annualDues)}</dd></div>
            <div className="border-t border-white/10 pt-3 flex justify-between">
              <dt className="font-black text-gold-soft">Net annual value</dt>
              <dd className={`font-mono text-xl font-black ${showPositivePitch ? 'text-emerald-300' : 'text-zinc-400'}`}>
                {result.netSavings >= 0 ? '+' : ''}{fmt(result.netSavings)}
              </dd>
            </div>
          </dl>
          {!showPositivePitch ? (
            <p className="mt-3 text-[10px] text-zinc-500">
              At {visits} visits/year, {MEMBERSHIP_TIER_CATALOG[bestFit].tier} may be a better fit — try that tier above.
            </p>
          ) : (
            <p className="mt-3 text-[10px] text-zinc-500">{meta.scheduling} · {meta.bestFor}</p>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VALUE_PROPS.map((v) => (
          <div key={v.label} className="flex gap-3 rounded-xl border border-white/8 bg-black/40 p-3">
            <v.icon className="h-5 w-5 shrink-0 text-gold-soft" />
            <div>
              <p className="text-xs font-black text-white">{v.label}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
