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
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Percent,
  TrendingDown
} from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { PremiumBadge, SectionEyebrow, GlassCard } from '@/components/ui/premium';
import { displayMoney } from '@/lib/display-format';

// Helper component for TODAY metric cards
function TodayMetricCard({
  label,
  value,
  href,
  icon: Icon,
  colorClass = 'text-gold-soft',
  subtitle
}: {
  label: string;
  value: string | number;
  href?: string;
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
  href
}: {
  label: string;
  value: string | number;
  icon: any;
  colorClass?: string;
  status?: string;
  href?: string;
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
      {href && <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-gold transition" />}
    </div>
  );

  return href ? (
    <Link href={href} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function OwnerCommandCenter({ metrics, isSuperAdmin = false }: { metrics: OwnerDashboardSnapshot; isSuperAdmin?: boolean }) {
  const quickActions = [
    { href: '/book', label: 'New Booking', desc: 'Create manual field job', icon: Calendar, color: 'text-gold-soft' },
    { href: '/admin/dispatch', label: 'Dispatch Board', desc: 'Manage slots & routes', icon: Zap, color: 'text-cyan-400' },
    { href: '/admin/revenue', label: 'Revenue Center', desc: 'Payment details & charts', icon: TrendingUp, color: 'text-emerald-400' },
    { href: '/admin/customers', label: 'Customers', desc: 'Profiles & loyalty records', icon: Users, color: 'text-amber-400' },
    { href: '/admin/cms', label: 'Gallery Manager', desc: 'Review & publish showcase', icon: Sparkles, color: 'text-gold' },
    { href: 'https://dashboard.stripe.com/', label: 'Stripe Dashboard', desc: 'External Stripe Console', icon: ExternalLink, external: true, color: 'text-indigo-400' },
    { href: 'https://mail.google.com/', label: 'Gmail Admin', desc: 'Business mailbox console', icon: ExternalLink, external: true, color: 'text-red-400' },
    { href: 'https://console.twilio.com/', label: 'Twilio Console', desc: 'External SMS Console', icon: ExternalLink, external: true, color: 'text-rose-400' },
    { href: 'https://vercel.com/dashboard', label: 'Vercel Dashboard', desc: 'Deployments & production logs', icon: ExternalLink, external: true, color: 'text-white' },
  ];

  // Booking health label & color
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

      {/* SECTION 1: TODAY (Top Metrics Grid) */}
      <section>
        <SectionEyebrow>Command Center Overview · Today</SectionEyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <TodayMetricCard label="Revenue Today" value={metrics.revenueToday} href="/admin/revenue" icon={DollarSign} colorClass="text-emerald-400" subtitle="Succeeded gross payments" />
          <TodayMetricCard label="Revenue Week" value={metrics.revenueWeek} href="/admin/revenue" icon={TrendingUp} colorClass="text-gold-soft" subtitle="Rolling 7-day payments" />
          <TodayMetricCard label="Revenue Month" value={metrics.revenueMonth} href="/admin/revenue" icon={Activity} colorClass="text-gold" subtitle="MTD cumulative revenue" />
          <TodayMetricCard label="Open Balances" value={metrics.balanceDue} href="/admin/revenue" icon={AlertTriangle} colorClass="text-rose-400" subtitle="Receivables outstanding" />
          <TodayMetricCard label="Pending Deposits" value={metrics.pendingDeposits} href="/admin/revenue" icon={Clock} colorClass="text-amber-400" subtitle="Awaiting initial deposit" />
          <TodayMetricCard label="Active Jobs" value={metrics.activeJobsCount} href="/admin/dispatch" icon={Zap} colorClass="text-cyan-400" subtitle="Currently in progress" />
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
    </div>
  );
}
