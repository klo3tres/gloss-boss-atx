'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { PremiumBadge, SectionEyebrow, GlassCard } from '@/components/ui/premium';
import { displayMoney } from '@/lib/display-format';

function CommandMetric({
  label,
  value,
  href,
  icon: Icon,
  colorClass = 'text-gold-soft',
}: {
  label: string;
  value: string | number;
  href?: string;
  icon?: any;
  colorClass?: string;
}) {
  const cardContent = (
    <div className="gb-premium-card relative overflow-hidden rounded-2xl border border-gold/15 bg-black/60 p-5 transition-all duration-300 hover:border-gold/45 hover:shadow-[0_0_20px_rgba(212,175,55,0.08)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${colorClass} opacity-80`} />}
      </div>
      <p className="mt-3 font-mono text-2xl font-black text-white tracking-tight sm:text-3xl">
        <span className={colorClass}>{value}</span>
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="block transition hover:opacity-95">
      {cardContent}
    </Link>
  ) : (
    cardContent
  );
}

export function OwnerCommandCenter({ metrics }: { metrics: OwnerDashboardSnapshot }) {
  const quick = [
    { href: '/admin/dispatch', label: 'Dispatch board', icon: Calendar },
    { href: '/admin/revenue', label: 'Revenue detail', icon: TrendingUp },
    { href: '/admin/work-orders', label: 'Work orders', icon: Zap },
    { href: '/admin/team', label: 'Technicians', icon: Users },
    { href: '/admin/notifications', label: 'Notifications', icon: AlertTriangle },
    { href: '/book', label: 'Book appointment', icon: Calendar },
  ];

  // Lead Conversion rate
  const totalLeads = metrics.leadPipeline.totalActive;
  const convertedLeads = metrics.leadPipeline.convertedCount;
  const leadConvRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // Booking health label & color
  const getHealthTone = (val: number) => {
    if (val >= 85) return { label: 'Optimal', tone: 'emerald' as const };
    if (val >= 70) return { label: 'Moderate', tone: 'amber' as const };
    return { label: 'Attention Required', tone: 'rose' as const };
  };
  const healthInfo = getHealthTone(metrics.bookingHealth);

  // Maximum jobs for team performance scale
  const maxJobs = metrics.techPerformance.length > 0 
    ? Math.max(...metrics.techPerformance.map(t => t.jobCount)) 
    : 1;

  return (
    <div className="space-y-8">
      {/* Alert Banner if any */}
      {metrics.alerts.length > 0 ? (
        <ul className="space-y-2">
          {metrics.alerts.map((a) => (
            <li
              key={a}
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Row 1: Top Metrics Grid (6 columns) */}
      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <CommandMetric label="Revenue Today" value={metrics.revenueToday} href="/admin/revenue" icon={DollarSign} colorClass="text-emerald-400" />
          <CommandMetric label="Revenue Week" value={metrics.revenueWeek} href="/admin/revenue" icon={TrendingUp} colorClass="text-gold-soft" />
          <CommandMetric label="Revenue Month" value={metrics.revenueMonth} href="/admin/revenue" icon={Activity} colorClass="text-gold" />
          <CommandMetric label="Pending Deposits" value={metrics.pendingDeposits} href="/admin/revenue" icon={Clock} colorClass="text-amber-400" />
          <CommandMetric label="Open Balances" value={metrics.balanceDue} href="/admin/revenue" icon={AlertTriangle} colorClass="text-rose-400" />
          <CommandMetric label="Active Jobs" value={metrics.activeJobsCount} href="/admin/dispatch" icon={Zap} colorClass="text-cyan-400" />
        </div>
      </section>

      {/* Row 2: Business Intelligence (4 columns) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Card A: Lead Pipeline */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Lead Pipeline</SectionEyebrow>
              <PremiumBadge tone="gold">Funnel</PremiumBadge>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-white">{convertedLeads}</span>
              <span className="text-xs text-zinc-500">/ {totalLeads} converted</span>
            </div>
            {/* Lead stage breakdown */}
            <div className="mt-4 grid grid-cols-3 gap-1 text-center">
              <div className="rounded-lg bg-zinc-950/60 p-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase">New</p>
                <p className="font-mono text-sm font-bold text-white mt-0.5">{metrics.leadPipeline.newCount}</p>
              </div>
              <div className="rounded-lg bg-zinc-950/60 p-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase">Quoted</p>
                <p className="font-mono text-sm font-bold text-white mt-0.5">{metrics.leadPipeline.contactedCount}</p>
              </div>
              <div className="rounded-lg bg-zinc-950/60 p-2">
                <p className="text-[10px] font-bold text-emerald-500/80 uppercase">Booked</p>
                <p className="font-mono text-sm font-bold text-emerald-400 mt-0.5">{metrics.leadPipeline.convertedCount}</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Conversion Rate</span>
              <span className="font-mono font-bold text-gold-soft">{leadConvRate}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold/50 to-gold"
                style={{ width: `${leadConvRate}%` }}
              />
            </div>
          </div>
        </GlassCard>

        {/* Card B: Booking Health */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Booking Health</SectionEyebrow>
              <PremiumBadge tone={healthInfo.tone}>{healthInfo.label}</PremiumBadge>
            </div>
            <div className="mt-6 flex flex-col items-center justify-center py-2">
              <div className="relative flex items-center justify-center">
                {/* Visual gauge representation */}
                <svg className="h-20 w-20 transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="5"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="var(--gold-soft, #d4af37)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray={213}
                    strokeDashoffset={213 - (213 * metrics.bookingHealth) / 100}
                    className="transition-all duration-1000"
                  />
                </svg>
                <span className="absolute font-mono text-xl font-black text-white">{metrics.bookingHealth}%</span>
              </div>
              <p className="mt-4 text-center text-xs text-zinc-400">Ratio of confirmed & completed booking items</p>
            </div>
          </div>
        </GlassCard>

        {/* Card C: Team Performance */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Team Performance</SectionEyebrow>
              <span className="text-[9px] font-black uppercase text-zinc-500">Completed Jobs</span>
            </div>
            {metrics.techPerformance.length === 0 ? (
              <div className="mt-8 text-center text-xs text-zinc-500">
                No completed jobs this month.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {metrics.techPerformance.map((t) => {
                  const pct = Math.round((t.jobCount / maxJobs) * 100);
                  return (
                    <div key={t.techName} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-300 truncate max-w-[120px]">{t.techName}</span>
                        <span className="font-mono text-zinc-400">{t.jobCount} jobs · {displayMoney(t.revenueCents)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gold/50"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Card D: Recent Payments */}
        <GlassCard className="flex flex-col justify-between border-white/10 bg-black/40">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <SectionEyebrow>Recent Payments</SectionEyebrow>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            {metrics.recentPayments.length === 0 ? (
              <div className="mt-8 text-center text-xs text-zinc-500">
                No recent payments recorded.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-400">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] uppercase tracking-wider text-zinc-500">
                      <th className="py-1">Customer</th>
                      <th className="py-1 text-right">Amount</th>
                      <th className="py-1 text-right">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {metrics.recentPayments.slice(0, 4).map((p) => (
                      <tr key={p.id} className="hover:bg-white/5">
                        <td className="py-1.5 font-medium text-white truncate max-w-[80px]">{p.customer}</td>
                        <td className="py-1.5 text-right font-mono text-emerald-400 font-bold">{p.amount}</td>
                        <td className="py-1.5 text-right text-[10px] uppercase font-semibold text-zinc-500">{p.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </GlassCard>
      </section>

      {/* Row 3: Command Center Operations Feed (3 columns) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Live Dispatch Feed */}
        <GlassCard className="border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <SectionEyebrow>Live Dispatch Feed</SectionEyebrow>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
            </span>
          </div>
          {metrics.liveFeed.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No recent dispatch feed events.</p>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {metrics.liveFeed.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-zinc-950/40 p-3 hover:border-gold/20 transition duration-200"
                >
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-300 line-clamp-2">{e.title}</p>
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
        </GlassCard>

        {/* Column 2: Upcoming Appointments */}
        <GlassCard className="border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <SectionEyebrow>Upcoming Schedule</SectionEyebrow>
            <span className="text-[9px] font-black uppercase text-zinc-500">Next 5 Jobs</span>
          </div>
          {metrics.upcomingAppts.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No scheduled upcoming jobs.</p>
          ) : (
            <div className="space-y-2.5">
              {metrics.upcomingAppts.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/30 px-3 py-2.5 hover:border-white/10 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-white truncate max-w-[120px]">{app.guestName}</p>
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-400">
                        {app.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-500 uppercase tracking-wide truncate">
                      {app.service}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs font-bold text-gold-soft">{app.price}</p>
                    <p className="text-[9px] text-zinc-400 font-mono mt-0.5">{app.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Column 3: Technician Activity Status */}
        <GlassCard className="border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <SectionEyebrow>Technician Status</SectionEyebrow>
            <span className="text-[9px] font-black uppercase text-zinc-500">Field Activity</span>
          </div>
          {metrics.techActivity.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No technicians configured.</p>
          ) : (
            <div className="space-y-3">
              {metrics.techActivity.map((tech) => {
                const isActive = tech.status === 'active';
                return (
                  <div
                    key={tech.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/30 px-3 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="relative flex h-2 w-2 shrink-0">
                        {isActive && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            isActive ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white">{tech.name}</p>
                        {tech.activeJobName ? (
                          <p className="mt-0.5 text-[9px] text-emerald-400 truncate max-w-[160px]">
                            {tech.activeJobName}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[9px] text-zinc-500">Idle / Ready</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        isActive
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border border-zinc-700 bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {isActive ? 'On Job' : 'Idle'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </section>

      {/* Row 4: Quick Actions & Today's jobs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="gb-premium-card rounded-3xl border border-gold/15 bg-black/40 p-6">
          <SectionEyebrow>Quick actions</SectionEyebrow>
          <div className="mt-4 grid gap-3 grid-cols-2">
            {quick.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="gb-premium-card flex items-center gap-3 rounded-2xl border border-gold/15 bg-black/60 px-4 py-3.5 transition-all duration-300 hover:border-gold/45 hover:shadow-[0_0_24px_rgba(212,175,55,0.1)] hover:-translate-y-0.5"
              >
                <q.icon className="h-5 w-5 text-gold-soft shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider text-white truncate">{q.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="gb-premium-card rounded-3xl border border-gold/15 bg-black/40 p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
            <SectionEyebrow>Today&apos;s jobs</SectionEyebrow>
            <Link href="/admin/dispatch" className="text-[9px] font-black uppercase text-gold-soft hover:underline">
              Full dispatch →
            </Link>
          </div>
          {metrics.todayJobs.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl">
              No live jobs on the calendar for today — book or assign from Dispatch.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {metrics.todayJobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={j.href}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-zinc-950/40 px-3 py-2 transition hover:border-gold/30"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{j.guestName}</p>
                      <p className="text-[10px] text-zinc-500">
                        {j.when} · {j.service}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gold/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-gold-soft">
                        {j.status}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium">{j.techName}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
