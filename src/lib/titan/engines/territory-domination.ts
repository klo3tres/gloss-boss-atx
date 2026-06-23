import type { TerritoryIntelligence } from '@/lib/titan/territory-intelligence';

export type TerritoryDominationRow = {
  id: string;
  label: string;
  revenueCents: number;
  jobs: number;
  closeRatePercent: number;
  verdict: 'double_down' | 'maintain' | 'reduce_focus';
  directive: string;
};

export type TerritoryDominationEngine = {
  rows: TerritoryDominationRow[];
  doubleDown: string | null;
  reduceFocus: string | null;
  headline: string;
};

export function buildTerritoryDomination(territory: TerritoryIntelligence): TerritoryDominationEngine {
  const allDefs = [
    { id: 'georgetown', label: 'Georgetown' },
    { id: 'round_rock', label: 'Round Rock' },
    { id: 'pflugerville', label: 'Pflugerville' },
    { id: 'cedar_park', label: 'Cedar Park' },
    { id: 'hutto', label: 'Hutto' },
    { id: 'leander', label: 'Leander' },
  ];

  const byId = new Map(territory.territories.map((t) => [t.id, t]));
  const rows: TerritoryDominationRow[] = allDefs.map((def) => {
    const t = byId.get(def.id);
    const revenueCents = t?.revenueCents ?? 0;
    const jobs = t?.jobs ?? 0;
    const closeRatePercent = t?.closeRatePercent ?? 0;

    let verdict: TerritoryDominationRow['verdict'] = 'maintain';
    let directive = 'Monitor — not enough data yet';

    if (jobs >= 3 && closeRatePercent >= 75 && revenueCents >= 80000) {
      verdict = 'double_down';
      directive = 'Double down — strong revenue and conversion';
    } else if (jobs >= 2 && (closeRatePercent < 50 || revenueCents < 30000)) {
      verdict = 'reduce_focus';
      directive = 'Reduce focus — low ROI for time spent';
    } else if (jobs > 0) {
      verdict = 'maintain';
      directive = 'Maintain — acceptable performance';
    }

    return {
      id: def.id,
      label: def.label,
      revenueCents,
      jobs,
      closeRatePercent,
      verdict,
      directive,
    };
  });

  rows.sort((a, b) => b.revenueCents - a.revenueCents);

  const double = rows.find((r) => r.verdict === 'double_down');
  const reduce = rows.find((r) => r.verdict === 'reduce_focus');

  const headline =
    double && reduce
      ? `Double down on ${double.label}. Stop spreading thin in ${reduce.label}.`
      : territory.suggestedExpansion ?? 'Complete more jobs to unlock territory domination insights.';

  return {
    rows,
    doubleDown: double?.label ?? territory.topRevenue?.label ?? null,
    reduceFocus: reduce?.label ?? territory.weakest?.label ?? null,
    headline,
  };
}
