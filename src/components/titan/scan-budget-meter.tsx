'use client';

import type { ScanBudgetRow } from '@/lib/titan/scan-budget';

export function ScanBudgetMeter({
  budget,
  tablesReady,
  message,
}: {
  budget: ScanBudgetRow | null;
  tablesReady: boolean;
  message?: string;
}) {
  if (!tablesReady) {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
        Apply migration 000108 to enable scan budget tracking.
      </p>
    );
  }

  const used = budget?.usedToday ?? 0;
  const limit = budget?.dailyLimit ?? 25;
  const remaining = budget?.remaining ?? limit;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 backdrop-blur-md">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Scan budget — Google Places</p>
      <p className="mt-2 text-sm font-bold text-white">
        You have <span className="text-emerald-300">{remaining}</span> of <span className="text-white">{limit}</span> scan credits left today.
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-zinc-500">
        <span>Used today: {used}</span>
        {budget?.lastScanAt ? <span>Last scan: {new Date(budget.lastScanAt).toLocaleString()}</span> : null}
        {budget?.nextAllowedScanAt ? <span>Next allowed: {new Date(budget.nextAllowedScanAt).toLocaleString()}</span> : null}
      </div>
      {message ? <p className="mt-2 text-xs text-amber-200">{message}</p> : null}
      {remaining <= 0 ? (
        <p className="mt-2 text-xs text-rose-300">Daily limit reached — increase limit in Setup Center or try tomorrow.</p>
      ) : null}
    </div>
  );
}
