'use client';

import Link from 'next/link';
import type { TitanBriefing } from '@/lib/titan-briefing';
import { displayMoney } from '@/lib/display-format';

export function TitanIntelligencePanels({ briefing }: { briefing: TitanBriefing }) {
  const { intelligence } = briefing;
  const topTech = intelligence.technicians[0];

  return (
    <div className="space-y-6">
      {/* Phase 10 — Forecast */}
      <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-black p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Titan Forecast</p>
        <div className="mt-4 flex flex-wrap items-end gap-8">
          <div>
            <p className="text-xs text-zinc-500">Current month</p>
            <p className="font-mono text-2xl font-black text-white">{displayMoney(briefing.insights.revenueMonthCents)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Forecasted close</p>
            <p className="font-mono text-3xl font-black text-emerald-300">
              {displayMoney(intelligence.forecast.forecastedMonthCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Confidence</p>
            <p className="font-mono text-2xl font-black text-white">{briefing.forecast.confidencePercent}%</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {briefing.forecast.factors.map((f) => (
            <li key={f} className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] text-zinc-400">
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* Phase 7 — Revenue Engine */}
      <section className="rounded-3xl border border-red-500/20 bg-black/55 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-300">Titan Revenue Engine</p>
            <p className="mt-2 text-sm text-zinc-400">Where revenue is leaking right now.</p>
          </div>
          <p className="font-mono text-xl font-black text-red-200">
            {displayMoney(intelligence.totalLeakCents)} at risk
          </p>
        </div>
        <ul className="mt-4 space-y-2">
          {intelligence.revenueLeaks.length === 0 ? (
            <li className="text-xs text-zinc-500">No major leaks detected — keep pressure on follow-ups.</li>
          ) : (
            intelligence.revenueLeaks.map((leak) => (
              <li key={leak.id}>
                <Link
                  href={leak.href}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/40 px-4 py-3 text-sm hover:border-red-500/30"
                >
                  <span className="text-zinc-200">{leak.title}</span>
                  <span className="font-mono text-xs font-bold text-red-300">~{displayMoney(leak.potentialCents)}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phase 6 — Technician OS */}
        <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Titan Technician OS</p>
          <p className="mt-2 text-sm text-zinc-500">Who is carrying the business this month.</p>
          {topTech ? (
            <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <p className="text-[10px] font-black uppercase text-gold-soft">Top performer</p>
              <p className="mt-1 text-lg font-black text-white">{topTech.name}</p>
              <p className="mt-2 text-xs text-zinc-300">{topTech.summary}</p>
              <p className="mt-2 text-[10px] text-zinc-500">Score {topTech.compositeScore}/100</p>
            </div>
          ) : null}
          <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {intelligence.technicians.map((tech) => (
              <li key={tech.technicianId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-white">{tech.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {displayMoney(tech.revenueCents)} · {tech.upsellRatePercent}% upsell · {tech.avgReviewRating ?? '—'}★
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                    tech.badge === 'top'
                      ? 'bg-gold/20 text-gold-soft'
                      : tech.badge === 'solid'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {tech.badge ?? '—'}
                </span>
              </li>
            ))}
            {intelligence.technicians.length === 0 ? (
              <li className="text-xs text-zinc-600">Assign technicians to jobs to populate scores.</li>
            ) : null}
          </ul>
          <Link href="/admin/team" className="mt-3 inline-block text-[10px] font-black uppercase text-gold-soft hover:underline">
            Team roster →
          </Link>
        </section>

        {/* Phase 8 — Opportunity Engine */}
        <section className="rounded-3xl border border-purple-500/20 bg-black/55 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Titan Opportunity Engine</p>
          <p className="mt-2 text-sm text-zinc-500">Predicted rebooks based on booking rhythm.</p>
          <ul className="mt-4 space-y-2 max-h-80 overflow-y-auto">
            {intelligence.opportunities.length === 0 ? (
              <li className="text-xs text-zinc-600">Need 2+ completed jobs per customer to detect patterns.</li>
            ) : (
              intelligence.opportunities.map((opp) => (
                <li key={opp.customerKey} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-white">{opp.customerName}</p>
                    <span className="font-mono text-purple-300">{opp.rebookProbability}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Books every ~{opp.avgIntervalDays}d · day {opp.daysSinceLastService} since last service
                    {opp.queued ? ' · queued' : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
          <Link href="/admin/follow-ups" className="mt-3 inline-block text-[10px] font-black uppercase text-purple-300 hover:underline">
            Follow-up queue →
          </Link>
        </section>
      </div>

      {/* Phase 9 — Reputation */}
      <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan Reputation Engine</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase text-emerald-300">VIP customers</p>
            <ul className="mt-2 space-y-2">
              {intelligence.reputation.vip.length === 0 ? (
                <li className="text-xs text-zinc-600">No VIP tier customers yet.</li>
              ) : (
                intelligence.reputation.vip.map((c) => (
                  <li key={c.customerId ?? c.customerEmail ?? c.customerName}>
                    <Link href={c.href} className="block rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs hover:border-emerald-500/30">
                      <p className="font-bold text-white">{c.customerName}</p>
                      <p className="text-[10px] text-zinc-500">{c.reasons.join(' · ')}</p>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-amber-300">Risk customers</p>
            <ul className="mt-2 space-y-2">
              {intelligence.reputation.risk.length === 0 ? (
                <li className="text-xs text-zinc-600">No high-risk customers flagged.</li>
              ) : (
                intelligence.reputation.risk.map((c) => (
                  <li key={c.customerId ?? c.customerEmail ?? c.customerName}>
                    <Link href={c.href} className="block rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs hover:border-amber-500/30">
                      <p className="font-bold text-white">{c.customerName}</p>
                      <p className="text-[10px] text-zinc-500">{c.reasons.join(' · ')}</p>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
