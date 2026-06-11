'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  Zap,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Percent,
  TrendingDown,
  ClipboardList,
  Wrench,
  CreditCard,
  X,
  Target,
  FileText,
  BadgePercent,
  Plus,
  Check,
  HelpCircle,
  Lock as LockIcon
} from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { PremiumBadge, SectionEyebrow, GlassCard } from '@/components/ui/premium';
import { displayMoney } from '@/lib/display-format';

// Helper component for TODAY metric cards
function TodayMetricCard({
  label,
  value,
  href,
  onClick,
  icon: Icon,
  colorClass = 'text-gold-soft',
  subtitle
}: {
  label: string;
  value: string | number;
  href?: string;
  onClick?: () => void;
  icon?: any;
  colorClass?: string;
  subtitle?: string;
}) {
  const cardContent = (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-5 transition-all duration-300 hover:border-gold/30 hover:bg-black/60 hover:shadow-[0_0_25px_rgba(212,175,55,0.06)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">{label}</span>
        <div className="rounded-lg bg-zinc-950/60 p-2 border border-white/5 group-hover:border-gold/20 transition-all">
          {Icon && <Icon className={`h-4 w-4 ${colorClass} opacity-85`} />}
        </div>
      </div>
      <p className="mt-4 font-mono text-2xl font-black text-white tracking-tight sm:text-3xl">
        <span className={colorClass}>{value}</span>
      </p>
      {subtitle && (
        <p className="mt-1 text-[10px] text-zinc-500 font-medium">{subtitle}</p>
      )}
      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-gold-soft to-gold transition-all duration-300 group-hover:w-full" />
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block text-left w-full transition hover:opacity-95 focus:outline-none">
        {cardContent}
      </button>
    );
  }

  return href ? (
    <Link href={href} className="block transition hover:opacity-95">
      {cardContent}
    </Link>
  ) : (
    cardContent
  );
}

// Helper component for Operations Grid cards
function OperationsCard({
  label,
  value,
  icon: Icon,
  colorClass = 'text-gold',
  status,
  href,
  onClick
}: {
  label: string;
  value: string | number;
  icon: any;
  colorClass?: string;
  status?: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 transition-all duration-200 hover:border-gold/25 hover:bg-zinc-950/60">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-white/10 ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="font-mono text-lg font-bold text-white">{value}</p>
          {status && <span className="text-[9px] text-zinc-500 font-semibold">{status}</span>}
        </div>
      </div>
      {(href || onClick) && <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-gold transition" />}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="group block text-left w-full focus:outline-none">
        {inner}
      </button>
    );
  }

  return href ? (
    <Link href={href} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function OwnerCommandCenter({ metrics, isSuperAdmin = false }: { metrics: OwnerDashboardSnapshot; isSuperAdmin?: boolean }) {
  const [activeDrawer, setActiveDrawer] = useState<
    | 'open-balances'
    | 'pending-deposits'
    | 'card-spend'
    | 'expenses'
    | 'tech-performance'
    | 'goals'
    | 'memberships'
    | 'credits'
    | 'bookings'
    | 'notifications'
    | null
  >(null);

  const quickActions = [
    { href: '/admin/dispatch', label: 'New Booking', desc: 'Create manual field job', icon: Calendar, color: 'text-gold-soft', drawer: 'bookings' },
    { href: '/admin/dispatch', label: 'Dispatch Board', desc: 'Manage slots & routes', icon: Zap, color: 'text-cyan-400' },
    { href: '/admin/revenue', label: 'Revenue Center', desc: 'Payment details & charts', icon: TrendingUp, color: 'text-emerald-400' },
    { href: '/admin/work-orders/add-past', label: 'Add Past Job', desc: 'Backfill completed work', icon: ClipboardList, color: 'text-amber-300' },
    { href: '/admin/reports', label: 'Reports', desc: 'Tax and revenue exports', icon: Activity, color: 'text-emerald-300', drawer: 'goals' },
    { href: '/admin/system-diagnostics', label: 'Diagnostics', desc: 'Find data blockers fast', icon: Wrench, color: 'text-rose-300' },
    { href: '/admin/customers', label: 'Customers', desc: 'Profiles & loyalty records', icon: Users, color: 'text-amber-400' },
    { href: '/admin/cms', label: 'Gallery Manager', desc: 'Review & publish showcase', icon: Sparkles, color: 'text-gold' },
    { href: 'https://dashboard.stripe.com/', label: 'Stripe Dashboard', desc: 'External Stripe Console', icon: ExternalLink, external: true, color: 'text-indigo-400' },
    { href: 'https://mail.google.com/', label: 'Gmail Admin', desc: 'Business mailbox console', icon: ExternalLink, external: true, color: 'text-red-400' },
    { href: 'https://console.twilio.com/', label: 'Twilio Console', desc: 'External SMS Console', icon: ExternalLink, external: true, color: 'text-rose-400' },
    { href: 'https://vercel.com/dashboard', label: 'Vercel Dashboard', desc: 'Deployments & production logs', icon: ExternalLink, external: true, color: 'text-white' },
  ];

  const getHealthTone = (val: number) => {
    if (val >= 85) return { label: 'Optimal', tone: 'emerald' as const };
    if (val >= 70) return { label: 'Moderate', tone: 'amber' as const };
    return { label: 'Attention Required', tone: 'rose' as const };
  };
  const healthInfo = getHealthTone(metrics.bookingHealth);

  const maxJobs = metrics.techPerformance.length > 0 
    ? Math.max(...metrics.techPerformance.map(t => t.jobCount)) 
    : 1;

  const dispatchStatus = metrics.jobsTodayCount > 0 
    ? `${metrics.dispatchCompletedToday}/${metrics.jobsTodayCount} Completed` 
    : 'No jobs today';

  const techStatusLabel = `${metrics.activeTechCount} Active`;
  const openBalanceRows = metrics.openBalanceRows ?? [];
  const pendingDepositRows = metrics.pendingDepositRows ?? [];
  const cardSpendRows = metrics.cardSpendRows ?? [];
  const expenseRows = metrics.expenseRows ?? [];
  const cardSpendTotal = metrics.financial?.cardSpendCents ?? 0;
  const expenseTotal = metrics.financial?.expensesCents ?? 0;

  const renderDrawerContent = () => {
    switch (activeDrawer) {
      case 'open-balances':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Outstanding Balance</p>
              <h2 className="text-4xl font-black text-rose-400 mt-1 font-mono">{metrics.balanceDue}</h2>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Receivables Accounts</p>
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-4">
                {openBalanceRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                    No open customer balances found in the live ledger.
                  </p>
                ) : (
                  openBalanceRows.slice(0, 12).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href ?? '/admin/revenue'}
                      onClick={() => setActiveDrawer(null)}
                      className="flex justify-between items-center py-2 border-b border-white/5 last:border-0 text-xs hover:text-gold-soft"
                    >
                      <div>
                        <p className="font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {item.category ?? 'receivable'} · {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : 'No date'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-rose-400">{displayMoney(Math.abs(item.amountCents))}</p>
                        <span className="text-[9px] font-black uppercase text-gold hover:underline mt-1 block">Open</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Automated Reminder Rules</p>
              <p className="mt-1 text-zinc-400">Reminders are scheduled to send automatically at 24 hours, 3 days, and 7 days post-completion if a balance remains outstanding.</p>
            </div>
          </div>
        );

      case 'pending-deposits':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Awaiting Deposits</p>
              <h2 className="text-4xl font-black text-amber-400 mt-1 font-mono">{metrics.pendingDeposits}</h2>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Pending Bookings</p>
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-4">
                {pendingDepositRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                    No bookings are currently waiting on deposits.
                  </p>
                ) : (
                  pendingDepositRows.slice(0, 12).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href ?? '/admin/dispatch'}
                      onClick={() => setActiveDrawer(null)}
                      className="flex justify-between items-center py-2 border-b border-white/5 last:border-0 text-xs hover:text-gold-soft"
                    >
                      <div>
                        <p className="font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{item.category ?? 'awaiting deposit'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-amber-400">{displayMoney(Math.abs(item.amountCents))}</p>
                        <span className="text-[9px] font-black uppercase text-gold hover:underline mt-1 block">Open booking</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl bg-cyan-950/20 border border-cyan-500/20 p-4 text-xs text-cyan-200">
              <p className="font-semibold flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> Quick Mark Paid</p>
              <p className="mt-1 text-zinc-400">If customer paid deposit via Zelle, Cash, or Check outside of Stripe checkout, you can override and approve it directly in the Dispatch Board.</p>
            </div>
          </div>
        );

      case 'card-spend':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Stripe Card Activity</p>
              <h2 className="text-4xl font-black text-cyan-400 mt-1 font-mono">{displayMoney(cardSpendTotal)} <span className="text-xs text-zinc-500 font-medium">30D</span></h2>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Recent Transactions</p>
              <div className="space-y-3">
                {cardSpendRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-cyan-100">
                    <p className="font-bold">No synced Stripe card spend found.</p>
                    <p className="mt-1 text-zinc-400">If Stripe Issuing is enabled, run Stripe Sync. If it is not enabled, use Operations to enter card or supply expenses manually.</p>
                    <Link href="/admin/card-activity" onClick={() => setActiveDrawer(null)} className="mt-3 inline-flex text-[10px] font-black uppercase text-gold-soft hover:underline">
                      Open Card Activity
                    </Link>
                  </div>
                ) : (
                  cardSpendRows.slice(0, 12).map((tx) => (
                    <Link
                      key={tx.id}
                      href={tx.href ?? '/admin/card-activity'}
                      onClick={() => setActiveDrawer(null)}
                      className="block rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-xs transition-all hover:border-cyan-500/30"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-white">{tx.label}</p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {tx.occurredAt ? new Date(tx.occurredAt).toLocaleString() : 'No date'} · {tx.method ?? tx.source ?? 'card'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-white">{displayMoney(Math.abs(tx.amountCents))}</p>
                          <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-white/5 text-zinc-400 mt-1">{tx.category ?? 'card spend'}</span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4 space-y-2 text-xs">
              <p className="font-bold text-gold-soft flex items-center gap-1.5"><LockIcon className="h-3.5 w-3.5" /> Stripe Treasury Integration Guidance</p>
              <p className="text-zinc-400">Corporate Card spend sync requires an active Stripe Issuing integration. Connect your Stripe account under Settings &gt; Stripe Sync to synchronize live team expenses automatically.</p>
            </div>
          </div>
        );

      case 'expenses':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Rig Expenses & Supplies</p>
              <h2 className="text-4xl font-black text-rose-400 mt-1 font-mono">{displayMoney(expenseTotal)} <span className="text-xs text-zinc-500 font-medium">30D</span></h2>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Supply Requests</p>
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-4">
                {expenseRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                    No expense rows found for the current reporting window.
                  </p>
                ) : (
                  expenseRows.slice(0, 12).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href ?? '/admin/operations'}
                      onClick={() => setActiveDrawer(null)}
                      className="flex justify-between items-center py-2 border-b border-white/5 last:border-0 text-xs hover:text-gold-soft"
                    >
                      <div>
                        <p className="font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {item.category ?? 'expense'} · {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : 'No date'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-white">{displayMoney(Math.abs(item.amountCents))}</p>
                        <span className="text-[9px] font-black uppercase text-gold hover:underline mt-1 block">Review</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      case 'tech-performance':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Technician Performance</p>
              <h2 className="text-2xl font-black text-white mt-1">Team Leaderboard MTD</h2>
            </div>

            <div className="space-y-4">
              {metrics.techPerformance.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center border border-dashed border-white/10 rounded-xl">No technician performance metrics found for current month.</p>
              ) : (
                metrics.techPerformance.map((tech) => {
                  const pct = Math.round((tech.jobCount / maxJobs) * 100);
                  return (
                    <div key={tech.techName} className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 space-y-2 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-white">{tech.techName}</span>
                        <span className="font-mono text-gold-soft">{displayMoney(tech.revenueCents)}</span>
                      </div>
                      
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>{tech.jobCount} Jobs completed</span>
                        <span>Avg Ticket: {displayMoney(Math.round(tech.revenueCents / tech.jobCount))}</span>
                      </div>

                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-gold/30 to-gold rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );

      case 'goals':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">June 2026 Target Goals</p>
              <h2 className="text-2xl font-black text-white mt-1">Goal Center Progress</h2>
            </div>

            <div className="space-y-5">
              {[
                { title: 'MTD Revenue Target', target: '$10,000.00', current: metrics.revenueMonth, value: parseFloat(metrics.revenueMonth.replace(/[^0-9.]/g, '')), max: 10000 },
                { title: 'Client Repeat Retention', target: '70% repeat clients', current: `${metrics.customerRetentionRate}%`, value: metrics.customerRetentionRate, max: 70 },
                { title: 'Loyalty Portal Signups', target: '50% of client base', current: `${metrics.loyaltyParticipation}%`, value: metrics.loyaltyParticipation, max: 50 },
              ].map((goal, idx) => {
                const rawVal = goal.value || 0;
                const pct = Math.min(100, Math.round((rawVal / goal.max) * 100));
                return (
                  <div key={idx} className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 space-y-2 text-xs">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-white">{goal.title}</span>
                      <span className="text-gold-soft font-mono">{goal.current} / {goal.target}</span>
                    </div>

                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500/50 to-gold rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    
                    <p className="text-[10px] text-zinc-500 text-right">{pct}% Completed</p>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'memberships':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Membership & Loyalty Tiers</p>
              <h2 className="text-4xl font-black text-gold-soft mt-1 font-mono">{metrics.membershipRevenueMonth} <span className="text-xs text-zinc-500 font-medium">MTD</span></h2>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3 text-xs">
                <p className="font-bold text-white uppercase tracking-wider text-[10px] text-zinc-400">Membership Tiers</p>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Gold VIP (Annual)</span>
                  <span className="font-bold text-white font-mono">5 Members</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Silver (Quarterly)</span>
                  <span className="font-bold text-white font-mono">8 Members</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Bronze Sparkle (Monthly)</span>
                  <span className="font-bold text-white font-mono">5 Members</span>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-cyan-200">
                <p className="font-semibold">Loyalty Punch Card Program</p>
                <p className="mt-1 text-zinc-400">Customer participation is currently at <span className="font-bold text-white">{metrics.loyaltyParticipation}%</span>. Customer dashboards show punch counts and front/back scans of loyalty cards.</p>
              </div>
            </div>
          </div>
        );

      case 'credits':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Customer Credits</p>
              <h2 className="text-4xl font-black text-rose-400 mt-1 font-mono">
                {displayMoney(metrics.creditMetrics?.outstandingLiabilityCents ?? 0)}
                <span className="text-xs text-zinc-500 font-medium"> outstanding</span>
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Issued MTD</p>
                <p className="mt-2 font-mono text-xl font-black text-white">{displayMoney(metrics.creditMetrics?.mtdIssuedCents ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Applied MTD</p>
                <p className="mt-2 font-mono text-xl font-black text-emerald-400">{displayMoney(metrics.creditMetrics?.mtdRedeemedCents ?? 0)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Expiring Soon</p>
              {(metrics.creditMetrics?.expiringSoon ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                  No customer credits are expiring in the next 30 days.
                </p>
              ) : (
                metrics.creditMetrics.expiringSoon.map((credit) => (
                  <Link
                    key={credit.id}
                    href="/admin/customers"
                    onClick={() => setActiveDrawer(null)}
                    className="block rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-xs hover:border-rose-400/40"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">{credit.customerName}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">{credit.reason || 'Store credit'} · expires {new Date(credit.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <p className="font-mono font-black text-rose-300">{displayMoney(credit.remainingCents)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <Link href="/admin/customers" onClick={() => setActiveDrawer(null)} className="inline-flex rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20">
              Open Customer Credit Ledger
            </Link>
          </div>
        );

      case 'bookings':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Detailing Bookings</p>
              <h2 className="text-2xl font-black text-white mt-1">Upcoming Detailing Slots</h2>
            </div>

            <div className="space-y-3">
              {metrics.upcomingAppts.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center border border-dashed border-white/10 rounded-xl">No upcoming appointments scheduled.</p>
              ) : (
                metrics.upcomingAppts.map((appt) => (
                  <Link
                    key={appt.id}
                    href={`/admin/work-orders/${appt.id}`}
                    onClick={() => setActiveDrawer(null)}
                    className="block rounded-xl border border-white/10 bg-zinc-900/50 p-4 hover:border-gold/30 transition text-xs space-y-2"
                  >
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-white">{appt.guestName}</span>
                      <span className="text-gold-soft font-mono">{appt.price}</span>
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>{appt.service}</span>
                      <span>{appt.time}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-white/5 text-[9px] text-zinc-500">
                      <span>Status: <strong className="text-zinc-300 uppercase">{appt.status}</strong></span>
                      <span className="text-gold-soft font-bold flex items-center gap-1">View Details <ArrowUpRight className="h-3 w-3" /></span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">System Alerts & Notifications</p>
              <h2 className="text-2xl font-black text-white mt-1">Operation Alerts</h2>
            </div>

            {/* Alert List */}
            {metrics.alerts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Critical Tasks</p>
                <div className="space-y-2">
                  {metrics.alerts.map((alert, idx) => (
                    <div key={idx} className="flex gap-2.5 items-start bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-100/90">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>{alert}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Feed */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Live Dispatch Activity</p>
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {metrics.liveFeed.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">No recent activities logged.</p>
                ) : (
                  metrics.liveFeed.map((feed) => (
                    <div key={feed.id} className="text-xs pb-3 border-b border-white/5 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center font-semibold text-white">
                        <span>{feed.title}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">{feed.time}</span>
                      </div>
                      <Link
                        href={`/admin/work-orders/${feed.apptId}`}
                        onClick={() => setActiveDrawer(null)}
                        className="mt-1 inline-flex items-center gap-1 text-[9px] uppercase font-bold text-gold-soft hover:underline"
                      >
                        Inspect Appointment <ChevronRight className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Alert Banner if any */}
      {metrics.alerts.length > 0 ? (
        <ul className="space-y-2">
          {metrics.alerts.map((a) => (
            <motion.li
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              key={a}
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{a}</span>
            </motion.li>
          ))}
        </ul>
      ) : null}

      {/* Expiring Store Credits Banner */}
      {metrics.creditMetrics?.expiringSoon && metrics.creditMetrics.expiringSoon.length > 0 ? (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            Credits Expiring Soon (Next 30 Days)
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {metrics.creditMetrics.expiringSoon.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/5 bg-zinc-950/45 p-3 flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-white">{c.customerName}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Reason: {c.reason}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-rose-300">{displayMoney(c.remainingCents)}</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5 font-mono">Expires {new Date(c.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* SECTION 1: TODAY (Top Metrics Grid) */}
      <section>
        <SectionEyebrow>Command Center Overview · Today</SectionEyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
          <TodayMetricCard label="Revenue Today" value={metrics.revenueToday} href="/admin/revenue" icon={DollarSign} colorClass="text-emerald-400" subtitle="Succeeded gross payments" />
          <TodayMetricCard label="Revenue 30 Days" value={metrics.revenueMonth} href="/admin/revenue" icon={Activity} colorClass="text-gold" subtitle="MTD collected revenue" />
          <TodayMetricCard label="Open Balances" value={metrics.balanceDue} onClick={() => setActiveDrawer('open-balances')} icon={AlertTriangle} colorClass="text-rose-400" subtitle="Receivables outstanding" />
          <TodayMetricCard label="Pending Deposits" value={metrics.pendingDeposits} onClick={() => setActiveDrawer('pending-deposits')} icon={Clock} colorClass="text-amber-400" subtitle="Awaiting initial deposit" />
          <TodayMetricCard label="Card Spend" value={displayMoney(cardSpendTotal)} onClick={() => setActiveDrawer('card-spend')} icon={CreditCard} colorClass="text-cyan-400" subtitle="Stripe Card spend 30D" />
          <TodayMetricCard label="Active Jobs" value={metrics.activeJobsCount} onClick={() => setActiveDrawer('bookings')} icon={Zap} colorClass="text-cyan-400" subtitle="Currently in progress" />
          <TodayMetricCard label="Memberships" value={metrics.membershipRevenueMonth} onClick={() => setActiveDrawer('memberships')} icon={Sparkles} colorClass="text-gold-soft" subtitle="Active membership revenue" />
          <TodayMetricCard label="Notifications" value={metrics.unreadMessageCount} onClick={() => setActiveDrawer('notifications')} icon={MessageSquare} colorClass={metrics.unreadMessageCount > 0 ? 'text-rose-400' : 'text-emerald-400'} subtitle={metrics.unreadMessageCount > 0 ? 'Action items pending' : 'No new messages'} />
        </div>
      </section>

      {/* SECTION 2: QUICK ACTIONS (Large Luxury Cards) */}
      <section>
        <SectionEyebrow>Quick Actions & Command Links</SectionEyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {quickActions.map((q) => {
            const cardContent = (
              <div className="group relative h-28 flex flex-col justify-between rounded-2xl border border-gold/15 bg-black/60 p-4 transition-all duration-300 hover:border-gold/45 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(212,175,55,0.1)]">
                <div className="flex items-center justify-between">
                  <div className={`rounded-xl bg-zinc-950/60 p-2.5 border border-white/5 group-hover:border-gold/20 transition-all ${q.color}`}>
                    <q.icon className="h-5 w-5 shrink-0" />
                  </div>
                  {q.external && <ExternalLink className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition" />}
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white mt-2 truncate">{q.label}</h3>
                  <p className="text-[9px] text-zinc-500 font-medium truncate mt-0.5 group-hover:text-zinc-400 transition">{q.desc}</p>
                </div>
                <div className="absolute top-0 right-0 h-2 w-2 rounded-bl-lg bg-gold-soft/0 group-hover:bg-gold-soft/20 transition-all" />
              </div>
            );

            return q.external ? (
              <a key={q.label} href={q.href} target="_blank" rel="noreferrer" className="block focus:outline-none">
                {cardContent}
              </a>
            ) : (
              <Link key={q.label} href={q.href} className="block focus:outline-none">
                {cardContent}
              </Link>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: OPERATIONS (Dispatch Feed and Technical Indicators) */}
      <section>
        <SectionEyebrow>Operations & Field Dispatch</SectionEyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <OperationsCard label="Jobs Today" value={metrics.jobsTodayCount} icon={Calendar} colorClass="text-indigo-400" href="/admin/dispatch" />
          <OperationsCard label="Dispatch Status" value={metrics.dispatchUnassignedToday > 0 ? `${metrics.dispatchUnassignedToday} Unassigned` : 'Ready'} icon={Zap} colorClass={metrics.dispatchUnassignedToday > 0 ? 'text-amber-400' : 'text-emerald-400'} status={dispatchStatus} href="/admin/dispatch" />
          <OperationsCard label="Leads Waiting" value={metrics.leadPipeline.newCount} icon={Users} colorClass="text-amber-400" href="/admin/customers" />
          <OperationsCard label="Unread Messages" value={metrics.unreadMessageCount} icon={MessageSquare} colorClass={metrics.unreadMessageCount > 0 ? 'text-rose-400' : 'text-zinc-500'} status={metrics.unreadMessageCount > 0 ? 'Action required' : 'Clear'} href="/admin/messages" />
          <OperationsCard label="Technicians" value={metrics.activeTechCount} icon={Users} colorClass="text-cyan-400" status={techStatusLabel} href="/admin/team" />
          <OperationsCard label="Bookings This Week" value={metrics.bookingsThisWeek} icon={Activity} colorClass="text-emerald-400" href="/admin/dispatch" />
        </div>
      </section>

      {/* SECTION 4: BUSINESS HEALTH & ANALYTICS */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Business Health Analytics */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40 lg:col-span-2">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Business Health Insights</SectionEyebrow>
              <PremiumBadge tone="gold">Analytics</PremiumBadge>
            </div>
            
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Ticket metrics */}
              <div className="rounded-2xl bg-zinc-950/50 p-4 border border-white/5">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Average Ticket</p>
                <p className="mt-2 font-mono text-2xl font-black text-white">{metrics.averageTicketSize}</p>
                <p className="mt-2 text-[10px] font-bold text-zinc-500">Month-to-date paid average</p>
              </div>

              {/* Membership revenue */}
              <div className="rounded-2xl bg-zinc-950/50 p-4 border border-white/5">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Membership MTD</p>
                <p className="mt-2 font-mono text-2xl font-black text-gold">{metrics.membershipRevenueMonth}</p>
                <p className="mt-2 text-[10px] font-bold text-zinc-500">Paid membership transactions</p>
              </div>

              {/* Booking Health */}
              <div className="rounded-2xl bg-zinc-950/50 p-4 border border-white/5">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Booking Health</p>
                <p className="mt-2 font-mono text-2xl font-black text-white">{metrics.bookingHealth}%</p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <PremiumBadge tone={healthInfo.tone}>{healthInfo.label}</PremiumBadge>
                </div>
              </div>
            </div>

            {/* Health Bars */}
            <div className="mt-6 space-y-4">
              {/* Conversion rate */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400">Lead Conversion Rate</span>
                  <span className="font-mono font-bold text-gold-soft">{metrics.conversionRate}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold/50 to-gold"
                    style={{ width: `${metrics.conversionRate}%` }}
                  />
                </div>
              </div>

              {/* Retention rate */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400">Customer Retention Rate</span>
                  <span className="font-mono font-bold text-gold-soft">{metrics.customerRetentionRate}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500/50 to-emerald-400"
                    style={{ width: `${metrics.customerRetentionRate}%` }}
                  />
                </div>
              </div>

              {/* Loyalty Participation */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400">Loyalty Program Participation</span>
                  <span className="font-mono font-bold text-gold-soft">{metrics.loyaltyParticipation}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500/50 to-cyan-400"
                    style={{ width: `${metrics.loyaltyParticipation}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Technician Leaderboard & Performance */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Technician Performance</SectionEyebrow>
              <span className="text-[9px] font-black uppercase text-zinc-500">MTD Standings</span>
            </div>
            {metrics.techPerformance.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500">
                No completed jobs recorded this month.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {metrics.techPerformance.map((t) => {
                  const pct = Math.round((t.jobCount / maxJobs) * 100);
                  return (
                    <div key={t.techName} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-200 truncate max-w-[120px]">{t.techName}</span>
                        <span className="font-mono text-zinc-400 text-[11px]">
                          {t.jobCount} jobs · <span className="text-emerald-400 font-bold">{displayMoney(t.revenueCents)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-gold/40 to-gold-soft"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-white/5 pt-3">
            <Link href="/admin/team" className="text-[10px] font-black uppercase text-gold-soft hover:text-gold flex items-center justify-between group">
              <span>View full technician stats</span>
              <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* SECTION 4.5: CUSTOMER STORE CREDITS LEDGER SUMMARY */}
      <section>
        <SectionEyebrow>Customer Store Credits & Liabilities</SectionEyebrow>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button type="button" onClick={() => setActiveDrawer('credits')} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-5 text-left transition-all duration-300 hover:border-rose-500/30">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Outstanding Liability</span>
            <p className="mt-4 font-mono text-2xl font-black text-rose-400 tracking-tight sm:text-3xl">
              {displayMoney(metrics.creditMetrics?.outstandingLiabilityCents ?? 0)}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500 font-medium">Unredeemed active customer credits</p>
          </button>

          <button type="button" onClick={() => setActiveDrawer('credits')} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-5 text-left transition-all duration-300 hover:border-gold/30">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Credits Issued (MTD)</span>
            <p className="mt-4 font-mono text-2xl font-black text-white tracking-tight sm:text-3xl">
              {displayMoney(metrics.creditMetrics?.mtdIssuedCents ?? 0)}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500 font-medium">Total credits issued this month</p>
          </button>

          <button type="button" onClick={() => setActiveDrawer('credits')} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-5 text-left transition-all duration-300 hover:border-emerald-500/30">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Credits Applied (MTD)</span>
            <p className="mt-4 font-mono text-2xl font-black text-emerald-400 tracking-tight sm:text-3xl">
              {displayMoney(metrics.creditMetrics?.mtdRedeemedCents ?? 0)}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500 font-medium">Total credits applied to jobs this month</p>
          </button>
        </div>
      </section>

      {/* SECTION 5: LIVE DISPATCH FEED & UPCOMING SCHEDULE */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Live Dispatch Feed */}
        <GlassCard className="border-white/10 bg-black/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <SectionEyebrow>Live Dispatch Feed</SectionEyebrow>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
              </span>
            </div>
            {metrics.liveFeed.length === 0 ? (
              <p className="py-16 text-center text-xs text-zinc-500 border border-dashed border-white/5 rounded-2xl">
                No recent dispatch feed events.
              </p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {metrics.liveFeed.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 rounded-xl border border-white/5 bg-zinc-950/40 p-3 hover:border-gold/20 transition duration-200"
                  >
                    <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gold-soft shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-300">{e.title}</p>
                      <p className="mt-1 font-mono text-[9px] text-zinc-500">{e.time}</p>
                    </div>
                    <Link
                      href={`/admin/dispatch?appt=${e.apptId}`}
                      className="text-zinc-500 hover:text-gold-soft self-center shrink-0"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Upcoming Schedule (Next 5 Jobs) */}
        <GlassCard className="border-white/10 bg-black/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <SectionEyebrow>Upcoming Schedule</SectionEyebrow>
              <span className="text-[9px] font-black uppercase text-zinc-500">Next 5 Jobs</span>
            </div>
            {metrics.upcomingAppts.length === 0 ? (
              <p className="py-16 text-center text-xs text-zinc-500 border border-dashed border-white/5 rounded-2xl">
                No scheduled upcoming jobs.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.upcomingAppts.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/30 px-3.5 py-3 hover:border-white/10 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white truncate max-w-[140px]">{app.guestName}</p>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-400">
                          {app.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-500 uppercase tracking-wide truncate">
                        {app.service}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs font-bold text-gold-soft">{app.price}</p>
                      <p className="text-[9px] text-zinc-500 font-mono mt-0.5">{app.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-white/5 pt-3">
            <Link href="/admin/dispatch" className="text-[10px] font-black uppercase text-gold-soft hover:text-gold flex items-center justify-between group">
              <span>View full schedule calendar</span>
              <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* SECTION 6: TODAY'S JOBS */}
      <section>
        <GlassCard className="border-white/10 bg-black/40">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
            <SectionEyebrow>Today&apos;s Detailing Schedule</SectionEyebrow>
            <Link href="/admin/dispatch" className="text-[9px] font-black uppercase text-gold-soft hover:underline">
              Full dispatch board →
            </Link>
          </div>
          {metrics.todayJobs.length === 0 ? (
            <p className="py-12 text-center text-xs text-zinc-500 border border-dashed border-white/5 rounded-2xl bg-zinc-950/10">
              No live detailing jobs scheduled for today. Book manual jobs above or assign slots in the Dispatch Board.
            </p>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 max-h-[300px] overflow-y-auto pr-1">
              {metrics.todayJobs.map((j) => (
                <Link
                  key={j.id}
                  href={j.href}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-zinc-950/40 p-4 hover:border-gold-soft/30 hover:bg-zinc-950/60 transition duration-200"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{j.guestName}</p>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {j.when} · <span className="uppercase text-gold-soft text-[9px] font-bold">{j.service}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block rounded-full bg-white/5 border border-white/5 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-400">
                      {j.status}
                    </span>
                    <p className="text-[9px] text-zinc-500 font-semibold mt-1.5">{j.techName}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>
      </section>

      {/* Sliding Drawer component overlay */}
      <AnimatePresence>
        {activeDrawer && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveDrawer(null)}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm animate-fade-in"
            />
            
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[110] w-full max-w-lg border-l border-gold/20 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-md overflow-y-auto text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Gloss Boss Live Detail</span>
                </div>
                <button
                  onClick={() => setActiveDrawer(null)}
                  className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white hover:border-white/20 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {renderDrawerContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
