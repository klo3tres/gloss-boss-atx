'use client';

import Link from 'next/link';
import type { OwnerInsightsBundle } from '@/lib/titan/owner-insights';

const toneBorder: Record<string, string> = {
  good: 'border-emerald-500/25',
  warn: 'border-amber-500/25',
  action: 'border-gold/30',
  neutral: 'border-white/10',
};

export function TitanOwnerInsightsPanel({ bundle }: { bundle: OwnerInsightsBundle }) {
  return (
    <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gold-soft">Titan Owner Insights</h2>
      <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
        <span className="font-black uppercase text-emerald-300">Next best action: </span>
        {bundle.nextBestAction}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bundle.insights.map((ins) => {
          const inner = (
            <div className={`rounded-xl border bg-black/40 p-4 ${toneBorder[ins.tone] ?? toneBorder.neutral}`}>
              <p className="text-[10px] font-black uppercase text-zinc-600">{ins.label}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{ins.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{ins.detail}</p>
            </div>
          );
          return ins.href ? (
            <Link key={ins.id} href={ins.href} className="block transition hover:opacity-90">{inner}</Link>
          ) : (
            <div key={ins.id}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}
