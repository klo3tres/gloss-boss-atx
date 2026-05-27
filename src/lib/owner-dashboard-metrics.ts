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

export async function loadOwnerDashboardSnapshot(admin: SupabaseClient): Promise<OwnerDashboardSnapshot> {
  const now = new Date().toISOString();
  const [todayPay, weekPay, monthPay] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
  ]);
  const today = summarizePayments(todayPay);
  const week = summarizePayments(weekPay);
  const month = summarizePayments(monthPay);

  const { data: appts } = await admin
    .from('appointments')
    .select(
      'id, status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, balance_due_cents, payment_status, assigned_technician_id',
    )
    .order('scheduled_start', { ascending: true })
    .limit(200);

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

  const alerts: string[] = [];
  if (balanceDueCents > 0) alerts.push(`${displayMoney(balanceDueCents)} open balances across live jobs`);
  const unassigned = todayJobs.filter((j) => j.techName === 'Unassigned').length;
  if (unassigned > 0) alerts.push(`${unassigned} job(s) today still unassigned`);

  return {
    revenueToday: displayMoney(today.grossCents),
    revenueWeek: displayMoney(week.grossCents),
    revenueMonth: displayMoney(month.grossCents),
    balanceDue: displayMoney(balanceDueCents),
    jobsToday: todayJobs.length,
    pipelineCount,
    activeTechCount,
    alerts,
    todayJobs,
    paymentMixMonth: {
      stripeCents: month.stripeCents,
      cashCents: month.cashCents,
      zelleCents: month.zelleCents,
      otherCents: month.otherCents,
      grossCents: month.grossCents,
      paymentCount: month.paymentCount,
    },
  };
}
