'use client';

import Link from 'next/link';
import type { LeadRadarItem } from '@/lib/titan/lead-radar-engine';
import { INTENT_LABELS, SOURCE_TYPE_LABELS } from '@/lib/titan/lead-radar-engine';
import { displayMoney } from '@/lib/display-format';

function money(dollars: number) {
  return displayMoney(Math.round(dollars * 100));
}

export function TitanLeadRadarTodayPanel({
  topItems,
  tablesReady,
}: {
  topItems: LeadRadarItem[];
  tablesReady: boolean;
}) {
  if (!tablesReady) {
    return (
      <section className="rounded-3xl border border-cyan-500/20 bg-black/50 p-6">
        <p className="text-sm font-black text-white">Lead Radar</p>
        <p className="mt-2 text-xs text-zinc-400">Apply migration 000101 to enable Lead Radar.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-500/20 bg-black/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Lead Radar</p>
          <h2 className="mt-2 text-xl font-black text-white">New leads to reply to</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/titan/lead-radar?capture=1" className="rounded-xl bg-cyan-500 px-4 py-2 text-[10px] font-black uppercase text-black">
            Capture lead
          </Link>
          <Link href="/admin/titan/lead-radar" className="rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-300">
            Open Lead Radar
          </Link>
        </div>
      </div>

      {topItems.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">No new radar leads yet. Paste Facebook/Nextdoor posts in Lead Radar to classify and reply.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {topItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-xs font-bold text-white">{SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType}</p>
                <p className="text-[10px] text-cyan-300">{item.confidenceScore}% · {money(item.estimatedRevenue)}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{item.rawText}</p>
              <p className="mt-1 text-[10px] uppercase text-emerald-300">{INTENT_LABELS[item.detectedIntent] ?? item.detectedIntent}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
