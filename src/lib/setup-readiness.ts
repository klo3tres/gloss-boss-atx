export type ReadinessCheck = {
  title: string;
  area: string;
  ok: boolean;
  important: boolean;
  detail: string;
  action: string;
  href: string;
};

export type LaunchReadinessAggregate = {
  systemsRequiredPct: number;
  systemsOptionalPct: number;
  goalsConfigured: boolean;
  goalsConfiguredPct: number;
  goalsProgressPct: number;
  aggregatePct: number;
  requiredDone: number;
  requiredTotal: number;
  optionalDone: number;
  optionalTotal: number;
  activeGoalCount: number;
};

export function computeLaunchReadinessAggregate(
  checks: ReadinessCheck[],
  goals: Array<{ status: string; target_value: number; current_value: number }>,
): LaunchReadinessAggregate {
  const required = checks.filter((c) => c.important);
  const optional = checks.filter((c) => !c.important);
  const requiredDone = required.filter((c) => c.ok).length;
  const optionalDone = optional.filter((c) => c.ok).length;
  const systemsRequiredPct = required.length > 0 ? Math.round((requiredDone / required.length) * 100) : 100;
  const systemsOptionalPct = optional.length > 0 ? Math.round((optionalDone / optional.length) * 100) : 100;

  const active = goals.filter((g) => g.status === 'active');
  const goalsConfigured = active.length > 0;
  const goalsConfiguredPct = goalsConfigured ? 100 : 0;
  const goalsProgressPct =
    active.length > 0
      ? Math.round(
          active.reduce((sum, g) => {
            const t = Number(g.target_value ?? 0);
            const pct = t > 0 ? Math.min(100, Math.round((Number(g.current_value ?? 0) / t) * 100)) : 0;
            return sum + pct;
          }, 0) / active.length,
        )
      : 0;

  const aggregatePct = Math.round(
    systemsRequiredPct * 0.4 + systemsOptionalPct * 0.1 + goalsConfiguredPct * 0.2 + goalsProgressPct * 0.3,
  );

  return {
    systemsRequiredPct,
    systemsOptionalPct,
    goalsConfigured,
    goalsConfiguredPct,
    goalsProgressPct,
    aggregatePct,
    requiredDone,
    requiredTotal: required.length,
    optionalDone,
    optionalTotal: optional.length,
    activeGoalCount: active.length,
  };
}
