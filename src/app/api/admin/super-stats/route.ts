import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';

export const runtime = 'nodejs';

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function startOfWeekIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function sumSucceededPayments(
  supabase: NonNullable<Awaited<ReturnType<typeof tryCreateServerSupabase>>>,
  fromIso: string,
  toIso: string
): Promise<{ cents: number; count: number }> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount_cents')
    .eq('status', 'succeeded')
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  if (error || !data) return { cents: 0, count: 0 };
  const cents = data.reduce((sum, row: { amount_cents: number | null }) => sum + (row.amount_cents ?? 0), 0);
  return { cents, count: data.length };
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
    weekRev,
    monthRev,
    completedMonth,
    latestAppointments,
    latestCustomers,
    latestPayments,
    latestMessages,
    completedForTech,
    technicianProfiles,
    teamRoster,
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_start', t0)
      .lte('scheduled_start', t1),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'assigned', 'in_progress']),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', t0).lte('updated_at', t1),
    supabase.from('payments').select('amount_cents').eq('status', 'succeeded').gte('created_at', t0).lte('created_at', t1),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_payment'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'deposit_paid'),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'super_admin', 'technician']),
    sumSucceededPayments(supabase, weekStart, now),
    sumSucceededPayments(supabase, monthStart, now),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', monthStart).lte('updated_at', now),
    supabase
      .from('appointments')
      .select('id, guest_name, scheduled_start, status, service_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('customers').select('id, full_name, email, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('payments').select('id, amount_cents, status, created_at, appointment_id').order('created_at', { ascending: false }).limit(8),
    supabase.from('messages').select('id, from_name, from_email, subject, status, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('appointments').select('assigned_technician_id').eq('status', 'completed').not('assigned_technician_id', 'is', null),
    supabase.from('profiles').select('id').eq('role', 'technician'),
    supabase.from('profiles').select('id, role, created_at').order('created_at', { ascending: false }).limit(30),
  ]);

  const rows = paymentsTodayRows.data ?? [];
  const revenueTodayCents = rows.reduce((sum, row: { amount_cents: number | null }) => sum + (row.amount_cents ?? 0), 0);

  const techCounts = new Map<string, number>();
  for (const row of completedForTech.data ?? []) {
    const tid = (row as { assigned_technician_id: string | null }).assigned_technician_id;
    if (tid) techCounts.set(tid, (techCounts.get(tid) ?? 0) + 1);
  }
  const techList = (technicianProfiles.data ?? []) as { id: string }[];
  const technicianPerformance = techList
    .map((t) => ({
      id: t.id,
      full_name: null as string | null,
      completed_jobs: techCounts.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.completed_jobs - a.completed_jobs)
    .slice(0, 8);

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
    paymentsTodayCount: rows.length,
    revenueWeekCents: weekRev.cents,
    revenueMonthCents: monthRev.cents,
    paymentsWeekCount: weekRev.count,
    paymentsMonthCount: monthRev.count,
    completedMonth: completedMonth.count ?? 0,
    techniciansRoster: techList.length,
    latestAppointments: latestAppointments.data ?? [],
    latestCustomers: latestCustomers.data ?? [],
    latestPayments: latestPayments.data ?? [],
    latestReviews: [] as unknown[],
    latestMessages: latestMessages.data ?? [],
    technicianPerformance,
    teamRoster: ((teamRoster.data ?? []) as Array<{ id: string; role: string; created_at: string }>).map((r) => ({
      id: r.id,
      full_name: null,
      role: r.role,
      created_at: r.created_at,
    })),
    stripe: {
      connected: Boolean(stripeSecrets.secretKey),
      mode: stripeMode,
      webhookConfigured: Boolean(stripeSecrets.webhookSecret),
      publishableConfigured: Boolean(stripeSecrets.publishableKey),
      keySource: stripeSecrets.source,
    },
  });
}
