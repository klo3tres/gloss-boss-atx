import type { TitanRoiMetrics } from '@/lib/titan/roi-dashboard';
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

  return (
    <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-black to-zinc-950 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Titan ROI</p>
      <p className="mt-1 text-sm text-zinc-500">What Titan actually did for your business — {roi.periodLabel.toLowerCase()}.</p>
      <div className="mt-5 rounded-2xl border border-gold/30 bg-black/50 p-5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Titan generated revenue</p>
        <p className="mt-2 font-mono text-4xl font-black text-gold">{money(roi.generatedRevenueCents)}</p>
        <p className="mt-1 text-xs text-zinc-600">{roi.periodLabel}</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase text-zinc-600">{t.label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{t.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
