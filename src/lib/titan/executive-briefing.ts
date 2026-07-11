import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { loadOperationsSnapshot } from '@/lib/operations-snapshot';
import { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import { loadLeadRadarItems } from '@/lib/titan/lead-radar-engine';
import { buildTodaysMoneyPlan, type MoneyMission } from '@/lib/titan/todays-money-plan';
import { buildDailyActionPlan, type DailyActionPlan } from '@/lib/titan/daily-action-plan';
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

export type BriefingJobPreview = {
  id: string;
  guestName: string;
  when: string;
  service: string;
  href: string;
};

export type BriefingRoiAction = {
  id: string;
  title: string;
  why: string;
  confidence: number;
  revenueImpactCents: number;
  revenueImpactLabel: string;
  timeEstimateMinutes: number;
  priority: 'critical' | 'high' | 'medium';
  href: string;
  dependencies?: string;
};

export type ExecutiveBriefingSnapshot = {
  ownerName: string;
  narrative: string;
  revenueYesterdayCents: number;
  revenueYesterdayLabel: string;
  revenueTodayCents: number;
  revenueTodayLabel: string;
  revenueTargetCents: number;
  revenueTargetLabel: string;
  revenueGapCents: number;
  revenueGapLabel: string;
  projectedRevenueTodayCents: number;
  projectedRevenueTodayLabel: string;
  scheduleCount: number;
  scheduleLabel: string;
  operationalAdvantage: number;
  advantageDelta: number;
  advantageFactors: OperationalAdvantageFactor[];
  improveAction?: { label: string; href: string; points: number };
  opportunities: BriefingOpportunity[];
  roiActions: BriefingRoiAction[];
  unsignedAcknowledgments: number;
  reviewsNeeded: number;
  inventoryAlerts: number;
  customersDue: number;
  healthLabel: string;
  healthTone: 'healthy' | 'watch' | 'critical';
  unreadActivity: number;
  balanceDueLabel: string;
  weatherRisk?: string;
  calendarConflict?: string;
  todayJobs: BriefingJobPreview[];
  upcomingJobs: BriefingJobPreview[];
  dailyActionPlan: DailyActionPlan;
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

  // moneyPlan.goalTarget is a book-count mission (e.g. "book 1"), never cents.
  const avgJobCents = Math.max(parseMoneyLabel(metrics.averageTicketSize) || 0, 17500);

  const moneyPlan = await buildTodaysMoneyPlan(admin, {
    opportunities: revenueHunt.opportunities,
    leadRadar: leadRadar.items,
    avgJobCents,
  });

  const dailyActionPlan = await buildDailyActionPlan(admin, avgJobCents);

  const todayPay = summarizePayments(await fetchPaymentsSince(admin, startOfTodayIso(), new Date().toISOString()));
  const revenueToday = todayPay.grossCents;

  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date();
  yesterdayEnd.setHours(0, 0, 0, 0);
  const yesterdayPay = summarizePayments(
    await fetchPaymentsSince(admin, yesterdayStart.toISOString(), yesterdayEnd.toISOString()),
  );
  const revenueYesterday = yesterdayPay.grossCents;

  let unsignedAcknowledgments = 0;
  let reviewsNeeded = 0;
  let inventoryAlerts = 0;
  let customersDue = 0;
  try {
    const activeAppts = await admin
      .from('appointments')
      .select('id')
      .in('status', ['confirmed', 'assigned', 'in_progress'])
      .limit(40);
    const ids = (activeAppts.data ?? []).map((r) => String((r as { id: string }).id));
    if (ids.length) {
      const signed = await admin.from('signed_agreements').select('appointment_id').in('appointment_id', ids);
      const signedSet = new Set((signed.data ?? []).map((r) => String((r as { appointment_id: string }).appointment_id)));
      unsignedAcknowledgments = ids.filter((id) => !signedSet.has(id)).length;
    }
  } catch {
    /* optional */
  }
  try {
    const { count } = await admin
      .from('titan_job_closeouts')
      .select('id', { count: 'exact', head: true })
      .is('review_requested_at', null);
    reviewsNeeded = count ?? 0;
  } catch {
    /* optional */
  }
  try {
    const { data: inv } = await admin
      .from('titan_inventory_items')
      .select('quantity_on_hand, reorder_threshold, active')
      .eq('active', true)
      .limit(100);
    inventoryAlerts = (inv ?? []).filter((r) => {
      const row = r as { quantity_on_hand?: number; reorder_threshold?: number };
      const thr = Number(row.reorder_threshold ?? 0);
      return thr > 0 && Number(row.quantity_on_hand ?? 0) <= thr;
    }).length;
  } catch {
    /* optional */
  }
  try {
    const { count } = await admin
      .from('customer_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('due_at', new Date().toISOString());
    customersDue = count ?? 0;
  } catch {
    /* optional */
  }

  const DEFAULT_DAILY_TARGET_CENTS = 85000;
  let revenueTargetCents = DEFAULT_DAILY_TARGET_CENTS;
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
  // Guard against mis-entered goals that produce nonsense daily targets (e.g. ~$32).
  if (!Number.isFinite(revenueTargetCents) || revenueTargetCents < 25000) {
    revenueTargetCents = DEFAULT_DAILY_TARGET_CENTS;
  }

  const revenueGapCents = Math.max(0, revenueTargetCents - revenueToday);
  const projectedFromActions = (dailyActionPlan.actions ?? [])
    .filter((a) => a.status === 'pending')
    .reduce((s, a) => s + (a.expectedValueCents ?? 0), 0);
  const projectedFromSchedule = (metrics.todayJobs ?? []).reduce(
    (s, j) => s + (Number((j as { revenueCents?: number }).revenueCents ?? 0) || 0),
    0,
  );
  const projectedRevenueTodayCents = revenueToday + projectedFromActions + projectedFromSchedule;
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

  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const { data: dismissedMissionRows } = await admin
    .from('titan_daily_actions')
    .select('action_key')
    .eq('action_date', todayKey)
    .in('status', ['dismissed', 'sent', 'completed']);
  const dismissedKeys = new Set(
    (dismissedMissionRows ?? []).map((r) => String((r as { action_key?: string }).action_key ?? '')).filter(Boolean),
  );
  const openMissions = moneyPlan.missions.filter((m) => {
    if (m.entityType === 'opportunity' && m.entityId && dismissedKeys.has(`opp-${m.entityId}`)) return false;
    if (m.entityType === 'lead_radar' && m.entityId && dismissedKeys.has(`radar-${m.entityId}`)) return false;
    if (dismissedKeys.has(m.missionKey) || dismissedKeys.has(m.id)) return false;
    return true;
  });

  const improveAction =
    !gcal
      ? { label: 'Connect Google Calendar', href: '/admin/calendar', points: 8 }
      : critical > 0
        ? { label: 'Resolve exceptions', href: '/admin/exceptions', points: 6 }
        : openMissions[0]
          ? {
              label: openMissions[0].title.slice(0, 48),
              href: openMissions[0].href,
              points: 4,
            }
          : undefined;

  const opportunities = openMissions.slice(0, 3).map(missionToOpportunity);

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

  const roiActions: BriefingRoiAction[] = (dailyActionPlan.actions ?? []).slice(0, 5).map((a) => ({
    id: a.id,
    title: a.title,
    why: a.valueExplanation || a.reason,
    confidence: a.confidence,
    revenueImpactCents: a.expectedValueCents,
    revenueImpactLabel: a.expectedValueLabel,
    timeEstimateMinutes: a.actionType === 'balance' ? 3 : a.actionType === 'review' ? 2 : 5,
    priority:
      a.expectedValueCents >= 20000 || a.actionType === 'balance'
        ? 'critical'
        : a.expectedValueCents >= 10000
          ? 'high'
          : 'medium',
    href: a.href,
    dependencies: a.canSend ? undefined : a.sendBlocker || 'Open record to complete',
  }));

  const expectedIfCompleted = roiActions.reduce((s, a) => s + a.revenueImpactCents, 0);
  const narrativeParts = [
    `Yesterday you collected ${displayMoney(revenueYesterday)}.`,
    `Today's goal is ${displayMoney(revenueTargetCents)} — ${revenueGapCents > 0 ? `${displayMoney(revenueGapCents)} still to close` : 'on track'}.`,
    `Projected finish ${displayMoney(projectedRevenueTodayCents)} if you clear the top actions.`,
  ];
  if (parseMoneyLabel(metrics.balanceDue) > 0) narrativeParts.push(`Payments waiting: ${metrics.balanceDue}.`);
  if (unsignedAcknowledgments > 0) narrativeParts.push(`${unsignedAcknowledgments} acknowledgment(s) unsigned.`);
  if (reviewsNeeded > 0) narrativeParts.push(`${reviewsNeeded} review request(s) ready.`);
  if (customersDue > 0) narrativeParts.push(`${customersDue} customer(s) due for follow-up.`);
  if (inventoryAlerts > 0) narrativeParts.push(`${inventoryAlerts} inventory alert(s).`);
  if (weatherRisk) narrativeParts.push(`Weather: ${weatherRisk}`);
  if (expectedIfCompleted > 0) {
    narrativeParts.push(`Completing today's top ${roiActions.length} actions could add up to ${displayMoney(expectedIfCompleted)}.`);
  }

  return {
    ownerName,
    narrative: narrativeParts.join(' '),
    revenueYesterdayCents: revenueYesterday,
    revenueYesterdayLabel: displayMoney(revenueYesterday),
    revenueTodayCents: revenueToday,
    revenueTodayLabel: displayMoney(revenueToday),
    revenueTargetCents,
    revenueTargetLabel: displayMoney(revenueTargetCents),
    revenueGapCents,
    revenueGapLabel: displayMoney(revenueGapCents),
    projectedRevenueTodayCents,
    projectedRevenueTodayLabel: displayMoney(projectedRevenueTodayCents),
    scheduleCount,
    scheduleLabel: `${scheduleCount} appointment${scheduleCount === 1 ? '' : 's'} today`,
    operationalAdvantage,
    advantageDelta,
    advantageFactors: factors,
    improveAction,
    opportunities: opportunities.slice(0, 3),
    roiActions,
    unsignedAcknowledgments,
    reviewsNeeded,
    inventoryAlerts,
    customersDue,
    healthLabel,
    healthTone,
    unreadActivity,
    balanceDueLabel: metrics.balanceDue,
    weatherRisk: weatherRisk || undefined,
    calendarConflict: critical > 0 ? `${critical} scheduling or ops conflicts` : undefined,
    todayJobs: (metrics.todayJobs ?? []).slice(0, 5).map((j) => ({
      id: j.id,
      guestName: j.guestName,
      when: j.when,
      service: j.service,
      href: j.href,
    })),
    upcomingJobs: (metrics.upcomingAppts ?? []).slice(0, 5).map((j) => ({
      id: j.id,
      guestName: j.guestName,
      when: j.time,
      service: j.service,
      href: j.href,
    })),
    dailyActionPlan,
  };
}
