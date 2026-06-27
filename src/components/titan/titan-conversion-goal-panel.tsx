'use client';

import Link from 'next/link';
import { Target } from 'lucide-react';
import type { ConversionGoalStats } from '@/lib/titan/lead-radar-hunt';

export function TitanConversionGoalPanel({ stats }: { stats: ConversionGoalStats }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-black/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-300" />
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">24-hour conversion goal</p>
          </div>
          <h2 className="mt-2 text-xl font-black text-white">Goal: Book 1 detail in the next 24 hours.</h2>
        </div>
        <Link href="/admin/titan/lead-radar" className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black">
          Open Lead Radar
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Leads captured today', value: stats.leadsCapturedToday },
          { label: 'Replies sent today', value: stats.repliesSentToday },
          { label: 'Opportunities created', value: stats.opportunitiesCreatedToday },
          { label: 'Bookings today', value: stats.bookingsToday },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
            <p className="text-[10px] font-black uppercase text-zinc-600">{s.label}</p>
            <p className="mt-1 font-mono text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
        <span className="font-black uppercase text-emerald-300">Next best action: </span>
        {stats.nextBestAction}
      </p>
    </section>
  );
}
