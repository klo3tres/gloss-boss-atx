'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { submitPromoteRoleForm } from '@/lib/admin/super-team-actions';
import { GB_NAV_SIM_EVENT, GB_NAV_SIM_KEY, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { parseAppRole } from '@/lib/auth/role-resolution';
import type { AppRole } from '@/lib/auth/roles';
import { 
  HeartPulse, 
  DollarSign, 
  CreditCard, 
  Briefcase, 
  Users, 
  Settings, 
  AlertTriangle, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  ShieldAlert, 
  Award, 
  Mail, 
  PhoneCall, 
  Activity,
  FileText,
  BarChart3,
  CheckCircle,
  TrendingUp
} from 'lucide-react';

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
  longestTimerSessions: Array<{
    minutes: number;
    serviceSlug: string;
    guestName?: string;
    vehicle?: string;
    scheduledStart?: string;
    appointmentId?: string | null;
  }>;
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

export function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simNav, setSimNav] = useState<DashboardShellRole | null>(null);
  const [promoteBanner, setPromoteBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Tab selections inside Command Center
  const [currentTab, setCurrentTab] = useState<'health' | 'revenue' | 'jobs' | 'stripe'>('health');

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

  // Compute business health score (0-100) dynamically
  const businessHealthScore = useMemo(() => {
    if (!stats) return 100;
    let score = 100;
    if (!stats.stripe.connected) score -= 40;
    if (!stats.stripe.webhookConfigured) score -= 20;
    if (stats.pendingDeposits > 8) score -= 10;
    if (stats.unreadMessages > 10) score -= 10;
    return Math.max(20, score);
  }, [stats]);

  const activeAlerts = useMemo(() => {
    if (!stats) return [];
    const alerts = [];
    if (!stats.stripe.connected) {
      alerts.push({
        id: 'stripe-disconnected',
        title: 'Stripe Integration Inactive',
        desc: 'Stripe keys are not detected. Standard card checkout and deposits are disabled.',
        severity: 'critical' as const
      });
    } else if (!stats.stripe.webhookConfigured) {
      alerts.push({
        id: 'webhook-missing',
        title: 'Webhook Secret Missing',
        desc: 'Webhook secret is not configured. Instant checkout reconciliation will fail.',
        severity: 'warning' as const
      });
    }
    if (stats.pendingDeposits > 0) {
      alerts.push({
        id: 'pending-deposits',
        title: `${stats.pendingDeposits} Pending Deposit Invoices`,
        desc: 'Bookings awaiting deposit confirmation before scheduling.',
        severity: 'info' as const
      });
    }
    if (stats.unreadMessages > 0) {
      alerts.push({
        id: 'unread-messages',
        title: `${stats.unreadMessages} New Customer Messages`,
        desc: 'Awaiting technician or administrator reply in the communication hub.',
        severity: 'info' as const
      });
    }
    return alerts;
  }, [stats]);

  if (error) {
    return (
      <div className='rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-200'>
        <p className="font-bold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" /> Super Admin Connection Failure
        </p>
        <p className="mt-1 text-xs text-zinc-400">Could not compile server metrics: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className='space-y-4 animate-pulse'>
        <div className="h-14 rounded-2xl bg-zinc-900/60 border border-gold/10" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='h-28 rounded-2xl bg-zinc-900/60 border border-gold/10' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      {/* Simulation Banner */}
      {promoteBanner && (
        <div
          role='alert'
          className={`rounded-xl border p-4 text-sm ${
            promoteBanner.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-500/45 bg-amber-500/10 text-amber-100'
          }`}
        >
          {promoteBanner.text}
        </div>
      )}

      {/* TOP METRIC GRIDS: Quick Health Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Business Health */}
        <div className="rounded-2xl border border-gold/15 bg-zinc-950 p-5 flex items-center justify-between shadow-[0_0_20px_rgba(212,175,55,0.03)]">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Business Health</p>
            <p className="text-2xl font-black text-white">{businessHealthScore}%</p>
            <p className="text-[10px] text-zinc-400">System core operations</p>
          </div>
          <div className={`p-3 rounded-xl border ${businessHealthScore > 80 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400'}`}>
            <HeartPulse className="h-6 w-6" />
          </div>
        </div>

        {/* Revenue Today */}
        <div className="rounded-2xl border border-gold/15 bg-zinc-950 p-5 flex items-center justify-between shadow-[0_0_20px_rgba(212,175,55,0.03)]">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Revenue Today</p>
            <p className="text-2xl font-black text-white">{money(stats.revenueTodayCents)}</p>
            <p className="text-[10px] text-zinc-400">{stats.paymentsTodayCount} successful payout(s)</p>
          </div>
          <div className="p-3 rounded-xl border border-gold/25 bg-gold/10 text-gold-soft">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        {/* Stripe Sync */}
        <div className="rounded-2xl border border-gold/15 bg-zinc-950 p-5 flex items-center justify-between shadow-[0_0_20px_rgba(212,175,55,0.03)]">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Stripe Billing</p>
            <p className="text-lg font-black text-white uppercase tracking-tight">
              {stats.stripe.connected ? `${stats.stripe.mode} Mode` : 'Disconnected'}
            </p>
            <p className="text-[10px] text-zinc-400">
              {stats.stripe.webhookConfigured ? 'Webhook OK' : 'No Webhook Secret'}
            </p>
          </div>
          <div className={`p-3 rounded-xl border ${stats.stripe.connected ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/25 bg-rose-500/10 text-rose-400'}`}>
            <CreditCard className="h-6 w-6" />
          </div>
        </div>

        {/* Active Jobs */}
        <div className="rounded-2xl border border-gold/15 bg-zinc-950 p-5 flex items-center justify-between shadow-[0_0_20px_rgba(212,175,55,0.03)]">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Active Pipeline</p>
            <p className="text-2xl font-black text-white">{stats.activeJobs}</p>
            <p className="text-[10px] text-zinc-400">{stats.jobsToday} scheduled for today</p>
          </div>
          <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300">
            <Briefcase className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* QUICK SHORTCUTS ROW */}
      <div className="rounded-2xl border border-white/5 bg-zinc-950 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Core Administration Shortcuts</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { href: '/admin/work-orders', label: 'Work Orders' },
            { href: '/admin/dispatch', label: 'Dispatch' },
            { href: '/admin/revenue', label: 'Revenue' },
            { href: '/admin/cms', label: 'Website CMS' },
            { href: '/admin/customers', label: 'Customers' },
            { href: '/admin/team', label: 'Team Roles' },
            { href: '/admin/pricing', label: 'Promotions' },
            { href: '/admin/system-status', label: 'System status' },
          ].map((lnk) => (
            <Link
              key={lnk.href}
              href={lnk.href}
              className="text-center py-2.5 rounded-xl border border-white/10 bg-black/40 hover:border-gold/30 hover:text-gold-soft text-xs font-bold uppercase transition"
            >
              {lnk.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ALERTS SECTION */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Required Owner Review Alerts</p>
          <div className="grid gap-3 md:grid-cols-2">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 flex gap-3 ${
                  alert.severity === 'critical'
                    ? 'border-rose-500/35 bg-rose-500/5 text-rose-300'
                    : alert.severity === 'warning'
                    ? 'border-amber-500/35 bg-amber-500/5 text-amber-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300'
                }`}
              >
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wide">{alert.title}</h4>
                  <p className="text-xs text-zinc-400 mt-1">{alert.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HEALTH CATEGORIES TABS */}
      <div className="space-y-4">
        {/* Tab Headers */}
        <div className="flex gap-2 border-b border-white/5 pb-2 overflow-x-auto">
          {[
            { id: 'health', label: 'System & Health Status', icon: HeartPulse },
            { id: 'revenue', label: 'Revenue Health', icon: DollarSign },
            { id: 'jobs', label: 'Jobs & Timers Health', icon: Briefcase },
            { id: 'stripe', label: 'Stripe & Connection Diagnostics', icon: CreditCard }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition whitespace-nowrap ${
                  active
                    ? 'bg-gold text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-zinc-950 border border-white/5 rounded-3xl p-6 shadow-xl">
          {/* TAB 1: SYSTEM & HEALTH */}
          {currentTab === 'health' && (
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <h4 className="text-xs font-black uppercase tracking-widest text-gold-soft mb-4">Core Integrations Health</h4>
                  <ul className="space-y-3 text-xs">
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Database Connection</span>
                      <span className="flex items-center gap-1.5 font-bold text-emerald-400"><CheckCircle className="h-4 w-4" /> Connected</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Stripe Billing Auth</span>
                      <span className={`flex items-center gap-1.5 font-bold ${stats.stripe.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.stripe.connected ? <CheckCircle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                        {stats.stripe.connected ? 'Connected' : 'Missing Key'}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Stripe Webhooks</span>
                      <span className={`flex items-center gap-1.5 font-bold ${stats.stripe.webhookConfigured ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.stripe.webhookConfigured ? <CheckCircle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                        {stats.stripe.webhookConfigured ? 'Active' : 'Missing secret'}
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <h4 className="text-xs font-black uppercase tracking-widest text-gold-soft mb-4">Operations Metrics</h4>
                  <ul className="space-y-3 text-xs">
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Staff Profiles</span>
                      <span className="font-mono font-bold text-white">{stats.staffProfiles} staff members</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Active Services pricing</span>
                      <span className="font-mono font-bold text-white">{stats.activeServices} active packs</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Unread inbox messages</span>
                      <span className={`font-mono font-bold ${stats.unreadMessages > 0 ? 'text-amber-400' : 'text-white'}`}>
                        {stats.unreadMessages} new
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <h4 className="text-xs font-black uppercase tracking-widest text-gold-soft mb-4">Intake & Waiver Health</h4>
                  <ul className="space-y-3 text-xs">
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Signed Liability forms (month)</span>
                      <span className="font-mono font-bold text-white">{stats.signedAgreementsMonth} signed</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Customer Intake cards (month)</span>
                      <span className="font-mono font-bold text-white">{stats.intakeSubmissionsMonth} submissions</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-zinc-400">Audit timeline events (24h)</span>
                      <span className="font-mono font-bold text-white">{stats.timelineEvents24h} logs</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Conversion Statistics */}
              <div className="bg-black/30 border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Lead Pipeline Conversion Health</h4>
                  <p className="text-xs text-zinc-500">Tracks conversions from custom intake forms to active bookings.</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Total Leads</p>
                    <p className="text-xl font-mono font-black text-white">{stats.leadsTotal}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Booked</p>
                    <p className="text-xl font-mono font-black text-white">{stats.leadsBooked}</p>
                  </div>
                  <div className="text-center border-l border-white/10 pl-6">
                    <p className="text-[10px] text-gold-soft uppercase font-black">Conversion Rate</p>
                    <p className="text-2xl font-mono font-black text-gold">{stats.leadConversionPercent != null ? `${stats.leadConversionPercent}%` : '0%'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REVENUE HEALTH */}
          {currentTab === 'revenue' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Gross Collected (24h)</p>
                  <p className="mt-2 text-2xl font-black text-white font-mono">{money(stats.revenueTodayCents)}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">{stats.paymentsTodayCount} successful payout(s)</p>
                </div>
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Gross Collected (Week)</p>
                  <p className="mt-2 text-2xl font-black text-white font-mono">{money(stats.revenueWeekCents)}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">{stats.paymentsWeekCount} successful payout(s)</p>
                </div>
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-950 to-gold/5 border-gold/15">
                  <p className="text-[10px] font-black uppercase text-gold-soft tracking-wider">Gross Collected (Month)</p>
                  <p className="mt-2 text-3xl font-black text-gold font-mono">{money(stats.revenueMonthCents)}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">{stats.paymentsMonthCount} successful payout(s)</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Revenue History Chart placeholder/visual representation */}
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-gold" /> Revenue Breakdown
                  </p>
                  <div className="flex h-36 items-end justify-between gap-4 px-2">
                    {[
                      { label: 'Today', cents: stats.revenueTodayCents },
                      { label: 'Weekly', cents: stats.revenueWeekCents },
                      { label: 'Monthly', cents: stats.revenueMonthCents }
                    ].map((b) => {
                      const max = Math.max(1, stats.revenueMonthCents);
                      return (
                        <div key={b.label} className="flex-1 flex flex-col items-center gap-2">
                          <div 
                            style={{ height: `${Math.max(10, Math.round((b.cents / max) * 100))}%` }}
                            className="w-full max-w-[60px] min-h-[10px] rounded-t-lg bg-gradient-to-t from-gold/30 to-gold shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                          />
                          <span className="text-[10px] text-zinc-500 font-bold uppercase">{b.label}</span>
                          <span className="font-mono text-xs text-gold-soft">{money(b.cents)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Operations Cashflow summary */}
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Operations Deposits Health</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-white/5 bg-black p-3.5 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-zinc-500">Pending Deposits</p>
                      <p className="text-xl font-black text-white mt-1">{stats.pendingDeposits}</p>
                      <p className="text-[9px] text-zinc-500 mt-1">Awaiting checkout deposit</p>
                    </div>
                    <div className="border border-white/5 bg-black p-3.5 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-zinc-500">Confirmed Booking Deposits</p>
                      <p className="text-xl font-black text-white mt-1">{stats.depositPaidAwaitingNext}</p>
                      <p className="text-[9px] text-zinc-500 mt-1">Deposits cleared</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: JOBS & TIMERS */}
          {currentTab === 'jobs' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Scheduled Today</p>
                  <p className="text-xl font-black text-white mt-1">{stats.jobsToday}</p>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Active In-Flight</p>
                  <p className="text-xl font-black text-white mt-1">{stats.activeJobs}</p>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Assigned Dispatch</p>
                  <p className="text-xl font-black text-white mt-1">{stats.assignedDispatchJobs}</p>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Closed Month</p>
                  <p className="text-xl font-black text-white mt-1">{stats.completedMonth}</p>
                </div>
              </div>

              {/* Timers & Active Logs */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Technician Active Timer Averages</h4>
                  <div className="flex justify-between items-center bg-black/60 p-4 rounded-xl border border-white/5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Database Averages</p>
                      <p className="text-lg font-black text-white mt-1">
                        {stats.avgJobMinutesAll != null ? `${stats.avgJobMinutesAll} minutes` : 'No timers recorded'}
                      </p>
                    </div>
                    <Activity className="h-6 w-6 text-gold-soft animate-pulse" />
                  </div>

                  <h5 className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Top 3 Longest Sessions</h5>
                  <ul className="space-y-2">
                    {stats.longestTimerSessions.slice(0, 3).map((session, idx) => (
                      <li key={idx} className="flex justify-between items-center text-xs bg-black/30 p-2.5 rounded-lg border border-white/5">
                        <div>
                          <p className="font-bold text-white">{session.guestName || 'VIP Customer'}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{session.serviceSlug.replace(/-/g, ' ')}</p>
                        </div>
                        <span className="font-mono text-gold-soft font-bold">{session.minutes} mins</span>
                      </li>
                    ))}
                    {stats.longestTimerSessions.length === 0 && (
                      <p className="text-xs text-zinc-500 italic">No job timers currently recorded.</p>
                    )}
                  </ul>
                </div>

                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Technician Completion Roster</h4>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {stats.technicianPerformance.map((tech) => (
                      <div key={tech.id} className="flex justify-between items-center text-xs bg-black/40 p-3 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-full bg-gold/15 flex items-center justify-center text-[10px] font-black text-gold-soft">
                            {(tech.full_name || 'T').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="font-bold text-white">{tech.full_name || 'Technician'}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-gold-soft font-bold">{tech.completed_jobs} jobs</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">Avg: {tech.avg_job_minutes ?? '—'} mins</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STRIPE & CONNECTION */}
          {currentTab === 'stripe' && (
            <div className="space-y-6">
              <div className="bg-black/40 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h4 className="text-sm font-black uppercase tracking-wider text-white">Stripe Core Configuration</h4>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stats.stripe.connected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                    {stats.stripe.connected ? 'Active Fabric' : 'Inactive'}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 text-xs">
                  <div className="space-y-1">
                    <p className="text-zinc-500 uppercase text-[10px] font-black">Environment Keys Source</p>
                    <p className="text-white font-mono font-bold">{stats.stripe.keySource || 'System'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-500 uppercase text-[10px] font-black">Operation Mode</p>
                    <p className="text-gold-soft font-mono font-bold uppercase">{stats.stripe.mode} mode</p>
                  </div>
                  <div className="space-y-1 pt-2">
                    <p className="text-zinc-500 uppercase text-[10px] font-black">Publishable Key</p>
                    <p className="text-zinc-400 font-mono">{stats.stripe.publishableConfigured ? 'Configured' : 'Missing'}</p>
                  </div>
                  <div className="space-y-1 pt-2">
                    <p className="text-zinc-500 uppercase text-[10px] font-black">Webhook Secret</p>
                    <p className="text-zinc-400 font-mono">{stats.stripe.webhookConfigured ? 'Configured' : 'Missing'}</p>
                  </div>
                </div>
              </div>

              {/* Stripe Setup Guidance Alert */}
              {!stats.stripe.connected && (
                <div className="rounded-2xl border border-gold/20 bg-gold/5 p-4 text-xs text-zinc-300">
                  <p className="font-bold flex items-center gap-1.5 text-gold-soft uppercase"><ShieldAlert className="h-4 w-4" /> Connection Required</p>
                  <p className="mt-2 leading-relaxed">
                    To start accepting credit cards and managing payments, configure Stripe inside your server environment settings by adding:
                  </p>
                  <pre className="mt-2 p-2 bg-black border border-white/10 rounded font-mono text-[10px] text-zinc-400 max-w-full overflow-x-auto">
                    {`STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...`}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RECENT PORTAL SNAPSHOTS */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Latest Bookings */}
        <div className="bg-zinc-950 border border-white/5 rounded-3xl p-5 shadow-lg space-y-4">
          <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Latest Appointments</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {stats.latestAppointments.map((appt) => (
              <div key={appt.id} className="flex justify-between items-center text-xs bg-black/40 p-3 rounded-xl border border-white/5">
                <div>
                  <p className="font-bold text-white">{appt.guest_name || 'Guest customer'}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {appt.service_slug} · {new Date(appt.scheduled_start).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${appt.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gold/15 text-gold-soft border border-gold/25'}`}>
                  {appt.status}
                </span>
              </div>
            ))}
            {stats.latestAppointments.length === 0 && (
              <p className="text-xs text-zinc-500 italic">No bookings on file.</p>
            )}
          </div>
        </div>

        {/* Latest customer inbox messages */}
        <div className="bg-zinc-950 border border-white/5 rounded-3xl p-5 shadow-lg space-y-4">
          <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Latest Inbox Messages</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {stats.latestMessages.map((msg) => (
              <div key={msg.id} className="flex justify-between items-center text-xs bg-black/40 p-3 rounded-xl border border-white/5">
                <div>
                  <p className="font-bold text-white">{msg.from_name}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{msg.subject || '(no subject)'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${msg.status === 'replied' ? 'bg-zinc-800 text-zinc-400' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                  {msg.status}
                </span>
              </div>
            ))}
            {stats.latestMessages.length === 0 && (
              <p className="text-xs text-zinc-500 italic">No messages received.</p>
            )}
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE DIAGNOSTICS & USER ROLE TUNER */}
      <div className="border border-white/5 rounded-3xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full flex items-center justify-between bg-zinc-950 px-6 py-4 border-b border-white/5 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white"
        >
          <span>Diagnostics, Simulation & Roster promotions</span>
          {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showDiagnostics && (
          <div className="bg-black/60 p-6 space-y-6">
            {/* Simulation Block */}
            <div className="border border-amber-500/35 bg-amber-500/5 p-5 rounded-2xl space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-amber-300">Navigation role override (Local Simulation)</p>
              <p className="text-[11px] text-zinc-500">
                Does not change database values. Allows verifying view aesthetics for Customer or Technician layouts as a local simulator override.
              </p>
              <select
                className="rounded-xl border border-white/10 bg-black px-4 py-2 text-xs text-white"
                value={simNav || ''}
                onChange={(e) => setSimulation(e.target.value)}
              >
                <option value="">Default (Super Admin)</option>
                <option value="super_admin">Super Admin View</option>
                <option value="admin">Admin View</option>
                <option value="technician">Technician View</option>
                <option value="customer">Customer View</option>
              </select>
            </div>

            {/* Team Roles Promotion */}
            <div className="space-y-4">
              <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Team Roster Promotion Console</p>
              <div className="overflow-x-auto rounded-2xl border border-white/5 bg-zinc-950 p-4">
                <table className="w-full min-w-[600px] text-left text-xs text-zinc-300">
                  <thead>
                    <tr className="border-b border-white/10 uppercase font-black text-zinc-500 pb-2">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Database Role</th>
                      <th className="py-2">Modify Database Permission Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.teamRoster.map((row) => {
                      const rosterRole = parseAppRole(row.role);
                      return (
                        <tr key={row.id} className="border-b border-white/5">
                          <td className="py-3 pr-4 text-zinc-200">{row.full_name || 'VIP Staff Member'}</td>
                          <td className="py-3 pr-4 font-mono text-gold-soft">{row.role}</td>
                          <td className="py-3">
                            <form action={submitPromoteRoleForm} className="flex items-center gap-2">
                              <input type="hidden" name="profileId" value={row.id} />
                              <select
                                name="role"
                                defaultValue={rosterRole || ''}
                                required
                                className="rounded-lg border border-zinc-850 bg-black px-2 py-1 text-xs text-white"
                              >
                                {!rosterRole && <option value="" disabled>Pick a valid role</option>}
                                {ROLE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="rounded-lg bg-gold px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-black transition hover:brightness-110"
                              >
                                Save Database Role
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
          </div>
        )}
      </div>
    </div>
  );
}
