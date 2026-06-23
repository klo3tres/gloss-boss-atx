'use client';

import { useTransition } from 'react';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { displayMoney } from '@/lib/display-format';

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  features: string[];
};

export function TitanBillingClient({
  currentTier,
  subscriptionStatus,
  plans,
}: {
  currentTier: string;
  subscriptionStatus: string | null;
  plans: Plan[];
}) {
  const [pending, startTransition] = useTransition();

  const subscribe = (planId: string) => {
    startTransition(async () => {
      const res = await fetch('/api/admin/titan/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">{TITAN_ENGINES.billing}</p>
        <h1 className="mt-2 text-2xl font-black text-white">Titan subscription</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Current plan: <strong className="text-white">{currentTier}</strong>
          {subscriptionStatus ? ` · ${subscriptionStatus}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-3xl border p-6 ${currentTier === plan.id ? 'border-gold/40 bg-gold/5' : 'border-white/10 bg-black/55'}`}
          >
            <p className="text-lg font-black text-white">{plan.name}</p>
            <p className="mt-2 font-mono text-3xl font-black text-gold-soft">{displayMoney(plan.priceCents)}<span className="text-sm text-zinc-500">/mo</span></p>
            <ul className="mt-4 space-y-1 text-xs text-zinc-400">
              {plan.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending || currentTier === plan.id}
              onClick={() => subscribe(plan.id)}
              className="mt-6 w-full rounded-xl bg-gold/20 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-40"
            >
              {currentTier === plan.id ? 'Current plan' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-600">
        Workspace isolation and multi-tenant billing ship with Scale tier. Gloss Boss uses the default workspace today.
      </p>
    </div>
  );
}
