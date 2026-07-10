'use client';

import { useMemo, useState } from 'react';
import { Check, Clock, Gift, Shield, Sparkles, Star } from 'lucide-react';
import { MEMBERSHIP_TIER_CATALOG } from '@/lib/membership-tier-catalog';
import { computeMembershipRoi, recommendMembershipTier } from '@/lib/membership-roi';

const VALUE_PROPS = [
  { icon: Clock, label: 'Priority scheduling', desc: 'Members-only slots — front-of-line on Gold' },
  { icon: Gift, label: 'Included credits', desc: 'Quarterly detail credits and annual upgrade value on higher tiers' },
  { icon: Sparkles, label: 'Free wash credits', desc: 'Maintenance exterior wash every 6 months on every tier' },
  { icon: Star, label: 'Member-only promotions', desc: 'Exclusive offers not shown to one-time clients' },
  { icon: Shield, label: 'VIP support', desc: 'Priority rescheduling and dedicated member lane' },
  { icon: Check, label: 'Digital punch card', desc: 'Track visits and rewards in your member dashboard' },
] as const;

export function MembershipRoiCalculator({
  plans,
}: {
  plans: Array<{ tier: string; price_monthly_cents: number; price_yearly_cents?: number; discount_percent: number }>;
}) {
  const [visits, setVisits] = useState(6);
  const [avgTicket, setAvgTicket] = useState(225);
  const [tier, setTier] = useState<'bronze' | 'silver' | 'gold'>('silver');

  const plan = plans.find((p) => p.tier.toLowerCase().includes(tier));
  const recommendation = useMemo(
    () => recommendMembershipTier(visits, avgTicket, plans),
    [visits, avgTicket, plans],
  );

  const result = useMemo(() => {
    return computeMembershipRoi(tier, visits, avgTicket, {
      discount_percent: plan?.discount_percent,
      price_yearly_cents: plan?.price_yearly_cents ?? MEMBERSHIP_TIER_CATALOG[tier].yearlyAnchorCents,
    });
  }, [visits, avgTicket, tier, plan]);

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const isRecommended = tier === recommendation.best.tier;

  return (
    <section id="roi-calculator" className="rounded-3xl border border-gold/25 bg-card p-6 sm:p-8 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Why pay every year?</p>
      <h2 className="mt-2 text-2xl font-black uppercase text-foreground sm:text-3xl">Membership ROI calculator</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Annual pricing (Bronze $249 · Silver $499 · Gold $799/yr). Includes discounts, credits, free washes, birthday perks, and VIP benefits.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-xs text-muted-foreground">
            Visits per year
            <input
              type="range"
              min={1}
              max={24}
              value={visits}
              onChange={(e) => setVisits(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--gb-gold)]"
            />
            <span className="mt-1 block font-mono text-foreground">{visits}× / year</span>
          </label>
          <label className="block text-xs text-muted-foreground">
            Avg detail ticket ($)
            <input
              type="number"
              min={50}
              max={2000}
              step={5}
              value={avgTicket}
              onChange={(e) => setAvgTicket(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['bronze', 'silver', 'gold'] as const).map((t) => {
              const yearly = (plans.find((p) => p.tier.toLowerCase().includes(t))?.price_yearly_cents ??
                MEMBERSHIP_TIER_CATALOG[t].yearlyAnchorCents) / 100;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase ${
                    tier === t ? 'border-gold bg-gold/15 text-gold-soft' : 'border-border text-muted-foreground'
                  }`}
                >
                  {t} · ${yearly}/yr
                  {recommendation.best.tier === t ? ' · best' : ''}
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-gold/20 bg-gold/5 p-3 text-xs text-foreground">
            <span className="font-black text-gold-soft">Titan recommends {recommendation.best.meta.tier.toUpperCase()}:</span>{' '}
            {recommendation.explanation}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Annual spend (non-member)</dt>
              <dd className="font-mono text-foreground">{fmt(result.grossSpend)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Service discount ({result.meta.discountPercent}%)</dt>
              <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.memberDiscount)}</dd>
            </div>
            {result.quarterlyCredits > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quarterly credits</dt>
                <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.quarterlyCredits)}</dd>
              </div>
            ) : null}
            {result.annualCredits > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Annual credit</dt>
                <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.annualCredits)}</dd>
              </div>
            ) : null}
            {result.upgradeCredits > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Upgrade credits</dt>
                <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.upgradeCredits)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Free wash credits (2×/yr)</dt>
              <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.freeWashValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Birthday perk (est.)</dt>
              <dd className="font-mono text-emerald-600 dark:text-emerald-300">+{fmt(result.birthdayPerkValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Annual membership</dt>
              <dd className="font-mono text-muted-foreground">−{fmt(result.annualDues)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3">
              <dt className="font-black text-gold-soft">Net annual value</dt>
              <dd className={`font-mono text-xl font-black ${result.netSavings >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                {result.netSavings >= 0 ? '+' : ''}
                {fmt(result.netSavings)}
              </dd>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Break-even ≈ {result.breakEvenVisits} visits/yr · {isRecommended ? 'Recommended plan for your habits' : `Try ${recommendation.best.meta.tier} for better value`}
            </p>
          </dl>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VALUE_PROPS.map((v) => (
          <div key={v.label} className="flex gap-3 rounded-xl border border-border bg-background p-3">
            <v.icon className="h-5 w-5 shrink-0 text-gold-soft" />
            <div>
              <p className="text-xs font-black text-foreground">{v.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
