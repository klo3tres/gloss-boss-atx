import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { loadOperationsSnapshot } from '@/lib/operations-snapshot';
import { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import { loadLeadRadarItems } from '@/lib/titan/lead-radar-engine';
import { buildTodaysMoneyPlan, type MoneyMission } from '@/lib/titan/todays-money-plan';
import { countUnreadNotifications } from '@/lib/titan/notification-events';
import { loadGoogleCalendarConnection } from '@/lib/google/google-calendar-sync';
import { displayMoney } from '@/lib/display-format';
import { fetchPaymentsSince, startOfTodayIso, summarizePayments } from '@/lib/revenue-metrics';

export type BriefingOpportunity = {
  id: string;
  title: string;
  body: string;
  confidence: number;
  confidenceLabel: string;
  revenueLabel: string;
  href: string;
  autoRunLabel?: string;
  canAutoRun: boolean;
  contactPhone?: string;
  script?: string;
  entityType?: string;
  entityId?: string;
};

export type OperationalAdvantageFactor = {
  ok: boolean;
  label: string;
  detail?: string;
};

export type ExecutiveBriefingSnapshot = {
  ownerName: string;
  revenueTodayCents: number;
  revenueTodayLabel: string;
  revenueTargetCents: number;
  revenueTargetLabel: string;
  revenueGapCents: number;
  revenueGapLabel: string;
  scheduleCount: number;
  scheduleLabel: string;
  operationalAdvantage: number;
  advantageDelta: number;
  advantageFactors: OperationalAdvantageFactor[];
  improveAction?: { label: string; href: string; points: number };
  opportunities: BriefingOpportunity[];
  healthLabel: string;
  healthTone: 'healthy' | 'watch' | 'critical';
  unreadActivity: number;
  balanceDueLabel: string;
  weatherRisk?: string;
  calendarConflict?: string;
};

function parseMoneyLabel(label: string): number {
  const n = Number(label.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function missionToOpportunity(m: MoneyMission): BriefingOpportunity {
  const rev =
    m.revenueMaxCents > 0
      ? `+$${(m.revenueMaxCents / 100).toFixed(0)}`
      : m.revenueMinCents > 0
        ? `+$${(m.revenueMinCents / 100).toFixed(0)}`
        : '';
  return {
    id: m.id,
    title: m.title,
    body: m.description,
    confidence: m.confidenceScore,
    confidenceLabel: m.confidenceLabel,
    revenueLabel: rev,
    href: m.href,
    autoRunLabel: m.contactPhone ? 'Send outreach' : undefined,
    canAutoRun: Boolean(m.contactPhone || m.contactEmail),
    contactPhone: m.contactPhone ?? undefined,
    script: m.script,
    entityType: m.entityType,
    entityId: m.entityId,
  };
}

export async function loadExecutiveBriefing(
  admin: SupabaseClient,
  ownerName: string,
): Promise<ExecutiveBriefingSnapshot> {
  const [metrics, operations, revenueHunt, leadRadar, unreadActivity, gcal] = await Promise.all([
    loadOwnerDashboardSnapshot(admin),
    loadOperationsSnapshot(admin).catch(() => null),
    loadRevenueHuntBundle(admin),
    loadLeadRadarItems(admin),
    countUnreadNotifications(admin),
    loadGoogleCalendarConnection(admin),
  ]);

  const moneyPlan = await buildTodaysMoneyPlan(admin, {
    opportunities: revenueHunt.opportunities,
    leadRadar: leadRadar.items,
  });

  const todayPay = summarizePayments(await fetchPaymentsSince(admin, startOfTodayIso(), new Date().toISOString()));
  const revenueToday = todayPay.grossCents;

  let revenueTargetCents = moneyPlan.goalTarget > 0 ? moneyPlan.goalTarget : 85000;
  const { data: goalRow } = await admin
    .from('admin_goals')
    .select('target_value, unit, goal_type')
    .eq('status', 'active')
    .in('goal_type', ['revenue_daily', 'revenue', 'daily_revenue', 'revenue_monthly'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (goalRow?.target_value) {
    const unit = String(goalRow.unit ?? 'cents');
    const raw = unit === 'cents' ? Number(goalRow.target_value) : Math.round(Number(goalRow.target_value) * 100);
    const goalType = String(goalRow.goal_type ?? '');
    if (goalType === 'revenue_monthly') {
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      revenueTargetCents = Math.round(raw / daysInMonth);
    } else {
      revenueTargetCents = raw;
    }
  }

  const revenueGapCents = Math.max(0, revenueTargetCents - revenueToday);
  const scheduleCount = metrics.jobsTodayCount ?? metrics.jobsToday ?? metrics.todayJobs?.length ?? 0;

  const weatherExc = operations?.exceptions?.find((e) => e.category === 'weather');
  const weatherRisk = weatherExc ? `${weatherExc.title} — ${weatherExc.detail}` : undefined;

  const critical = operations?.summary?.critical ?? 0;
  const healthTone: ExecutiveBriefingSnapshot['healthTone'] =
    critical >= 5 ? 'critical' : critical >= 2 ? 'watch' : 'healthy';
  const healthLabel =
    healthTone === 'healthy'
      ? 'Business is healthy'
      : healthTone === 'watch'
        ? `${critical} items need attention`
        : `${critical} critical issues`;

  const factors: OperationalAdvantageFactor[] = [
    { ok: Boolean(gcal), label: 'Calendar automated', detail: gcal ? 'Google connected' : 'Connect Google Calendar' },
    {
      ok: metrics.bookingHealth >= 80,
      label: 'Booking flow healthy',
      detail: `${metrics.bookingHealth}% health`,
    },
    {
      ok: parseMoneyLabel(metrics.balanceDue) < 50000,
      label: 'Balances current',
      detail: metrics.balanceDue,
    },
    {
      ok: critical < 2,
      label: 'Operations clear',
      detail: critical ? `${critical} exceptions` : 'No critical blockers',
    },
    {
      ok: unreadActivity < 8,
      label: 'Inbox manageable',
      detail: `${unreadActivity} unread`,
    },
  ];

  const okCount = factors.filter((f) => f.ok).length;
  const operationalAdvantage = Math.round((okCount / factors.length) * 100);
  const advantageDelta = Math.min(12, okCount * 2);

  const improveAction =
    !gcal
      ? { label: 'Connect Google Calendar', href: '/admin/calendar', points: 8 }
      : critical > 0
        ? { label: 'Resolve exceptions', href: '/admin/exceptions', points: 6 }
        : moneyPlan.missions[0]
          ? {
              label: moneyPlan.missions[0].title.slice(0, 48),
              href: moneyPlan.missions[0].href,
              points: 4,
            }
          : undefined;

  const opportunities = moneyPlan.missions.slice(0, 3).map(missionToOpportunity);

  if (opportunities.length < 3 && metrics.unreadMessageCount > 0) {
    opportunities.push({
      id: 'messages',
      title: 'Unread customer messages',
      body: `${metrics.unreadMessageCount} message(s) waiting for a reply.`,
      confidence: 85,
      confidenceLabel: 'Fast replies improve booking rate',
      revenueLabel: '',
      href: '/admin/messages',
      canAutoRun: false,
    });
  }

  if (parseMoneyLabel(metrics.balanceDue) > 0 && opportunities.length < 3) {
    opportunities.push({
      id: 'balances',
      title: 'Outstanding balances',
      body: `${metrics.balanceDue} due from open jobs.`,
      confidence: 90,
      confidenceLabel: 'Collecting improves cash flow today',
      revenueLabel: metrics.balanceDue,
      href: '/admin?overview=1',
      canAutoRun: false,
    });
  }

  return {
    ownerName,
    revenueTodayCents: revenueToday,
    revenueTodayLabel: displayMoney(revenueToday),
    revenueTargetCents,
    revenueTargetLabel: displayMoney(revenueTargetCents),
    revenueGapCents,
    revenueGapLabel: displayMoney(revenueGapCents),
    scheduleCount,
    scheduleLabel: `${scheduleCount} appointment${scheduleCount === 1 ? '' : 's'} today`,
    operationalAdvantage,
    advantageDelta,
    advantageFactors: factors,
    improveAction,
    opportunities: opportunities.slice(0, 3),
    healthLabel,
    healthTone,
    unreadActivity,
    balanceDueLabel: metrics.balanceDue,
    weatherRisk: weatherRisk || undefined,
    calendarConflict: critical > 0 ? `${critical} scheduling or ops conflicts` : undefined,
  };
}
