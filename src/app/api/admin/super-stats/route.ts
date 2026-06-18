import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';
import { fetchPaymentsSince, startOfMonthIso, startOfTodayIso, startOfWeekIso, summarizePayments } from '@/lib/revenue-metrics';
import { isValidTimerForAnalytics, timerDurationSeconds } from '@/lib/timer-integrity';

export const runtime = 'nodejs';

function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function sumCanonicalRevenue(
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>,
  fromIso: string,
  toIso: string,
): Promise<{ cents: number; count: number }> {
  const payments = await fetchPaymentsSince(admin, fromIso, toIso);
  const summary = summarizePayments(payments, { excludeTest: true, fromIso, toIso });
  return { cents: summary.grossCents, count: summary.paymentCount };
}

export async function GET() {
  const supabase = await tryCreateServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const gate = await requireProfileRoles(supabase, ['super_admin']);
  if (!gate.ok) return gate.response;

  const t0 = startOfTodayIso();
  const t1 = endOfTodayIso();
  const weekStart = startOfWeekIso();
  const monthStart = startOfMonthIso();
  const now = nowIso();

  const admin = tryCreateAdminSupabase();
  const stripeSecrets = await getStripeSecrets(admin);

  const last24h = new Date(Date.now() - 86400000).toISOString();

  const weekRev = admin ? await sumCanonicalRevenue(admin, weekStart, now) : { cents: 0, count: 0 };
  const monthRev = admin ? await sumCanonicalRevenue(admin, monthStart, now) : { cents: 0, count: 0 };

  const [
    apptToday,
    activeJobs,
    completedToday,
    paymentsTodayRows,
    awaitingPayment,
    depositPaid,
    messagesNew,
    servicesCount,
    profilesStaff,
    completedMonth,
    latestAppointments,
    latestCustomers,
    latestPayments,
    latestMessages,
    completedForTech,
    technicianProfiles,
    teamRoster,
    openPoolLeads,
    assignedDispatchJobs,
    timelineLast24h,
    intakeSubmissionsMonth,
    signedAgreementsMonth,
    leadsTotal,
    leadsBooked,
    timerSamples,
    longTimerRows,
    timerByTechRows,
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_start', t0)
      .lte('scheduled_start', t1)
      .is('archived_at', null)
      .is('deleted_at', null)
      .neq('status', 'deleted')
      .neq('status', 'test_comped')
      .not('guest_name', 'ilike', '%test%'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'assigned', 'in_progress'])
      .is('archived_at', null)
      .is('deleted_at', null)
      .neq('status', 'test_comped'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').is('archived_at', null).gte('updated_at', t0).lte('updated_at', t1),
    supabase.from('payments').select('amount_cents').eq('status', 'succeeded').gte('created_at', t0).lte('created_at', t1),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_payment').is('archived_at', null),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'deposit_paid').is('archived_at', null),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'super_admin', 'technician']),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').is('archived_at', null).gte('updated_at', monthStart).lte('updated_at', now),
    supabase
      .from('appointments')
      .select('id, guest_name, scheduled_start, status, service_slug, created_at')
      .is('archived_at', null)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('customers').select('id, full_name, email, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('payments').select('id, amount_cents, status, created_at, appointment_id').order('created_at', { ascending: false }).limit(8),
    supabase.from('messages').select('id, from_name, from_email, subject, status, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('appointments').select('assigned_technician_id').eq('status', 'completed').not('assigned_technician_id', 'is', null),
    supabase.from('profiles').select('id, full_name').eq('role', 'technician'),
    supabase.from('profiles').select('id, role, full_name, created_at').order('created_at', { ascending: false }).limit(30),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('in_pool', true).is('assigned_technician_id', null),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .not('assigned_technician_id', 'is', null)
      .in('status', ['assigned', 'confirmed', 'in_progress']),
    supabase.from('job_timeline_events').select('id', { count: 'exact', head: true }).gte('created_at', last24h),
    supabase.from('intake_submissions').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('signed_agreements').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'booked'),
    supabase
      .from('tech_job_timers')
      .select('duration_seconds, appointment_id, fallback_booking_id, work_order_id, customer_id, started_at, ended_at, created_at, running, status')
      .limit(800),
    supabase
      .from('tech_job_timers')
      .select('duration_seconds, appointment_id, fallback_booking_id, work_order_id, customer_id, started_at, ended_at, created_at, running, status')
      .order('duration_seconds', { ascending: false })
      .limit(80),
    supabase
      .from('tech_job_timers')
      .select('technician_id, duration_seconds, appointment_id, fallback_booking_id, work_order_id, customer_id, started_at, ended_at, created_at, running, status')
      .limit(1500),
  ]);

  const rows = paymentsTodayRows.data ?? [];
  const todaySummary = admin
    ? summarizePayments(await fetchPaymentsSince(admin, t0, t1), { excludeTest: true, fromIso: t0, toIso: t1 })
    : { grossCents: rows.reduce((sum, row: { amount_cents: number | null }) => sum + (row.amount_cents ?? 0), 0), paymentCount: rows.length };
  const revenueTodayCents = todaySummary.grossCents;

  const techCounts = new Map<string, number>();
  for (const row of completedForTech.data ?? []) {
    const tid = (row as { assigned_technician_id: string | null }).assigned_technician_id;
    if (tid) techCounts.set(tid, (techCounts.get(tid) ?? 0) + 1);
  }

  const byTechDurations = new Map<string, number[]>();
  for (const row of timerByTechRows.data ?? []) {
    const r = row as Record<string, unknown> & { technician_id?: string | null };
    const seconds = timerDurationSeconds(r);
    if (!r.technician_id || !seconds || !isValidTimerForAnalytics(r)) continue;
    const arr = byTechDurations.get(r.technician_id) ?? [];
    arr.push(seconds);
    byTechDurations.set(r.technician_id, arr);
  }

  const techList = (technicianProfiles.data ?? []) as { id: string; full_name: string | null }[];
  const technicianPerformance = techList
    .map((t) => {
      const secs = byTechDurations.get(t.id) ?? [];
      const avgMin = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length / 60) : null;
      return {
        id: t.id,
        full_name: t.full_name,
        completed_jobs: techCounts.get(t.id) ?? 0,
        avg_job_minutes: avgMin,
      };
    })
    .sort((a, b) => b.completed_jobs - a.completed_jobs)
    .slice(0, 8);

  const durs = (timerSamples.data ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return isValidTimerForAnalytics(row) ? timerDurationSeconds(row) : null;
    })
    .filter((n): n is number => typeof n === 'number' && n > 0);
  const avgJobMinutesAll = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 60) : null;

  const ltRows = ((longTimerRows.data ?? []) as Array<Record<string, unknown> & {
    appointment_id: string | null;
    started_at?: string | null;
    created_at?: string | null;
  }>)
    .filter((row) => isValidTimerForAnalytics(row))
    .map((row) => ({ ...row, duration_seconds: timerDurationSeconds(row) ?? 0 }))
    .filter((row) => row.duration_seconds > 0)
    .sort((a, b) => b.duration_seconds - a.duration_seconds)
    .slice(0, 8);
  const apptIdsForLong = [...new Set(ltRows.map((r) => r.appointment_id).filter(Boolean))] as string[];
  const apptMeta = new Map<string, { service_slug: string; guest_name: string; vehicle_description: string; scheduled_start: string }>();
  if (apptIdsForLong.length > 0) {
    const { data: apptSlugRows } = await supabase
      .from('appointments')
      .select('id, service_slug, guest_name, vehicle_description, scheduled_start')
      .in('id', apptIdsForLong);
    for (const row of apptSlugRows ?? []) {
      const a = row as {
        id: string;
        service_slug?: string | null;
        guest_name?: string | null;
        vehicle_description?: string | null;
        scheduled_start?: string | null;
      };
      apptMeta.set(a.id, {
        service_slug: String(a.service_slug ?? '—'),
        guest_name: String(a.guest_name ?? 'Customer'),
        vehicle_description: String(a.vehicle_description ?? '—'),
        scheduled_start: String(a.scheduled_start ?? a.id),
      });
    }
  }
  const longestTimerSessions = ltRows.map((r) => {
    const meta = r.appointment_id ? apptMeta.get(r.appointment_id) : undefined;
    return {
      minutes: Math.round((r.duration_seconds ?? 0) / 60),
      serviceSlug: meta?.service_slug ?? '—',
      guestName: meta?.guest_name ?? '—',
      vehicle: meta?.vehicle_description ?? '—',
      scheduledStart: meta?.scheduled_start ?? r.started_at ?? r.created_at ?? '',
      appointmentId: r.appointment_id,
    };
  });

  const leadsTotalCount = leadsTotal.count ?? 0;
  const leadsBookedCount = leadsBooked.count ?? 0;
  const leadConversionPercent =
    leadsTotalCount > 0 ? Math.round((leadsBookedCount / leadsTotalCount) * 1000) / 10 : null;

  const sk = stripeSecrets.secretKey ?? '';
  const stripeMode: 'test' | 'live' | 'unknown' = sk.startsWith('sk_test') ? 'test' : sk.startsWith('sk_live') ? 'live' : 'unknown';

  return NextResponse.json({
    jobsToday: apptToday.count ?? 0,
    activeJobs: activeJobs.count ?? 0,
    completedToday: completedToday.count ?? 0,
    revenueTodayCents,
    pendingDeposits: awaitingPayment.count ?? 0,
    depositPaidAwaitingNext: depositPaid.count ?? 0,
    unreadMessages: messagesNew.count ?? 0,
    activeServices: servicesCount.count ?? 0,
    staffProfiles: profilesStaff.count ?? 0,
    paymentsTodayCount: todaySummary.paymentCount,
    revenueWeekCents: weekRev.cents,
    revenueMonthCents: monthRev.cents,
    paymentsWeekCount: weekRev.count,
    paymentsMonthCount: monthRev.count,
    completedMonth: completedMonth.count ?? 0,
    techniciansRoster: techList.length,
    openPoolLeads: openPoolLeads.count ?? 0,
    assignedDispatchJobs: assignedDispatchJobs.count ?? 0,
    timelineEvents24h: timelineLast24h.count ?? 0,
    intakeSubmissionsMonth: intakeSubmissionsMonth.count ?? 0,
    signedAgreementsMonth: signedAgreementsMonth.count ?? 0,
    leadsTotal: leadsTotalCount,
    leadsBooked: leadsBookedCount,
    leadConversionPercent,
    avgJobMinutesAll,
    longestTimerSessions,
    latestAppointments: latestAppointments.data ?? [],
    latestCustomers: latestCustomers.data ?? [],
    latestPayments: latestPayments.data ?? [],
    latestReviews: [] as unknown[],
    latestMessages: latestMessages.data ?? [],
    technicianPerformance,
    teamRoster: ((teamRoster.data ?? []) as Array<{ id: string; role: string; full_name: string | null; created_at: string }>).map(
      (r) => ({
        id: r.id,
        full_name: r.full_name,
        role: r.role,
        created_at: r.created_at,
      }),
    ),
    stripe: {
      connected: Boolean(stripeSecrets.secretKey),
      mode: stripeMode,
      webhookConfigured: Boolean(stripeSecrets.webhookSecret),
      publishableConfigured: Boolean(stripeSecrets.publishableKey),
      keySource: stripeSecrets.source,
    },
  });
}
