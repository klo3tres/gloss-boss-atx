import type { WidgetStats } from '@/lib/titan/site-guide';
import type { TerritoryIntelligence } from '@/lib/titan/territory-intelligence';
import { TitanEmptyState } from '@/components/titan/titan-ui';
import { displayMoney } from '@/lib/display-format';

export function TitanWidgetStatsPanel({ stats }: { stats: WidgetStats }) {
  if (!stats.tablesReady) {
    return (
      <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan Site Guide</p>
        <TitanEmptyState
          title="Widget analytics not migrated"
          detail="Apply migration 000091 to track Ask Titan opens, questions, and leads."
        />
      </section>
    );
  }

  const hasActivity = stats.opens > 0 || stats.questions > 0 || stats.leadsCreated > 0;

  const tiles = [
    { label: 'Widget opens', value: stats.opens },
    { label: 'Questions asked', value: stats.questions },
    { label: 'Leads created', value: stats.leadsCreated },
    { label: 'Quote requests', value: stats.quoteRequests },
    { label: 'Booking clicks', value: stats.bookingClicks },
    { label: 'Kyle handoffs', value: stats.handoffs },
  ];

  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-zinc-950/50 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Titan Site Guide</p>
      <p className="mt-1 text-sm text-zinc-500">Public Ask Titan widget — last 30 days.</p>
      {!hasActivity ? (
        <div className="mt-4">
          <TitanEmptyState
            title="No widget leads yet"
            detail="Test Ask Titan from the homepage — bottom-right floating button on public pages."
            actionLabel="Open homepage"
            actionHref="/"
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}

export function TitanTerritoryPanel({ territory }: { territory: TerritoryIntelligence }) {
  const hasData = territory.territories.length > 0 || territory.insightLines.length > 0;

  return (
    <section className="rounded-3xl border border-violet-500/20 bg-zinc-950/50 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">Titan Territory Intelligence™</p>
      <p className="mt-1 text-sm text-zinc-500">Geography insights from completed jobs.</p>
      {!hasData ? (
        <div className="mt-4">
          <TitanEmptyState
            title="Territory data building"
            detail="Complete more jobs with service addresses to unlock area-level insights and expansion suggestions."
          />
        </div>
      ) : (
        <>
          {territory.suggestedExpansion ? (
            <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
              <p className="text-[10px] font-black uppercase text-violet-200">Suggested expansion</p>
              <p className="mt-1 text-sm font-bold text-white">{territory.suggestedExpansion}</p>
            </div>
          ) : null}
          <ul className="mt-4 space-y-2">
            {territory.insightLines.map((line) => (
              <li key={line} className="rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-300">
                {line}
              </li>
            ))}
          </ul>
          {territory.territories.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-zinc-600">
                    <th className="pb-2 pr-3 font-black">Area</th>
                    <th className="pb-2 pr-3 font-black">Jobs</th>
                    <th className="pb-2 pr-3 font-black">Avg ticket</th>
                    <th className="pb-2 font-black">Close %</th>
                  </tr>
                </thead>
                <tbody>
                  {territory.territories.map((t) => (
                    <tr key={t.id} className="border-t border-white/5 text-zinc-300">
                      <td className="py-2.5 pr-3 font-bold text-white">{t.label}</td>
                      <td className="py-2.5 pr-3">{t.jobs}</td>
                      <td className="py-2.5 pr-3 font-mono">{displayMoney(t.avgTicketCents)}</td>
                      <td className="py-2.5">{t.closeRatePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
