import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';
import { loadMoneyPulse } from '@/lib/financial-closeout';
import { loadFollowUpDashboard } from '@/lib/follow-up-engine';
import { monthKeyChicago, startOfTodayChicagoIso } from '@/lib/chicago-time';
import { fetchPaymentsSince, startOfMonthIso, summarizePayments } from '@/lib/revenue-metrics';
import { loadTitanIntelligence, type TitanIntelligence } from '@/lib/titan';
import { loadTitanGrowth } from '@/lib/titan/command-layer';
import type { CommandPlan } from '@/lib/titan/command-layer';
import { loadTitanWorkspace, type TitanWorkspace } from '@/lib/titan/workspace';
import { hydrateActivityFeedIfEmpty, loadTitanActivityFeed, type TitanActivityEvent } from '@/lib/titan/activity-feed';
import { loadTitanRoiDashboard, type TitanRoiMetrics } from '@/lib/titan/roi-dashboard';
import { loadWidgetStats, type WidgetStats } from '@/lib/titan/site-guide';
import { loadTerritoryIntelligence, type TerritoryIntelligence } from '@/lib/titan/territory-intelligence';
import { fetchWeatherForAddress } from '@/lib/weather-forecast';

export type TitanAction = {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href: string;
  impactCents?: number;
};

export type TitanMemoryItem = {
  id: string;
  kind: string;
  title: string;
  occurredAt: string;
  href?: string;
};

export type TitanBriefing = {
  generatedAt: string;
  greeting: string;
  ownerName: string | null;
  betaLabel: string;
  insights: {
    revenueMonthCents: number;
    revenueTargetCents: number | null;
    revenueGapCents: number | null;
    revenueTodayCents: number;
    openLeads: number;
    followUpsDue: number;
    followUpsPending: number;
    openEstimates: number;
    openExceptions: number;
    estimatedLostRevenueCents: number;
    topService: { label: string; revenueCents: number } | null;
    rebookCandidates: number;
    memoryEvents30d: number;
    avgJobCents: number;
  };
  forecast: {
    projectedMonthCents: number;
    daysLeftInMonth: number;
    jobsNeededForGoal: number | null;
    confidencePercent: number;
    factors: string[];
  };
  weather: {
    configured: boolean;
    summary: string | null;
    rainWarning: string | null;
    jobsAtRisk: number;
  };
  recommendations: TitanAction[];
  memoryRecent: TitanMemoryItem[];
  intelligence: TitanIntelligence;
  growth: {
    tablesReady: boolean;
    radar: Awaited<ReturnType<typeof loadTitanGrowth>>['radar'];
    attribution: Awaited<ReturnType<typeof loadTitanGrowth>>['attribution'];
    content: Awaited<ReturnType<typeof loadTitanGrowth>>['content'];
    lastPlan: CommandPlan | null;
  };
  workspace: TitanWorkspace & { tablesReady: boolean };
  activity: TitanActivityEvent[];
  roi: TitanRoiMetrics;
  widgetStats: WidgetStats;
  territory: TerritoryIntelligence;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function greetingForHour() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysLeftInMonthChicago(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? 2026);
  const last = new Date(year, month, 0).getDate();
  return Math.max(0, last - day);
}

async function loadRevenueTarget(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin
    .from('admin_goals')
    .select('target_value, goal_type, status')
    .eq('status', 'active')
    .in('goal_type', ['revenue_monthly', 'profit_monthly'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const target = cents((data as { target_value?: number }).target_value);
  return target > 0 ? target : null;
}

async function loadTopService(admin: SupabaseClient, monthStart: string): Promise<{ label: string; revenueCents: number } | null> {
  const now = new Date().toISOString();
  const payments = await fetchPaymentsSince(admin, monthStart, now);
  const summary = summarizePayments(payments, { excludeTest: true, fromIso: monthStart, toIso: now });
  if (summary.grossCents <= 0) return null;

  const apptIds = [...new Set(payments.map((p) => str(p.appointment_id)).filter(Boolean))];
  if (!apptIds.length) return null;

  const { data: appts } = await admin.from('appointments').select('id, service_slug').in('id', apptIds.slice(0, 500));
  const slugById = new Map((appts ?? []).map((a) => [str((a as { id: string }).id), str((a as { service_slug?: string }).service_slug)]));

  const bySlug = new Map<string, number>();
  for (const p of payments) {
    const slug = slugById.get(str(p.appointment_id)) || 'other';
    bySlug.set(slug, (bySlug.get(slug) ?? 0) + cents(p.amount_cents));
  }

  let bestSlug = '';
  let bestCents = 0;
  for (const [slug, rev] of bySlug.entries()) {
    if (rev > bestCents) {
      bestCents = rev;
      bestSlug = slug;
    }
  }
  if (!bestSlug) return null;
  return { label: bestSlug.replace(/-/g, ' '), revenueCents: bestCents };
}

async function loadMemoryStats(admin: SupabaseClient): Promise<{ count30d: number; recent: TitanMemoryItem[] }> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [notes, messages, notifications, timeline, notesCount, msgCount, notifyCount, timelineCount] = await Promise.all([
    admin.from('customer_notes').select('id, body, created_at, customer_id').gte('created_at', since).order('created_at', { ascending: false }).limit(8),
    admin.from('messages').select('id, subject, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(8),
    admin
      .from('notification_outbox')
      .select('id, kind, created_at, sent_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('job_timeline_events')
      .select('id, event_type, created_at, appointment_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8),
    admin.from('customer_notes').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('notification_outbox').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('job_timeline_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);

  const recent: TitanMemoryItem[] = [];
  for (const row of notes.data ?? []) {
    const n = row as Record<string, unknown>;
    recent.push({
      id: `note:${n.id}`,
      kind: 'note',
      title: str(n.body).slice(0, 80) || 'Customer note',
      occurredAt: str(n.created_at),
      href: n.customer_id ? `/admin/customers/${n.customer_id}` : undefined,
    });
  }
  for (const row of messages.data ?? []) {
    const m = row as Record<string, unknown>;
    recent.push({
      id: `msg:${m.id}`,
      kind: 'message',
      title: str(m.subject) || 'Inbound message',
      occurredAt: str(m.created_at),
      href: '/admin/messages',
    });
  }
  for (const row of notifications.data ?? []) {
    const n = row as Record<string, unknown>;
    recent.push({
      id: `notify:${n.id}`,
      kind: 'notification',
      title: str(n.kind) || 'Notification',
      occurredAt: str(n.sent_at) || str(n.created_at),
      href: '/admin/notifications',
    });
  }
  for (const row of timeline.data ?? []) {
    const t = row as Record<string, unknown>;
    recent.push({
      id: `timeline:${t.id}`,
      kind: 'job_event',
      title: str(t.event_type).replace(/_/g, ' ') || 'Job event',
      occurredAt: str(t.created_at),
      href: t.appointment_id ? `/tech/work-orders/${t.appointment_id}` : undefined,
    });
  }

  recent.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const count30d =
    (notesCount.count ?? 0) + (msgCount.count ?? 0) + (notifyCount.count ?? 0) + (timelineCount.count ?? 0);

  return { count30d, recent: recent.slice(0, 12) };
}

function buildRecommendations(input: {
  followUpsDue: number;
  openLeads: number;
  openEstimates: number;
  openExceptions: number;
  revenueGapCents: number | null;
  avgJobCents: number;
  topService: { label: string; revenueCents: number } | null;
  rainWarning: string | null;
  jobsAtRisk: number;
}): TitanAction[] {
  const actions: TitanAction[] = [];

  if (input.followUpsDue > 0) {
    actions.push({
      id: 'follow-ups',
      priority: 'high',
      title: `Contact ${input.followUpsDue} overdue follow-up${input.followUpsDue === 1 ? '' : 's'}`,
      detail: 'Maintenance and win-back messages are due — this is direct rebook revenue.',
      href: '/admin/follow-ups',
      impactCents: input.followUpsDue * Math.max(input.avgJobCents, 15000),
    });
  }

  if (input.openEstimates > 0) {
    actions.push({
      id: 'estimates',
      priority: 'high',
      title: `Close ${input.openEstimates} open estimate${input.openEstimates === 1 ? '' : 's'}`,
      detail: 'Sent or draft estimates waiting on customer approval or deposit.',
      href: '/admin/leads',
    });
  }

  if (input.openLeads > 0) {
    actions.push({
      id: 'leads',
      priority: 'medium',
      title: `Work ${input.openLeads} open lead${input.openLeads === 1 ? '' : 's'}`,
      detail: 'Quoted or follow-up leads still in the pipeline.',
      href: '/admin/leads',
    });
  }

  if (input.openExceptions > 0) {
    actions.push({
      id: 'exceptions',
      priority: 'high',
      title: `Clear ${input.openExceptions} operational exception${input.openExceptions === 1 ? '' : 's'}`,
      detail: 'Payments, notifications, or job issues need owner attention.',
      href: '/admin/exceptions',
    });
  }

  if (input.revenueGapCents != null && input.revenueGapCents > 0 && input.avgJobCents > 0) {
    const jobs = Math.ceil(input.revenueGapCents / input.avgJobCents);
    actions.push({
      id: 'revenue-gap',
      priority: 'medium',
      title: `Book ~${jobs} more job${jobs === 1 ? '' : 's'} to hit monthly goal`,
      detail: `About $${(input.revenueGapCents / 100).toFixed(0)} left to target at current avg ticket.`,
      href: '/admin/leads',
      impactCents: input.revenueGapCents,
    });
  }

  if (input.topService) {
    actions.push({
      id: 'top-service',
      priority: 'low',
      title: `Push ${input.topService.label} — top earner this month`,
      detail: `$${(input.topService.revenueCents / 100).toFixed(0)} collected MTD on this package.`,
      href: '/admin/services',
    });
  }

  if (input.rainWarning && input.jobsAtRisk > 0) {
    actions.push({
      id: 'weather',
      priority: 'medium',
      title: `Review ${input.jobsAtRisk} job${input.jobsAtRisk === 1 ? '' : 's'} for weather risk`,
      detail: input.rainWarning,
      href: '/admin/exceptions?category=weather',
    });
  }

  actions.push({
    id: 'closeout',
    priority: 'low',
    title: 'Review financial closeout',
    detail: 'Confirm today’s money pulse and close the day when complete.',
    href: '/admin/financial-closeout',
  });

  const order = { high: 0, medium: 1, low: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 7);
}

export async function loadTitanBriefing(
  admin: SupabaseClient,
  ownerName?: string | null,
): Promise<TitanBriefing> {
  const monthStart = startOfMonthIso();
  const todayStart = startOfTodayChicagoIso();
  const baseAddress = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX';

  const [pulse, goalsMetrics, followUps, revenueTarget, topService, memory, weather, leadsRes, estimatesRes, exceptionsRes, jobsTodayRes, intelligence, growthData, lastPlanRes, workspace, roi, widgetStats, territory] =
    await Promise.all([
      loadMoneyPulse(admin),
      loadAdminGoalsMetrics(admin),
      loadFollowUpDashboard(admin),
      loadRevenueTarget(admin),
      loadTopService(admin, monthStart),
      loadMemoryStats(admin),
      fetchWeatherForAddress(baseAddress),
      admin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('status', ['new', 'contacted', 'quoted', 'no_response']),
      admin
        .from('service_estimates')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'sent', 'approved']),
      admin.from('business_exceptions').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      admin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_start', todayStart)
        .not('status', 'eq', 'cancelled'),
      loadTitanIntelligence(admin),
      loadTitanGrowth(admin),
      admin
        .from('titan_command_plans')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadTitanWorkspace(admin),
      loadTitanRoiDashboard(admin),
      loadWidgetStats(admin),
      loadTerritoryIntelligence(admin),
    ]);

  await hydrateActivityFeedIfEmpty(admin);
  const activityFeed = await loadTitanActivityFeed(admin, 20);

  const revenueMonthCents = pulse.monthGrossCents;
  const revenueGapCents =
    revenueTarget != null && revenueTarget > revenueMonthCents ? revenueTarget - revenueMonthCents : null;
  const avgJobCents = goalsMetrics.avgTicketCents || (goalsMetrics.monthJobs > 0 ? Math.round(revenueMonthCents / goalsMetrics.monthJobs) : 20000);
  const daysLeft = daysLeftInMonthChicago();
  const dayOfMonth = Math.max(1, 30 - daysLeft);
  const projectedMonthCents = intelligence.forecast.forecastedMonthCents;
  const jobsNeededForGoal =
    revenueGapCents != null && avgJobCents > 0 ? Math.ceil(revenueGapCents / avgJobCents) : null;

  const followUpsDue = followUps.dueToday + followUps.failed;
  const estimatedLostRevenueCents = followUpsDue * avgJobCents;

  const rainDays = weather.rainWarningDays ?? [];
  const rainWarning = rainDays.length ? `Rain likely: ${rainDays.slice(0, 2).join(', ')}` : weather.severe ? 'Severe weather watch — review outdoor jobs.' : null;
  const jobsAtRisk = rainWarning ? Math.min(jobsTodayRes.count ?? 0, 5) : 0;

  const recommendations = buildRecommendations({
    followUpsDue,
    openLeads: leadsRes.count ?? 0,
    openEstimates: estimatesRes.count ?? 0,
    openExceptions: exceptionsRes.error ? 0 : exceptionsRes.count ?? 0,
    revenueGapCents,
    avgJobCents,
    topService,
    rainWarning,
    jobsAtRisk,
  });

  const name = ownerName?.trim() || null;

  return {
    generatedAt: new Date().toISOString(),
    greeting: greetingForHour(),
    ownerName: name,
    betaLabel: `Titan Beta · ${monthKeyChicago()}`,
    insights: {
      revenueMonthCents,
      revenueTargetCents: revenueTarget,
      revenueGapCents,
      revenueTodayCents: pulse.todayGrossCents,
      openLeads: leadsRes.count ?? 0,
      followUpsDue,
      followUpsPending: followUps.pending,
      openEstimates: estimatesRes.count ?? 0,
      openExceptions: exceptionsRes.error ? 0 : exceptionsRes.count ?? 0,
      estimatedLostRevenueCents,
      topService,
      rebookCandidates: followUps.pending,
      memoryEvents30d: memory.count30d,
      avgJobCents,
    },
    forecast: {
      projectedMonthCents,
      daysLeftInMonth: daysLeft,
      jobsNeededForGoal,
      confidencePercent: intelligence.forecast.confidencePercent,
      factors: intelligence.forecast.factors,
    },
    weather: {
      configured: weather.ok,
      summary: weather.ok ? weather.description ?? weather.condition ?? null : null,
      rainWarning,
      jobsAtRisk,
    },
    recommendations,
    memoryRecent: memory.recent,
    intelligence,
    growth: {
      tablesReady: growthData.radar.tablesReady && growthData.attribution.tablesReady && growthData.content.tablesReady,
      radar: growthData.radar,
      attribution: growthData.attribution,
      content: growthData.content,
      lastPlan: lastPlanRes.error
        ? null
        : lastPlanRes.data
          ? {
              id: str((lastPlanRes.data as Record<string, unknown>).id),
              prompt: str((lastPlanRes.data as Record<string, unknown>).prompt),
              status: str((lastPlanRes.data as Record<string, unknown>).status) as CommandPlan['status'],
              potentialRevenueCents: cents((lastPlanRes.data as Record<string, unknown>).potential_revenue_cents),
              actions: ((lastPlanRes.data as Record<string, unknown>).actions as CommandPlan['actions']) ?? [],
            }
          : null,
    },
    workspace,
    activity: activityFeed.events,
    roi,
    widgetStats,
    territory,
  };
}
