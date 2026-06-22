import type { TitanRoiMetrics } from '@/lib/titan/roi-dashboard';
import { TitanEmptyState } from '@/components/titan/titan-ui';
import { displayMoney } from '@/lib/display-format';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanRoiPanel({ roi }: { roi: TitanRoiMetrics }) {
  const tiles = [
    { label: 'Leads recovered', value: String(roi.leadsRecovered) },
    { label: 'Revenue recovered', value: money(roi.revenueRecoveredCents) },
    { label: 'Rebookings generated', value: String(roi.rebookingsGenerated) },
    { label: 'Opportunities discovered', value: String(roi.opportunitiesDiscovered) },
    { label: 'Follow-ups sent', value: String(roi.followUpsSent) },
    { label: 'Reviews generated', value: String(roi.reviewsGenerated) },
  ];

  const hasImpact =
    roi.generatedRevenueCents > 0 ||
    roi.leadsRecovered > 0 ||
    roi.followUpsSent > 0 ||
    roi.opportunitiesDiscovered > 0;

  return (
    <section className="rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/5 via-zinc-950 to-black p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Titan ROI</p>
      <p className="mt-1 text-sm text-zinc-500">Attributable impact — {roi.periodLabel.toLowerCase()}.</p>

      {!hasImpact ? (
        <div className="mt-4">
          <TitanEmptyState
            title="No ROI tracked yet"
            detail="Titan will update as leads convert, follow-ups send, and opportunities close."
            actionLabel="View leads"
            actionHref="/admin/leads"
          />
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-gold/25 bg-black/50 p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Titan generated revenue</p>
            <p className="mt-2 font-mono text-4xl font-black text-gold">{money(roi.generatedRevenueCents)}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase text-zinc-600">{t.label}</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{t.value}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
