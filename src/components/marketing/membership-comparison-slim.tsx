'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { tierMetaForPlan } from '@/lib/membership-tier-catalog';
import type { MembershipPlanCompare } from '@/components/marketing/membership-comparison-table';

export function MembershipComparisonSlim({ className = '' }: { className?: string }) {
  const [plans, setPlans] = useState<MembershipPlanCompare[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout('/api/public/membership-plans', { cache: 'no-store', timeoutMs: 8000 })
      .then((r) => r.json())
      .then((j: { plans?: MembershipPlanCompare[] }) => {
        if (!cancelled) {
          setPlans(Array.isArray(j.plans) ? j.plans : []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <div className={`grid gap-3 sm:grid-cols-3 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/50" />
        ))}
      </div>
    );
  }

  if (plans.length === 0) return null;

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => {
          const meta = tierMetaForPlan(plan);
          const monthly = plan.price_monthly_cents || plan.price_cents || 0;
          const isGold = plan.tier.toLowerCase().includes('gold');
          return (
            <article
              key={plan.id}
              className={`relative rounded-2xl border p-4 transition hover:border-gold/30 ${
                isGold ? 'border-gold/35 bg-gold/5' : 'border-white/10 bg-black/45'
              }`}
            >
              {isGold ? (
                <span className="absolute -top-2 right-3 rounded-full bg-gold px-2 py-0.5 text-[8px] font-black uppercase text-black">
                  Popular
                </span>
              ) : null}
              <p className="text-[9px] font-black uppercase tracking-wider text-gold-soft">{plan.tier}</p>
              <h3 className="mt-1 text-sm font-black text-white">{plan.name}</h3>
              {meta ? <p className="mt-1 text-[10px] leading-snug text-zinc-500 line-clamp-2">{meta.bestFor}</p> : null}
              <p className="mt-3 font-mono text-xl font-black text-white">
                ${(monthly / 100).toFixed(0)}
                <span className="text-[10px] font-bold text-zinc-500">/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-[10px] text-zinc-400">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-gold-soft shrink-0" />
                  {plan.discount_percent}% member discount
                </li>
                {meta ? (
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 shrink-0 text-gold-soft" />
                    Digital punch card
                  </li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-gold-soft shrink-0" />
                  {meta?.scheduling ?? 'Priority scheduling'}
                </li>
              </ul>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/memberships#pricing-calculator"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black hover:brightness-110"
        >
          <Sparkles className="h-3.5 w-3.5" /> Compare all plans
        </Link>
        <Link href="/memberships" className="text-[10px] font-bold uppercase text-zinc-400 hover:text-gold-soft">
          Full membership page →
        </Link>
      </div>
    </div>
  );
}
