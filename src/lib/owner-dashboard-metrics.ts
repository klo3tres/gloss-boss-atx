import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchPaymentsSince,
  startOfMonthIso,
  startOfTodayIso,
  startOfWeekIso,
  summarizePayments,
} from '@/lib/revenue-metrics';
import { displayMoney } from '@/lib/display-format';
import { isTestLikeJob } from '@/lib/tech-job-filters';
import { workOrderPath } from '@/lib/work-order-links';

export type TodayJobRow = {
  id: string;
  guestName: string;
  when: string;
  status: string;
  service: string;
  techName: string;
  href: string;
};

export type OwnerDashboardSnapshot = {
  revenueToday: string;
  revenueWeek: string;
  revenueMonth: string;
  balanceDue: string;
  jobsToday: number;
  pipelineCount: number;
  activeTechCount: number;
  alerts: string[];
  todayJobs: TodayJobRow[];
  /** Month-to-date succeeded payment totals by channel (real query; zeros when none). */
  paymentMixMonth: {
    stripeCents: number;
    cashCents: number;
    zelleCents: number;
    otherCents: number;
    grossCents: number;
    paymentCount: number;
  };
  pendingDeposits: string;
  activeJobsCount: number;
  bookingHealth: number;
  unreadMessageCount: number;
  bookingsThisWeek: number;
  dispatchUnassignedToday: number;
  dispatchCompletedToday: number;
  conversionRate: number;
  customerRetentionRate: number;
  averageTicketSize: string;
  membershipRevenueMonth: string;
  loyaltyParticipation: number;
  jobsTodayCount: number;
  recentPayments: Array<{
    id: string;
    customer: string;
    amount: string;
    method: string;
    status: string;
    time: string;
  }>;
  upcomingAppts: Array<{
    id: string;
    guestName: string;
    service: string;
    time: string;
    status: string;
    price: string;
  }>;
  liveFeed: Array<{
    id: string;
    title: string;
    time: string;
    apptId: string;
  }>;
  techActivity: Array<{
    id: string;
    name: string;
    status: 'active' | 'idle';
    activeJobName?: string;
  }>;
  leadPipeline: {
    newCount: number;
    contactedCount: number;
    convertedCount: number;
    totalActive: number;
  };
  techPerformance: Array<{
    techName: string;
    jobCount: number;
    revenueCents: number;
  }>;
  creditMetrics: {
    outstandingLiabilityCents: number;
    mtdIssuedCents: number;
    mtdRedeemedCents: number;
    expiringSoon: Array<{
      id: string;
      customerName: string;
      amountCents: number;
      remainingCents: number;
      expiresAt: string;
      reason: string;
    }>;
  };
};

function chicagoShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

function isTodayChicago(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  const fmt = (x: Date) =>
    x.toLocaleDateString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt(d) === fmt(n);
}

function startOfRolling30Iso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function loadOwnerDashboardSnapshot(admin: SupabaseClient): Promise<OwnerDashboardSnapshot> {
  const now = new Date().toISOString();
  const { data: apptMeta } = await admin.from('appointments').select('id, guest_email, guest_name, guest_phone').limit(800);
  const apptById = new Map(
    (apptMeta ?? []).map((a) => {
      const row = a as { id: string; guest_email: string | null; guest_name: string | null; guest_phone: string | null };
      return [row.id, row] as const;
    }),
  );
  const sumOpts = { excludeTest: true as const, apptById };

  const [todayPay, weekPay, monthPay, rolling30Pay, leadRowsRes, eventRowsRes, messageCountRes, loyaltyStampsRes, supplyReqsRes] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
    fetchPaymentsSince(admin, startOfRolling30Iso(), now),
    admin.from('leads').select('status, archived, archived_at'),
    admin.from('job_timeline_events').select('appointment_id, event_type, created_at').order('created_at', { ascending: false }).limit(10),
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    admin.from('loyalty_stamps').select('customer_id'),
    admin.from('business_expenses').select('id, category, notes').or('category.ilike.%supply%,notes.ilike.%Supply Request by tech%'),
  ]);
  
  const today = summarizePayments(todayPay, sumOpts);
  const week = summarizePayments(weekPay, sumOpts);
  const month = summarizePayments(monthPay, sumOpts);
  const rolling30 = summarizePayments(rolling30Pay, { ...sumOpts, fromIso: startOfRolling30Iso(), toIso: now });
  const dashboardMonth = month.grossCents > 0 ? month : rolling30;
  const dashboardMonthRows = month.grossCents > 0 ? monthPay : rolling30Pay;
  const unreadMessageCount = messageCountRes.error ? 0 : (messageCountRes.count ?? 0);

  const { data: appts } = await admin
    .from('appointments')
    .select(
      'id, status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, base_price_cents, balance_due_cents, payment_status, assigned_technician_id, deposit_amount_cents',
    )
    .order('scheduled_start', { ascending: true })
    .limit(300);

  const { data: techs } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['technician', 'admin', 'super_admin']);

  const techNames: Record<string, string> = {};
  let activeTechCount = 0;
  for (const t of techs ?? []) {
    const row = t as { id: string; full_name: string | null; email: string | null; role: string };
    techNames[row.id] = row.full_name?.trim() || row.email?.trim() || 'Tech';
    if (row.role === 'technician') activeTechCount += 1;
  }

  const rows = (appts ?? []).filter((a) => !isTestLikeJob(a as Parameters<typeof isTestLikeJob>[0]));
  const balanceDueCents = rows.reduce(
    (s, r) => s + (typeof (r as { balance_due_cents?: number }).balance_due_cents === 'number' ? (r as { balance_due_cents: number }).balance_due_cents : 0),
    0,
  );

  const pipelineStatuses = new Set(['confirmed', 'assigned', 'deposit_paid', 'balance_due', 'awaiting_deposit', 'pending']);
  const pipelineCount = rows.filter((a) => pipelineStatuses.has(String((a as { status?: string }).status ?? '').toLowerCase())).length;

  const todayJobs: TodayJobRow[] = rows
    .filter((a) => isTodayChicago(String((a as { scheduled_start: string }).scheduled_start)))
    .slice(0, 12)
    .map((a) => {
      const row = a as {
        id: string;
        guest_name: string | null;
        scheduled_start: string;
        status: string;
        service_slug: string;
        assigned_technician_id: string | null;
      };
      return {
        id: row.id,
        guestName: row.guest_name?.trim() || 'Guest',
        when: chicagoShort(row.scheduled_start),
        status: row.status,
        service: row.service_slug.replace(/-/g, ' '),
        techName: row.assigned_technician_id ? techNames[row.assigned_technician_id] ?? 'Assigned' : 'Unassigned',
        href: workOrderPath(row.id, { source: 'appointment', shell: 'admin' }),
      };
    });

  // Calculate Phase 2 Metrics
  const activeJobsCount = rows.filter((a) => a.status === 'in_progress').length;
  const jobsTodayCount = todayJobs.length;
  const dispatchUnassignedToday = todayJobs.filter((j) => j.techName === 'Unassigned').length;
  const dispatchCompletedToday = rows.filter((a) => isTodayChicago(String(a.scheduled_start)) && a.status === 'completed').length;
  
  const pendingDepositsCents = rows
    .filter((a) => a.payment_status === 'awaiting_deposit' || a.status === 'pending')
    .reduce((sum, a) => sum + (a.deposit_amount_cents ?? 0), 0);
  const pendingDeposits = displayMoney(pendingDepositsCents);

  const totalApptsCount = rows.length;
  const healthyApptsCount = rows.filter((a) => ['confirmed', 'assigned', 'deposit_paid', 'completed'].includes(a.status)).length;
  const bookingHealth = totalApptsCount > 0 ? Math.round((healthyApptsCount / totalApptsCount) * 100) : 100;

  // Bookings this week
  const startOfWeek = new Date(startOfWeekIso()).getTime();
  const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000;
  const bookingsThisWeek = rows.filter((a) => {
    const time = new Date(a.scheduled_start).getTime();
    return time >= startOfWeek && time < endOfWeek && a.status !== 'cancelled';
  }).length;

  // Customer retention calculation
  const customerEmailCounts: Record<string, number> = {};
  for (const appt of rows) {
    const email = appt.guest_email?.trim().toLowerCase();
    if (email) {
      customerEmailCounts[email] = (customerEmailCounts[email] ?? 0) + 1;
    }
  }
  const uniqueCustomers = Object.keys(customerEmailCounts).length;
  const repeatCustomers = Object.values(customerEmailCounts).filter((c) => c > 1).length;
  const customerRetentionRate = uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0;

  // Average Ticket Size
  const averageTicketSizeCents = dashboardMonth.paymentCount > 0 ? Math.round(dashboardMonth.grossCents / dashboardMonth.paymentCount) : 0;
  const averageTicketSize = displayMoney(averageTicketSizeCents);

  // Membership Revenue Month
  const membershipCents = (dashboardMonthRows ?? [])
    .filter((p) => p.payment_kind === 'membership' || p.payment_method === 'membership')
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const membershipRevenueMonth = displayMoney(membershipCents);

  // Loyalty Participation
  const stampCustomers = new Set((loyaltyStampsRes.data ?? []).map((s) => s.customer_id));
  const loyaltyParticipation = uniqueCustomers > 0 ? Math.round((stampCustomers.size / uniqueCustomers) * 100) : 0;

  // Recent Payments
  const recentPayments = dashboardMonthRows
    .filter((p) => {
      const one = summarizePayments([p], sumOpts);
      return one.grossCents > 0;
    })
    .sort((a, b) => String(b.paid_at ?? b.created_at ?? '').localeCompare(String(a.paid_at ?? a.created_at ?? '')))
    .slice(0, 6)
    .map((p) => {
    const appt = apptById.get(String(p.appointment_id));
    return {
      id: String(p.id ?? p.created_at) + String(p.appointment_id),
      customer: appt?.guest_name || 'Guest',
      amount: displayMoney(p.amount_cents ?? 0),
      method: String(p.payment_method || p.payment_kind || 'Stripe'),
      status: String(p.status || 'succeeded'),
      time: chicagoShort(p.paid_at ?? p.created_at ?? ''),
    };
  });

  // Upcoming Appointments
  const upcomingAppts = rows
    .filter((a) => new Date(a.scheduled_start).getTime() > new Date(now).getTime() && a.status !== 'cancelled')
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      guestName: a.guest_name || 'Guest',
      service: a.service_slug.replace(/-/g, ' '),
      time: chicagoShort(a.scheduled_start),
      status: a.status,
      price: displayMoney(a.base_price_cents ?? 0),
    }));

  // Live Dispatch Feed
  const liveFeed = (eventRowsRes.data ?? []).map((e, idx) => {
    const appt = apptById.get(String(e.appointment_id));
    const name = appt?.guest_name || 'Guest';
    return {
      id: `${e.event_type}-${idx}-${e.created_at}`,
      title: `${name}: ${String(e.event_type).replace(/_/g, ' ')}`,
      time: chicagoShort(e.created_at),
      apptId: String(e.appointment_id),
    };
  });

  // Tech Activity
  const techActivity = Object.keys(techNames).map((tid) => {
    const activeAppt = rows.find((a) => a.assigned_technician_id === tid && a.status === 'in_progress');
    return {
      id: tid,
      name: techNames[tid],
      status: activeAppt ? 'active' as const : 'idle' as const,
      activeJobName: activeAppt ? `${activeAppt.guest_name || 'Guest'} (${activeAppt.service_slug.replace(/-/g, ' ')})` : undefined,
    };
  });

  // Lead Pipeline Stats
  const activeLeads = (leadRowsRes.data ?? []).filter((r) => r.archived !== true && !r.archived_at);
  const newCount = activeLeads.filter((r) => r.status === 'new').length;
  const contactedCount = activeLeads.filter((r) => ['contacted', 'quoted'].includes(r.status)).length;
  const convertedCount = activeLeads.filter((r) => r.status === 'booked').length;
  const leadPipeline = {
    newCount,
    contactedCount,
    convertedCount,
    totalActive: activeLeads.length,
  };

  // Team Performance
  const techPerfMap = new Map<string, { jobCount: number; revenueCents: number }>();
  for (const appt of rows) {
    if (appt.assigned_technician_id && appt.status === 'completed') {
      const current = techPerfMap.get(appt.assigned_technician_id) ?? { jobCount: 0, revenueCents: 0 };
      current.jobCount += 1;
      current.revenueCents += appt.balance_due_cents ?? appt.base_price_cents ?? 0;
      techPerfMap.set(appt.assigned_technician_id, current);
    }
  }
  const techPerformance = Object.keys(techNames).map((tid) => {
    const perf = techPerfMap.get(tid) ?? { jobCount: 0, revenueCents: 0 };
    return {
      techName: techNames[tid],
      jobCount: perf.jobCount,
      revenueCents: perf.revenueCents,
    };
  }).filter(t => t.jobCount > 0);

  const alerts: string[] = [];
  if (balanceDueCents > 0) alerts.push(`${displayMoney(balanceDueCents)} open balances across live jobs`);
  const unassigned = todayJobs.filter((j) => j.techName === 'Unassigned').length;
  if (unassigned > 0) alerts.push(`${unassigned} job(s) today still unassigned`);

  const pendingSuppliesCount = (supplyReqsRes.data ?? []).filter((r) => {
    const note = String(r.notes ?? '').toLowerCase();
    const cat = String(r.category ?? '').toLowerCase();
    const isFulfilled = cat.includes('fulfilled') || note.includes('[manager:fulfilled');
    const isDenied = cat.includes('denied') || note.includes('[manager:denied');
    const isOrdered = note.includes('[manager:ordered');
    return !isFulfilled && !isDenied && !isOrdered;
  }).length;
  if (pendingSuppliesCount > 0) {
    alerts.push(`${pendingSuppliesCount} pending technician supply request(s) need review — check Admin > Supply Requests`);
  }

  // Credit Metrics calculation
  const startOfMonth = startOfMonthIso();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [outstandingRes, issuedRes, redeemedRes, expiringRes] = await Promise.all([
    admin.from('customer_credits').select('remaining_cents').in('status', ['active', 'partially_used']),
    admin.from('customer_credits').select('amount_cents').gte('issued_at', startOfMonth).neq('status', 'voided'),
    admin.from('customer_credit_redemptions').select('amount_cents').gte('redeemed_at', startOfMonth),
    admin.from('customer_credits').select('id, amount_cents, remaining_cents, expires_at, reason, customers(full_name, email)').in('status', ['active', 'partially_used']).lte('expires_at', thirtyDaysFromNow.toISOString()).gte('expires_at', now).order('expires_at', { ascending: true }).limit(10),
  ]);

  const outstandingLiabilityCents = (outstandingRes.data ?? []).reduce((sum, c) => sum + (c.remaining_cents ?? 0), 0);
  const mtdIssuedCents = (issuedRes.data ?? []).reduce((sum, c) => sum + (c.amount_cents ?? 0), 0);
  const mtdRedeemedCents = (redeemedRes.data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  const expiringSoon = (expiringRes.data ?? []).map((c: any) => ({
    id: c.id,
    customerName: c.customers?.full_name || c.customers?.email || 'Valued Client',
    amountCents: c.amount_cents,
    remainingCents: c.remaining_cents,
    expiresAt: c.expires_at,
    reason: c.reason,
  }));

  if (expiringSoon.length > 0) {
    alerts.push(`${expiringSoon.length} store credit(s) expiring in the next 30 days`);
  }

  return {
    revenueToday: displayMoney(today.grossCents),
    revenueWeek: displayMoney(week.grossCents),
    revenueMonth: displayMoney(dashboardMonth.grossCents),
    balanceDue: displayMoney(balanceDueCents),
    jobsToday: todayJobs.length,
    pipelineCount,
    activeTechCount,
    alerts,
    todayJobs,
    paymentMixMonth: {
      stripeCents: dashboardMonth.stripeCents,
      cashCents: dashboardMonth.cashCents,
      zelleCents: dashboardMonth.zelleCents,
      otherCents: dashboardMonth.otherCents,
      grossCents: dashboardMonth.grossCents,
      paymentCount: dashboardMonth.paymentCount,
    },
    pendingDeposits,
    activeJobsCount,
    bookingHealth,
    unreadMessageCount,
    bookingsThisWeek,
    dispatchUnassignedToday,
    dispatchCompletedToday,
    conversionRate: activeLeads.length > 0 ? Math.round((convertedCount / activeLeads.length) * 100) : 0,
    customerRetentionRate,
    averageTicketSize,
    membershipRevenueMonth,
    loyaltyParticipation,
    jobsTodayCount,
    recentPayments,
    upcomingAppts,
    liveFeed,
    techActivity,
    leadPipeline,
    techPerformance,
    creditMetrics: {
      outstandingLiabilityCents,
      mtdIssuedCents,
      mtdRedeemedCents,
      expiringSoon,
    },
  };
}
