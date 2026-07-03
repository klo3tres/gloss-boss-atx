'use client';

import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { formatCredit, tierMetaForPlan, type MembershipTierMeta } from '@/lib/membership-tier-catalog';

export type MembershipPlanCompare = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  price_biweekly_cents?: number;
  price_cents?: number;
  discount_percent: number;
  benefits: string[];
  included_services: string[];
};

type Row = {
  label: string;
  render: (plan: MembershipPlanCompare, meta: MembershipTierMeta | null) => ReactNode;
};

function CellCheck({ ok }: { ok: boolean }) {
  return ok ? <Check className="mx-auto h-4 w-4 text-gold-soft" /> : <Minus className="mx-auto h-4 w-4 text-zinc-600" />;
}

export function MembershipComparisonTable({
  plans,
  biweeklyEnabled = false,
}: {
  plans: MembershipPlanCompare[];
  biweeklyEnabled?: boolean;
}) {
  const rows: Row[] = [
    {
      label: 'Best for',
      render: (_p, meta) => <span className="text-[11px] leading-relaxed text-zinc-400">{meta?.bestFor ?? '—'}</span>,
    },
    {
      label: 'Member discount',
      render: (p) => (
        <span className="font-mono font-black text-emerald-300">{p.discount_percent > 0 ? `${p.discount_percent}%` : '—'}</span>
      ),
    },
    {
      label: 'Loyalty punch speed',
      render: (_p, meta) => (
        <span>{meta ? `${meta.punchMultiplier}× stamps` : 'Punch card eligible'}</span>
      ),
    },
    {
      label: 'Quarterly credit',
      render: (_p, meta) => <span>{formatCredit(meta?.quarterlyCreditCents ?? 0)}</span>,
    },
    {
      label: 'Annual credit',
      render: (_p, meta) => <span>{formatCredit(meta?.annualCreditCents ?? 0)}</span>,
    },
    {
      label: 'Upgrade credit',
      render: (_p, meta) => <span>{formatCredit(meta?.upgradeCreditCents ?? 0)}</span>,
    },
    {
      label: 'Scheduling',
      render: (_p, meta) => <span className="text-[11px]">{meta?.scheduling ?? 'Priority options'}</span>,
    },
    {
      label: 'Priority scheduling',
      render: (p) => (
        <CellCheck ok={(p.benefits ?? []).some((b) => /priority|front/i.test(b))} />
      ),
    },
  ];

  return (
    <section className="w-full">
      <div className="text-center mb-10">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">Choose your lane</p>
        <h3 className="mt-2 text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">Membership comparison</h3>
        <p className="mt-2 text-sm text-zinc-400 max-w-xl mx-auto">
          Bronze protects your budget. Silver accelerates rewards. Gold is the VIP lane — pick the model that matches how you drive.
        </p>
      </div>

      {/* Mobile: stacked tier cards */}
      <div className="grid gap-4 md:hidden">
        {plans.map((plan) => {
          const meta = tierMetaForPlan(plan);
          return (
            <article key={plan.id} className="rounded-2xl border border-white/10 bg-black/50 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">{plan.tier}</p>
              <h4 className="mt-1 text-lg font-black text-white">{plan.name}</h4>
              {meta ? <p className="mt-1 text-xs text-zinc-500">{meta.bestFor}</p> : null}
              <ul className="mt-4 space-y-2.5 text-xs text-zinc-300">
                {rows.map((row) => (
                  <li key={row.label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
                    <span className="text-zinc-500 shrink-0">{row.label}</span>
                    <span className="text-right font-medium">{row.render(plan, meta)}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-white/10 bg-zinc-950/60">
              <th className="p-5 text-[10px] font-black uppercase tracking-wider text-zinc-400 w-[28%]">Feature</th>
              {plans.map((plan) => {
                const meta = tierMetaForPlan(plan);
                return (
                  <th key={plan.id} className="p-5 text-center align-top">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">{plan.tier}</p>
                    <p className="mt-1 text-sm font-black text-white">{plan.name}</p>
                    {meta ? <p className="mt-2 text-[10px] font-normal normal-case text-zinc-500 leading-snug">{meta.tagline}</p> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs text-zinc-300">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="p-5 font-bold text-white">{row.label}</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="p-5 text-center">
                    {row.render(plan, tierMetaForPlan(plan))}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="p-5 font-bold text-white">Billing options</td>
              {plans.map((plan) => {
                const intervals = [
                  biweeklyEnabled && (plan.price_biweekly_cents ?? 0) > 0 ? 'Bi-weekly' : '',
                  (plan.price_monthly_cents || plan.price_cents) ? 'Monthly' : '',
                  plan.price_yearly_cents > 0 ? 'Yearly' : '',
                ].filter(Boolean);
                return (
                  <td key={plan.id} className="p-5 text-center text-[11px]">
                    {intervals.join(' · ') || 'Contact us'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
