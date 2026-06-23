import type { TitanBriefing } from '@/lib/titan-briefing';

export type GoalEngine = {
  monthlyGoalCents: number;
  currentMonthCents: number;
  gapCents: number;
  avgJobCents: number;
  jobsNeeded: number;
  customersNeeded: number;
  outreachAttemptsNeeded: number;
  partnershipsNeeded: number;
  summary: string;
  derivedPlan: string[];
};

export function buildGoalEngine(briefing: TitanBriefing): GoalEngine {
  const monthlyGoalCents =
    briefing.insights.revenueTargetCents ??
    briefing.workspace.monthlyRevenueGoalCents ??
    500000;
  const currentMonthCents = briefing.insights.revenueMonthCents;
  const gapCents = Math.max(0, monthlyGoalCents - currentMonthCents);
  const avgJobCents = Math.max(briefing.insights.avgJobCents, 15000);

  const jobsNeeded = gapCents > 0 ? Math.ceil(gapCents / avgJobCents) : 0;
  const customersNeeded = Math.ceil(jobsNeeded * 0.85);
  const outreachAttemptsNeeded = Math.max(jobsNeeded * 2, 10);
  const partnershipsNeeded = gapCents > 200000 ? 2 : gapCents > 100000 ? 1 : 0;

  const derivedPlan: string[] = [];
  if (jobsNeeded > 0) {
    derivedPlan.push(`Book ${jobsNeeded} more detail${jobsNeeded === 1 ? '' : 's'} (~${(avgJobCents / 100).toFixed(0)} avg)`);
    derivedPlan.push(`Convert ~${customersNeeded} new customer${customersNeeded === 1 ? '' : 's'}`);
    derivedPlan.push(`Run ${outreachAttemptsNeeded} outreach attempts this month`);
  }
  if (partnershipsNeeded > 0) {
    derivedPlan.push(`Close ${partnershipsNeeded} partnership${partnershipsNeeded === 1 ? '' : 's'} (apartment/HOA/fleet)`);
  }
  if (derivedPlan.length === 0) {
    derivedPlan.push('Goal on track — focus retention and partnerships to grow further');
  }

  const summary =
    gapCents > 0
      ? `$${(gapCents / 100).toFixed(0)} left to $${(monthlyGoalCents / 100).toFixed(0)}/mo goal`
      : `At or above $${(monthlyGoalCents / 100).toFixed(0)}/mo goal`;

  return {
    monthlyGoalCents,
    currentMonthCents,
    gapCents,
    avgJobCents,
    jobsNeeded,
    customersNeeded,
    outreachAttemptsNeeded,
    partnershipsNeeded,
    summary,
    derivedPlan,
  };
}
