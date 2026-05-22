'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { submitPromoteRoleForm } from '@/lib/admin/super-team-actions';
import { GB_NAV_SIM_EVENT, GB_NAV_SIM_KEY, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { parseAppRole } from '@/lib/auth/role-resolution';
import type { AppRole } from '@/lib/auth/roles';

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'technician', label: 'Technician' },
  { value: 'customer', label: 'Customer' },
];

type Stats = {
  jobsToday: number;
  activeJobs: number;
  openPoolLeads: number;
  assignedDispatchJobs: number;
  completedToday: number;
  revenueTodayCents: number;
  pendingDeposits: number;
  depositPaidAwaitingNext: number;
  unreadMessages: number;
  activeServices: number;
  staffProfiles: number;
  paymentsTodayCount: number;
  revenueWeekCents: number;
  revenueMonthCents: number;
  paymentsWeekCount: number;
  paymentsMonthCount: number;
  completedMonth: number;
  timelineEvents24h: number;
  intakeSubmissionsMonth: number;
  signedAgreementsMonth: number;
  leadsTotal: number;
  leadsBooked: number;
  leadConversionPercent: number | null;
  avgJobMinutesAll: number | null;
  longestTimerSessions: Array<{ minutes: number; serviceSlug: string }>;
  techniciansRoster: number;
  latestAppointments: Array<{
    id: string;
    guest_name: string | null;
    scheduled_start: string;
    status: string;
    service_slug: string;
    created_at: string;
  }>;
  latestCustomers: Array<{ id: string; full_name: string | null; email: string; created_at: string }>;
  latestPayments: Array<{ id: string; amount_cents: number; status: string; created_at: string; appointment_id: string }>;
  latestReviews: unknown[];
  latestMessages: Array<{
    id: string;
    from_name: string;
    from_email: string;
    subject: string | null;
    status: string;
    created_at: string;
  }>;
  technicianPerformance: Array<{
    id: string;
    full_name: string | null;
    completed_jobs: number;
    avg_job_minutes: number | null;
  }>;
  teamRoster: Array<{ id: string; full_name: string | null; role: string; created_at: string }>;
  stripe: {
    connected: boolean;
    mode: string;
    webhookConfigured: boolean;
    publishableConfigured: boolean;
    keySource: string;
  };
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function SkeletonGrid() {
  return (
    <div className='grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className='h-28 rounded-2xl border border-gold/10 bg-zinc-900/80' />
      ))}
    </div>
  );
}

function StatCard({ label, value, hint, delay, href }: { label: string; value: string | number; hint?: string; delay: number; href?: string }) {
  const content = (
    <>
      <p className='text-[10px] font-bold uppercase tracking-[0.2em] text-gold-soft'>{label}</p>
      <p className='mt-2 text-2xl font-black text-white'>{value}</p>
      {hint ? <p className='mt-1 text-xs text-zinc-500'>{hint}</p> : null}
    </>
  );
  return (
    <motion.div
      initial={{ opacity: 1, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className='rounded-2xl border border-gold/25 bg-gradient-to-b from-zinc-950/95 to-black/90 shadow-[0_0_22px_rgba(212,166,77,0.08)] backdrop-blur-md transition hover:border-gold/50 hover:shadow-[0_0_38px_rgba(212,166,77,0.22)]'
    >
      {href ? (
        <Link href={href} className='block rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-gold/60'>{content}</Link>
      ) : (
        <div className='p-4'>{content}</div>
      )}
    </motion.div>
  );
}

function RevenueChart({ stats }: { stats: Stats }) {
  const bars = [
    { label: 'Today', cents: stats.revenueTodayCents, href: '/admin/payments?range=today' },
    { label: 'Week', cents: stats.revenueWeekCents, href: '/admin/payments?range=week' },
    { label: 'Month', cents: stats.revenueMonthCents, href: '/admin/payments?range=month' },
  ];
  const max = Math.max(1, ...bars.map((b) => b.cents));
  return (
    <div className='rounded-3xl border border-gold/25 bg-zinc-950/90 p-6 shadow-[0_0_32px_rgba(212,166,77,0.08)] backdrop-blur-md'>
      <p className='text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Revenue</p>
      <p className='mt-1 text-sm text-zinc-400'>Click a bar to open payments for that period.</p>
      <div className='mt-8 flex h-48 items-end justify-between gap-4'>
        {bars.map((b) => (
          <Link key={b.label} href={b.href} className='group flex flex-1 flex-col items-center gap-2'>
            <motion.div
              whileHover={{ scale: 1.03 }}
              style={{ height: `${Math.max(12, Math.round((b.cents / max) * 100))}%` }}
              className='w-full max-w-[72px] min-h-[12px] rounded-t-xl bg-gradient-to-t from-gold/25 via-gold/60 to-gold shadow-[0_0_24px_rgba(212,175,55,0.25)] transition group-hover:shadow-[0_0_36px_rgba(212,175,55,0.4)]'
            />
            <span className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>{b.label}</span>
            <span className='font-mono text-sm font-bold text-gold-soft group-hover:underline'>{money(b.cents)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PulseChart({ stats }: { stats: Stats }) {
  const max = Math.max(1, stats.jobsToday + stats.activeJobs + stats.completedToday, stats.pendingDeposits);
  const bars = [
    { label: 'Today', h: Math.round((stats.jobsToday / max) * 100) },
    { label: 'Active', h: Math.round((stats.activeJobs / max) * 100) },
    { label: 'Done', h: Math.round((stats.completedToday / max) * 100) },
    { label: 'Deposits', h: Math.round((stats.pendingDeposits / max) * 100) },
  ];
  return (
    <div className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_20px_rgba(212,166,77,0.05)] backdrop-blur-md'>
      <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Pipeline pulse</p>
      <p className='mt-1 text-sm text-zinc-400'>Relative load across booking stages (today vs active vs awaiting deposit).</p>
      <div className='mt-6 flex h-40 items-end justify-between gap-2'>
        {bars.map((b) => (
          <div key={b.label} className='flex flex-1 flex-col items-center gap-2'>
            <div
              style={{ height: `${Math.max(12, b.h)}%` }}
              className='w-full max-w-[52px] min-h-[8px] rounded-t-lg bg-gradient-to-t from-gold/20 to-gold/70'
            />
            <span className='text-[10px] font-bold uppercase tracking-wider text-zinc-500'>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListCard({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 1, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className='rounded-2xl border border-gold/20 bg-zinc-950/85 p-4 shadow-[0_0_18px_rgba(212,166,77,0.05)] backdrop-blur-md'
    >
      <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>{title}</p>
      <div className='mt-3 max-h-64 space-y-2 overflow-y-auto text-xs text-zinc-300'>{children}</div>
    </motion.div>
  );
}

export function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simNav, setSimNav] = useState<DashboardShellRole | null>(null);
  const [promoteBanner, setPromoteBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const err = u.searchParams.get('promoteErr');
      const ok = u.searchParams.get('promoteOk');
      if (err) setPromoteBanner({ kind: 'err', text: err });
      else if (ok) setPromoteBanner({ kind: 'ok', text: 'Role update saved to the database.' });
      if (err || ok) {
        u.searchParams.delete('promoteErr');
        u.searchParams.delete('promoteOk');
        const qs = u.searchParams.toString();
        window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GB_NAV_SIM_KEY)?.trim();
      const allowed: DashboardShellRole[] = ['super_admin', 'admin', 'technician', 'customer'];
      if (raw && (allowed as string[]).includes(raw)) setSimNav(raw as DashboardShellRole);
      else setSimNav(null);
    } catch {
      setSimNav(null);
    }
  }, []);

  const setSimulation = (value: string) => {
    try {
      const allowed: DashboardShellRole[] = ['super_admin', 'admin', 'technician', 'customer'];
      if (!value || !allowed.includes(value as DashboardShellRole)) {
        sessionStorage.removeItem(GB_NAV_SIM_KEY);
        setSimNav(null);
      } else {
        sessionStorage.setItem(GB_NAV_SIM_KEY, value);
        setSimNav(value as DashboardShellRole);
      }
      window.dispatchEvent(new Event(GB_NAV_SIM_EVENT));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/super-stats')
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<Stats>;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className='rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200'>
        Could not load live metrics: {error}
      </p>
    );
  }

  if (!stats) {
    return (
      <div className='space-y-4'>
        <p className='text-sm text-zinc-400'>Syncing owner metrics from Supabase…</p>
        <SkeletonGrid />
      </div>
    );
  }

  const stripeBadge =
    stats.stripe.mode === 'live' ? 'Live' : stats.stripe.mode === 'test' ? 'Test' : 'Unknown';

  return (
    <div className='relative min-h-[420px]'>
      <div
        className='pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden'
        aria-hidden
      >
        <span className='text-center text-[clamp(3rem,14vw,11rem)] font-black uppercase leading-none tracking-[0.14em] text-white/[0.05]'>
          Gloss Boss ATX
        </span>
      </div>
      <div className='relative z-10 space-y-10'>
      <div className='rounded-2xl border border-amber-500/35 bg-amber-500/5 p-4 text-sm text-zinc-200'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-amber-200/90'>Navigation preview (UI only)</p>
        <p className='mt-1 text-xs text-zinc-500'>Does not change your database role — only the sidebar link set while you navigate.</p>
        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <label className='text-xs text-zinc-400'>
            Act as
            <select
              className='ml-2 rounded-lg border border-white/15 bg-black px-2 py-1.5 text-sm text-white'
              value={simNav ?? ''}
              onChange={(e) => setSimulation(e.target.value)}
            >
              <option value=''>Default (super admin)</option>
              <option value='super_admin'>Super admin</option>
              <option value='admin'>Admin</option>
              <option value='technician'>Technician</option>
              <option value='customer'>Customer</option>
            </select>
          </label>
        </div>
      </div>

      <div className='rounded-2xl border border-gold/30 bg-gradient-to-r from-black via-zinc-950 to-black p-5 shadow-[0_0_32px_rgba(212,166,77,0.12)] backdrop-blur-md'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft'>Stripe</p>
            <p className='mt-2 text-lg font-black text-white'>Billing fabric</p>
            <p className='mt-1 text-sm text-zinc-400'>
              {stats.stripe.connected ? 'Secret key detected' : 'Secret key missing'} · Keys from {stats.stripe.keySource}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                stats.stripe.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              {stats.stripe.connected ? 'Connected' : 'Not connected'}
            </span>
            <span className='rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold-soft'>
              {stripeBadge} mode
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                stats.stripe.webhookConfigured ? 'bg-white/10 text-zinc-200' : 'bg-red-500/15 text-red-200'
              }`}
            >
              Webhook {stats.stripe.webhookConfigured ? 'configured' : 'missing'}
            </span>
          </div>
        </div>
      </div>

      <section className='rounded-2xl border border-gold/30 bg-zinc-950/90 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>CRM control center</p>
        <div className='mt-4 flex flex-wrap gap-2'>
          <Link href='/admin/customers' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Customers
          </Link>
          <Link href='/admin/team' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Team
          </Link>
          <Link href='/admin/services' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Pricing
          </Link>
          <Link href='/admin/pricing' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Deals
          </Link>
          <Link href='/admin/cms' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            CMS
          </Link>
          <Link href='/admin/intake' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Intake
          </Link>
          <Link href='/admin/leads' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Leads
          </Link>
          <Link href='/admin/agreements' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Agreements
          </Link>
          <Link href='/admin/payments' className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase text-emerald-200 hover:bg-emerald-500/15'>
            Payments / Receipts
          </Link>
          <Link href='/admin/work-orders' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Work Orders
          </Link>
          <Link href='/admin/dispatch' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Dispatch
          </Link>
          <Link href='/admin/booking-health' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Booking Health
          </Link>
          <Link href='/admin/messages' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            Messages
          </Link>
          <Link href='/admin/system-status' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'>
            System Status
          </Link>
        </div>
      </section>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Revenue today' value={money(stats.revenueTodayCents)} hint={`${stats.paymentsTodayCount} payment(s)`} delay={0} href='/admin/payments?range=today' />
        <StatCard label='Revenue (week)' value={money(stats.revenueWeekCents)} hint={`${stats.paymentsWeekCount} payment(s)`} delay={0.04} href='/admin/payments?range=week' />
        <StatCard label='Revenue (month)' value={money(stats.revenueMonthCents)} hint={`${stats.paymentsMonthCount} payment(s)`} delay={0.08} href='/admin/payments?range=month' />
        <StatCard label='Completed (month)' value={stats.completedMonth} hint='Jobs closed this month' delay={0.12} />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Jobs today' value={stats.jobsToday} hint='Scheduled start today' delay={0.14} href='/admin/work-orders?filter=today' />
        <StatCard label='Active jobs' value={stats.activeJobs} hint='Confirmed → in progress' delay={0.16} href='/admin/work-orders?filter=active' />
        <StatCard label='Completed today' value={stats.completedToday} delay={0.18} />
        <StatCard label='Technicians (roster)' value={stats.techniciansRoster} hint='Presence not tracked — roster size' delay={0.2} href='/admin/team' />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Open lead pool' value={stats.openPoolLeads} hint='Unclaimed pool leads' delay={0.29} href='/admin/leads' />
        <StatCard label='Assigned jobs' value={stats.assignedDispatchJobs} hint='With technician · active statuses' delay={0.3} />
        <StatCard label='Avg job time (timers)' value={stats.avgJobMinutesAll != null ? `${stats.avgJobMinutesAll} min` : '—'} hint='Stopped timers sample' delay={0.31} />
        <StatCard
          label='Lead conversion'
          value={stats.leadConversionPercent != null ? `${stats.leadConversionPercent}%` : '—'}
          hint={stats.leadsTotal ? `${stats.leadsBooked} booked / ${stats.leadsTotal} leads` : 'No leads yet'}
          delay={0.32}
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Timeline events (24h)' value={stats.timelineEvents24h} hint='job_timeline_events' delay={0.33} />
        <StatCard label='Intakes (month)' value={stats.intakeSubmissionsMonth} hint='intake_submissions' delay={0.34} />
        <StatCard label='Signed agreements (month)' value={stats.signedAgreementsMonth} delay={0.35} />
        <StatCard label='Post-deposit' value={stats.depositPaidAwaitingNext} hint='Deposit paid — next CRM steps' delay={0.36} />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Pending deposits' value={stats.pendingDeposits} hint='Awaiting payment' delay={0.37} />
        <StatCard label='Unread messages' value={stats.unreadMessages} delay={0.38} />
        <StatCard label='Active services' value={stats.activeServices} delay={0.39} />
        <StatCard
          label='Longest timer (peak)'
          value={stats.longestTimerSessions[0] ? `${stats.longestTimerSessions[0].minutes} min` : '—'}
          hint={stats.longestTimerSessions[0] ? stats.longestTimerSessions[0].serviceSlug.replace(/-/g, ' ') : 'Stopped timers'}
          delay={0.4}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <RevenueChart stats={stats} />
        <PulseChart stats={stats} />
        <div className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_20px_rgba(212,166,77,0.05)] backdrop-blur-md'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Longest timer sessions</p>
          <p className='mt-1 text-sm text-zinc-400'>Top stopped timers with service slug (real data).</p>
          <ul className='mt-4 space-y-2'>
            {stats.longestTimerSessions.length === 0 ? (
              <li className='text-sm text-zinc-500'>No completed timers yet.</li>
            ) : (
              stats.longestTimerSessions.map((row, i) => (
                <li key={i} className='flex justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200'>
                  <span>{row.serviceSlug.replace(/-/g, ' ')}</span>
                  <span className='font-mono text-gold-soft'>{row.minutes} min</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='lg:col-span-2 rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_20px_rgba(212,166,77,0.05)] backdrop-blur-md'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Technician performance</p>
          <p className='mt-1 text-sm text-zinc-400'>Completed jobs and average stopped-timer duration by technician (sample).</p>
          <ul className='mt-4 space-y-2'>
            {stats.technicianPerformance.length === 0 ? (
              <li className='text-sm text-zinc-500'>No technician completions yet.</li>
            ) : (
              stats.technicianPerformance.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/team`}
                    className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm transition hover:border-gold/40 hover:bg-gold/5'
                  >
                    <span className='flex items-center gap-3'>
                      <span className='flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-xs font-black text-gold-soft'>
                        {(t.full_name ?? 'T').slice(0, 2).toUpperCase()}
                      </span>
                      <span className='text-zinc-200'>{t.full_name ?? 'Technician'}</span>
                    </span>
                    <span className='font-mono text-gold-soft'>
                      {t.completed_jobs} done
                      {t.avg_job_minutes != null ? ` · ~${t.avg_job_minutes}m` : ''}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div>
        <h3 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>CRM snapshot</h3>
        <div className='mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          <ListCard title='Latest appointments' delay={0.1}>
            {stats.latestAppointments.map((a) => (
              <div key={a.id} className='rounded-lg border border-white/10 bg-black/20 px-2 py-2'>
                <p className='font-semibold text-white'>{a.guest_name ?? 'Guest'}</p>
                <p className='text-zinc-500'>
                  {a.service_slug} · {new Date(a.scheduled_start).toLocaleString()}
                </p>
                <p className='text-gold-soft/90'>{a.status}</p>
              </div>
            ))}
          </ListCard>
          <ListCard title='Latest customers' delay={0.14}>
            {stats.latestCustomers.map((c) => (
              <div key={c.id} className='rounded-lg border border-white/10 bg-black/20 px-2 py-2'>
                <p className='font-semibold text-white'>{c.full_name ?? c.email}</p>
                <p className='text-zinc-500'>{c.email}</p>
              </div>
            ))}
          </ListCard>
          <ListCard title='Latest payments' delay={0.18}>
            {stats.latestPayments.map((p) => (
              <div key={p.id} className='rounded-lg border border-white/10 bg-black/20 px-2 py-2'>
                <p className='font-semibold text-white'>{money(p.amount_cents)}</p>
                <p className='text-zinc-500'>{p.status}</p>
              </div>
            ))}
          </ListCard>
          <ListCard title='Latest reviews' delay={0.22}>
            <p className='text-zinc-500'>Reviews module not wired yet — schema hook reserved.</p>
          </ListCard>
          <ListCard title='Latest messages' delay={0.26}>
            {stats.latestMessages.map((m) => (
              <div key={m.id} className='rounded-lg border border-white/10 bg-black/20 px-2 py-2'>
                <p className='font-semibold text-white'>{m.from_name}</p>
                <p className='text-zinc-500'>{m.subject ?? '(no subject)'}</p>
                <p className='text-gold-soft/90'>{m.status}</p>
              </div>
            ))}
          </ListCard>
        </div>
      </div>

      <div className='rounded-2xl border border-gold/25 bg-zinc-950/90 p-5 shadow-[0_0_24px_rgba(212,166,77,0.08)] backdrop-blur-md'>
        {promoteBanner ? (
          <div
            role='alert'
            className={`mb-4 rounded-xl border p-3 text-sm ${
              promoteBanner.kind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-500/45 bg-amber-500/10 text-amber-100'
            }`}
          >
            {promoteBanner.text}
          </div>
        ) : null}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Team management</p>
            <p className='mt-1 text-sm text-zinc-400'>Promote roles via service role on the server. Deactivate user requires a future profiles flag.</p>
          </div>
          <Link href='/admin/system-status' className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
            System status
          </Link>
        </div>
        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[640px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-4'>Name</th>
                <th className='py-2 pr-4'>Role</th>
                <th className='py-2'>Action</th>
              </tr>
            </thead>
            <tbody>
              {stats.teamRoster.map((row) => {
                const rosterRole = parseAppRole(row.role);
                return (
                  <tr key={row.id} className='border-b border-white/5'>
                    <td className='py-3 pr-4 text-zinc-200'>{row.full_name ?? '—'}</td>
                    <td className='py-3 pr-4 font-mono text-xs text-gold-soft/90'>{row.role}</td>
                    <td className='py-3'>
                      <form action={submitPromoteRoleForm} className='flex flex-wrap items-center gap-2'>
                        <input type='hidden' name='profileId' value={row.id} />
                        <select
                          name='role'
                          defaultValue={rosterRole ?? ''}
                          required
                          className='rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-xs text-white'
                        >
                          {rosterRole ? null : (
                            <option value='' disabled>
                              Invalid role — pick a valid role
                            </option>
                          )}
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type='submit'
                        className='rounded-lg bg-gold px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110'
                      >
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 backdrop-blur-md'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>CMS & operations</p>
          <p className='mt-2 text-sm text-zinc-400'>Homepage gallery, copy, offers, and service pricing live under Website CMS and Services.</p>
          <div className='mt-4 grid gap-2 sm:grid-cols-2'>
            <Link href='/admin/cms' className='rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-gold-soft transition hover:bg-gold/20'>
              Website & gallery CMS
            </Link>
            <Link href='/admin/services' className='rounded-lg bg-gold px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110'>
              Services & pricing
            </Link>
            <Link href='/admin/pricing' className='rounded-lg border border-white/15 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white transition hover:border-gold/40'>
              Deals & promos
            </Link>
            <Link href='/admin/messages' className='rounded-lg border border-white/15 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white transition hover:border-gold/40'>
              Message center
            </Link>
          </div>
        </div>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-5 backdrop-blur-md'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Control deck</p>
          <div className='mt-4 flex flex-col gap-2'>
            <Link href='/admin/settings/stripe' className='rounded-lg border border-white/15 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white transition hover:border-gold/40'>
              Stripe & billing
            </Link>
            <Link href='/admin/system-status' className='rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-gold-soft transition hover:bg-gold/20'>
              Deployment checklist
            </Link>
          </div>
          <p className='mt-4 text-xs text-zinc-500'>Staff accounts on file: {stats.staffProfiles}</p>
        </div>
      </div>
      </div>
    </div>
  );
}
