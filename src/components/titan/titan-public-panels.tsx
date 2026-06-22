import type { WidgetStats } from '@/lib/titan/site-guide';
import type { TerritoryIntelligence } from '@/lib/titan/territory-intelligence';
import { displayMoney } from '@/lib/display-format';

export function TitanWidgetStatsPanel({ stats }: { stats: WidgetStats }) {
  if (!stats.tablesReady) {
    return (
      <section className="rounded-3xl border border-white/10 bg-black/55 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan Site Guide</p>
        <p className="mt-2 text-xs text-amber-200">Apply migration 000091 to track widget analytics.</p>
      </section>
    );
  }

  const tiles = [
    { label: 'Widget opens', value: stats.opens },
    { label: 'Questions asked', value: stats.questions },
    { label: 'Leads created', value: stats.leadsCreated },
    { label: 'Quote requests', value: stats.quoteRequests },
    { label: 'Booking clicks', value: stats.bookingClicks },
    { label: 'Kyle handoffs', value: stats.handoffs },
  ];

  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-black/55 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Titan Site Guide · Public widget</p>
      <p className="mt-1 text-sm text-zinc-500">Customer-facing Ask Titan on the homepage — last 30 days.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase text-zinc-600">{t.label}</p>
            <p className="mt-1 font-mono text-xl font-bold text-white">{t.value}</p>
          </div>
        ))}
      </div>
      {stats.topQuestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase text-zinc-500">Most asked</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {stats.topQuestions.map((q) => (
              <li key={q.key}>
                · {q.key.replace(/_/g, ' ')} <span className="text-zinc-600">({q.count})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function TitanTerritoryPanel({ territory }: { territory: TerritoryIntelligence }) {
  return (
    <section className="rounded-3xl border border-violet-500/20 bg-black/55 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">Titan Territory Intelligence™</p>
      <p className="mt-1 text-sm text-zinc-500">Geography insights from real jobs this month.</p>
      {territory.suggestedExpansion ? (
        <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
          <p className="text-[10px] font-black uppercase text-violet-200">Suggested expansion</p>
          <p className="mt-1 text-sm font-bold text-white">{territory.suggestedExpansion}</p>
          {territory.expectedRoiPercent != null ? (
            <p className="mt-1 text-xs text-emerald-300">Expected ROI +{territory.expectedRoiPercent}%</p>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {territory.insightLines.length === 0 ? (
          <li className="text-xs text-zinc-600">More completed jobs with addresses will sharpen territory insights.</li>
        ) : (
          territory.insightLines.map((line) => (
            <li key={line} className="rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-300">
              {line}
            </li>
          ))
        )}
      </ul>
      {territory.territories.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-zinc-600">
                <th className="pb-2 pr-3">Area</th>
                <th className="pb-2 pr-3">Jobs</th>
                <th className="pb-2 pr-3">Avg ticket</th>
                <th className="pb-2 pr-3">Close %</th>
                <th className="pb-2">vs avg</th>
              </tr>
            </thead>
            <tbody>
              {territory.territories.map((t) => (
                <tr key={t.id} className="border-t border-white/5 text-zinc-300">
                  <td className="py-2 pr-3 font-bold text-white">{t.label}</td>
                  <td className="py-2 pr-3">{t.jobs}</td>
                  <td className="py-2 pr-3 font-mono">{displayMoney(t.avgTicketCents)}</td>
                  <td className="py-2 pr-3">{t.closeRatePercent}%</td>
                  <td className={`py-2 font-mono ${t.vsAvgRevenuePercent >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {t.vsAvgRevenuePercent > 0 ? '+' : ''}
                    {t.vsAvgRevenuePercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
