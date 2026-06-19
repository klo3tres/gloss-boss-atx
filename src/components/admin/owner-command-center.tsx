'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo, useTransition } from 'react';
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
import { addCalendarEventAction } from '@/lib/admin/calendar-events-actions';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

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

// Interactive Revenue Console with Hover splines and segment highlights
function InteractiveRevenueDashboard({ metrics }: { metrics: OwnerDashboardSnapshot }) {
  const [activeTab, setActiveTab] = useState<'trend' | 'allocation'>('trend');
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
  
  const chartData = useMemo(() => {
    return [...metrics.recentPayments].reverse();
  }, [metrics.recentPayments]);

  const maxVal = useMemo(() => {
    if (chartData.length === 0) return 1000;
    return Math.max(...chartData.map(d => parseFloat(d.amount.replace(/[^0-9.]/g, '')) || 0), 1000);
  }, [chartData]);

  const points = useMemo(() => {
    return chartData.map((d, i) => {
      const x = 50 + (i * 410) / Math.max(1, chartData.length - 1);
      const val = parseFloat(d.amount.replace(/[^0-9.]/g, '')) || 0;
      const y = 145 - (val / maxVal) * 105;
      return { x, y, val, label: d.time, customer: d.customer, method: d.method };
    });
  }, [chartData, maxVal]);

  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, p, i, a) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const cpX1 = a[i - 1].x + (p.x - a[i - 1].x) / 2;
      const cpY1 = a[i - 1].y;
      const cpX2 = cpX1;
      const cpY2 = p.y;
      return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    return `${linePath} L ${points[points.length - 1].x} 150 L ${points[0].x} 150 Z`;
  }, [points, linePath]);

  const mix = metrics.paymentMixMonth;
  const gross = mix.grossCents || 1;
  const stripePct = Math.round((mix.stripeCents / gross) * 100);
  const cashPct = Math.round((mix.cashCents / gross) * 100);
  const zellePct = Math.round((mix.zelleCents / gross) * 100);
  const otherPct = Math.round((mix.otherCents / gross) * 100);

  const channels = [
    { label: 'Stripe', cents: mix.stripeCents, pct: stripePct, color: 'bg-indigo-500', barColor: '#6366f1' },
    { label: 'Zelle', cents: mix.zelleCents, pct: zellePct, color: 'bg-cyan-500', barColor: '#06b6d4' },
    { label: 'Cash', cents: mix.cashCents, pct: cashPct, color: 'bg-emerald-500', barColor: '#10b981' },
    { label: 'Other', cents: mix.otherCents, pct: otherPct, color: 'bg-amber-500', barColor: '#f59e0b' },
  ].filter(c => c.cents > 0 || c.pct > 0);

  return (
    <GlassCard className="border-gold/20 bg-black/60 shadow-[0_0_40px_rgba(212,175,55,0.06)] relative overflow-hidden">
      <div className="absolute -top-12 -right-12 h-32 w-32 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gold animate-pulse" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-white">Interactive Mission Revenue Console</span>
        </div>
        <div className="flex rounded-xl bg-black/50 border border-white/10 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('trend')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition duration-200 ${
              activeTab === 'trend' ? 'bg-gold/15 text-gold-soft border border-gold/20' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Gross Revenue Trend
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('allocation')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition duration-200 ${
              activeTab === 'allocation' ? 'bg-gold/15 text-gold-soft border border-gold/20' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Payment Channels
          </button>
        </div>
      </div>

      <div className="relative min-h-[190px] flex items-center justify-center">
        {activeTab === 'trend' ? (
          chartData.length === 0 ? (
            <div className="text-zinc-500 text-xs py-10 font-medium">No recent transaction data to map.</div>
          ) : (
            <div className="w-full relative">
              <svg className="w-full h-[180px]" viewBox="0 0 500 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4af37" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#d4af37" stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                  const y = 145 - p * 105;
                  return (
                    <line key={idx} x1="40" y1={y} x2="480" y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  );
                })}

                {areaPath && <path d={areaPath} fill="url(#chartGrad)" />}

                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#d4af37"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="drop-shadow-[0_2px_8px_rgba(212,175,55,0.3)]"
                  />
                )}

                {points.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x}
                    cy={p.y}
                    r={hoveredPoint === p ? "5" : "3.5"}
                    className={`transition-all duration-200 ${
                      hoveredPoint === p ? "fill-gold stroke-white stroke-2 shadow-[0_0_12px_#d4af37]" : "fill-black stroke-gold/60 stroke-2"
                    }`}
                  />
                ))}

                {points.map((p, idx) => (
                  <text
                    key={idx}
                    x={p.x}
                    y="170"
                    textAnchor="middle"
                    className="font-mono text-[8px] fill-zinc-500 uppercase tracking-widest font-black"
                  >
                    {p.label}
                  </text>
                ))}
                
                {[0, 0.5, 1].map((p, idx) => {
                  const y = 145 - p * 105;
                  const labelVal = Math.round(p * maxVal);
                  return (
                    <text
                      key={idx}
                      x="32"
                      y={y + 3}
                      textAnchor="end"
                      className="font-mono text-[8px] fill-zinc-600 font-bold"
                    >
                      ${labelVal}
                    </text>
                  );
                })}

                {points.map((p, idx) => (
                  <rect
                    key={idx}
                    x={p.x - 20}
                    y="20"
                    width="40"
                    height="135"
                    className="fill-transparent cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(p)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}
              </svg>

              {hoveredPoint && (
                <div 
                  className="absolute bg-black/95 border border-gold/30 rounded-xl p-3 shadow-2xl backdrop-blur-md text-[10px] space-y-1 z-10 pointer-events-none"
                  style={{
                    left: `${Math.min(380, Math.max(20, (hoveredPoint.x / 500) * 100 - 15))}%`,
                    top: `${Math.min(90, (hoveredPoint.y / 180) * 100 - 40)}px`
                  }}
                >
                  <p className="font-black uppercase tracking-wider text-gold-soft">{hoveredPoint.customer}</p>
                  <p className="font-mono font-bold text-white text-xs">${hoveredPoint.val.toFixed(2)}</p>
                  <p className="text-zinc-400 capitalize">{hoveredPoint.method} · {hoveredPoint.label}</p>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="w-full py-4 space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 justify-around">
              <div className="relative h-32 w-32 shrink-0 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.03)" strokeWidth="12" fill="none" />
                  {(() => {
                    let accPct = 0;
                    return channels.map((c, i) => {
                      const strokeDash = 251.2;
                      const strokeDashOffset = strokeDash - (strokeDash * c.pct) / 100;
                      const rotateVal = (accPct / 100) * 360;
                      accPct += c.pct;
                      return (
                        <circle
                          key={i}
                          cx="50"
                          cy="50"
                          r="40"
                          stroke={c.barColor}
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={strokeDash}
                          strokeDashoffset={strokeDashOffset}
                          style={{
                            transformOrigin: '50px 50px',
                            transform: `rotate(${rotateVal}deg)`,
                          }}
                          className="transition-all duration-500 ease-out"
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="font-mono text-xs font-black text-zinc-400">MTD Total</span>
                  <span className="font-mono text-sm font-black text-white">${(gross / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              <div className="flex-1 max-w-sm space-y-3 w-full">
                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Gross Month-To-Date Channel Mix</p>
                <div className="grid grid-cols-2 gap-3">
                  {channels.map((c) => (
                    <div 
                      key={c.label}
                      className="rounded-xl border border-white/5 bg-zinc-950/40 p-2.5 flex items-center gap-2.5 hover:border-white/10 transition"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${c.color} shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">{c.label}</p>
                        <p className="font-mono font-bold text-white text-xs mt-0.5">${(c.cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-[9px] text-zinc-500 font-medium">({c.pct}%)</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function chicagoDateKey(input: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function ExecutiveCalendarWidget({ jobs, events }: { jobs: OwnerDashboardSnapshot['scheduleMonth']; events: OwnerDashboardSnapshot['calendarEvents'] }) {
  const now = new Date();
  const [selectedDay, setSelectedDay] = useState<string | null>(todayKeySafe(now));
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Chicago' }).format(now);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const blanks = first.getDay();
  const todayKey = chicagoDateKey(now);
  const jobsByDay = new Map<string, OwnerDashboardSnapshot['scheduleMonth']>();
  for (const job of jobs) {
    const bucket = jobsByDay.get(job.dayKey) ?? [];
    bucket.push(job);
    jobsByDay.set(job.dayKey, bucket);
  }
  const eventsByDay = new Map<string, OwnerDashboardSnapshot['calendarEvents']>();
  for (const event of events ?? []) {
    const bucket = eventsByDay.get(event.dayKey) ?? [];
    bucket.push(event);
    eventsByDay.set(event.dayKey, bucket);
  }

  const cells = [
    ...Array.from({ length: blanks }, (_, i) => ({ type: 'blank' as const, key: `blank-${i}` })),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), i + 1);
      const key = chicagoDateKey(date);
      return { type: 'day' as const, key, day: i + 1, jobs: jobsByDay.get(key) ?? [] };
    }),
  ];
  const selectedJobs = selectedDay ? jobsByDay.get(selectedDay) ?? [] : [];
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];
  const selectedLabel = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' })
    : 'Select a day';

  return (
    <GlassCard className="border-gold/15 bg-black/45">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <SectionEyebrow>Executive Calendar</SectionEyebrow>
          <p className="mt-1 font-mono text-lg font-black text-white">{monthName}</p>
        </div>
        <button type="button" onClick={() => setSelectedDay(todayKey)} className="rounded-xl border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/10">
          Open calendar
        </button>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[9px] font-black uppercase tracking-wider text-zinc-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {cells.map((cell) =>
          cell.type === 'blank' ? (
            <div key={cell.key} className="min-h-20 rounded-2xl border border-transparent" />
          ) : (
            <button
              type="button"
              onClick={() => setSelectedDay(cell.key)}
              key={cell.key}
              className={`min-h-16 rounded-2xl border p-2 text-left transition-all hover:-translate-y-0.5 sm:min-h-20 ${
                cell.key === todayKey
                  ? 'border-gold/50 bg-gold/10 shadow-[0_0_22px_rgba(212,175,55,0.14)]'
                  : 'border-white/10 bg-zinc-950/55 hover:border-gold/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-white">{cell.day}</span>
                {cell.jobs.length + (eventsByDay.get(cell.key)?.length ?? 0) > 0 ? <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-black text-gold-soft">{cell.jobs.length + (eventsByDay.get(cell.key)?.length ?? 0)}</span> : null}
              </div>
              <div className="mt-2 hidden space-y-1 sm:block">
                {cell.jobs.slice(0, 2).map((job) => (
                  <Link key={job.id} href={job.href} className="block truncate rounded-lg bg-black/45 px-1.5 py-1 text-left text-[9px] font-bold text-zinc-300 hover:text-gold-soft">
                    {job.time} {job.guestName}
                  </Link>
                ))}
                {cell.jobs.length > 2 ? <p className="text-left text-[9px] text-zinc-500">+{cell.jobs.length - 2} more</p> : null}
              </div>
            </button>
          ),
        )}
      </div>
      {selectedDay ? (
        <div className="fixed inset-x-0 bottom-0 z-[120] max-h-[82vh] overflow-y-auto rounded-t-3xl border border-gold/20 bg-zinc-950 p-5 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:absolute sm:inset-auto sm:bottom-5 sm:right-5 sm:max-h-[70vh] sm:w-[420px] sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Calendar day</p>
              <h3 className="mt-1 text-lg font-black uppercase text-white">{selectedLabel}</h3>
              <p className="mt-1 text-xs text-zinc-500">Weather appears when OpenWeather is configured.</p>
            </div>
            <button type="button" onClick={() => setSelectedDay(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-300">Close</button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/45 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Scheduled jobs</p>
              {selectedJobs.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No scheduled jobs for this day.</p> : null}
              <div className="mt-2 space-y-2">
                {selectedJobs.map((job) => (
                  <Link key={job.id} href={job.href} className="block rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 hover:border-gold/30">
                    <span className="font-black text-white">{job.time}</span> - {job.guestName} - {job.service}
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/45 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Internal notes / events</p>
              {selectedEvents.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No internal events yet.</p> : null}
              <div className="mt-2 space-y-2">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs">
                    <p className="font-black text-white">{event.title}</p>
                    {event.note ? <p className="mt-1 text-zinc-500">{event.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>
            <form
              action={(formData) => {
                setResult(null);
                startTransition(async () => {
                  const res = await addCalendarEventAction(formData);
                  setResult(res);
                });
              }}
              className="rounded-2xl border border-gold/15 bg-gold/5 p-3"
            >
              <input type="hidden" name="dayKey" value={selectedDay} />
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Add event / note</p>
              <input name="title" required placeholder="Event title" className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              <textarea name="note" rows={3} placeholder="Optional note" className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-base text-white md:text-sm" />
              {result ? <p className={`mt-2 text-xs ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{result.message || result.error}</p> : null}
              <button disabled={pending} className="mt-3 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-60">{pending ? 'Saving...' : 'Add event'}</button>
            </form>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function todayKeySafe(input: Date) {
  return chicagoDateKey(input);
}

function WeatherReadinessWidget() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/weather', { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data: WeatherSnapshot) => setWeather(data))
      .catch((error) => setWeather({ ok: false, blocker: error instanceof Error ? error.message : 'Weather lookup failed.' }))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const rain = weather?.rainChancePct ?? 0;
  const highRain = rain >= 45;

  return (
    <GlassCard className="border-cyan-400/15 bg-black/45">
      <SectionEyebrow>Weather Readiness</SectionEyebrow>
      <p className="mt-4 text-3xl font-black text-white">Austin / Round Rock</p>
      {loading ? <p className="mt-4 text-xs text-zinc-500">Checking service-area weather...</p> : null}
      {weather?.ok ? (
        <div className="mt-4 grid gap-2 text-xs text-zinc-300">
          <div className={`rounded-xl border p-3 ${highRain || weather.severe ? 'border-rose-500/30 bg-rose-500/10' : 'border-cyan-400/20 bg-cyan-400/5'}`}>
            <p className="font-black uppercase tracking-wider text-cyan-200">Current condition - OpenWeather</p>
            <p className="mt-2 text-2xl font-black text-white">{weather.temperatureF ?? '--'}F</p>
            <p className="mt-1 capitalize text-zinc-400">{weather.description || weather.condition || 'Forecast available'} - rain {rain}%</p>
          </div>
          {highRain || weather.severe ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-100">
              Weather may affect mobile detailing. Confirm exterior work, shade, wind, and rain before dispatch.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3">
              <p className="font-black uppercase tracking-wider text-white">Dispatch rule</p>
              <p className="mt-1 text-zinc-500">Verify heat, rain, and wind before exterior correction or wash work.</p>
            </div>
          )}
          {weather.appleAdvancedApi?.configured ? null : (
            <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3 text-zinc-400">
              <p className="font-black uppercase tracking-wider text-zinc-200">Apple advanced APIs</p>
              <p className="mt-1">{weather.appleAdvancedApi?.message || 'Apple advanced weather/maps API not configured. Basic Apple Maps links still work.'}</p>
            </div>
          )}
        </div>
      ) : !loading ? (
        <div className="mt-4 grid gap-2 text-xs text-zinc-300">
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
            <p className="font-black uppercase tracking-wider text-amber-200">Weather setup blocker</p>
            <p className="mt-1 text-zinc-300">{weather?.blocker || 'missing OPENWEATHER_API_KEY'}</p>
            <ul className="mt-2 space-y-1 text-amber-100">
              <li>missing OPENWEATHER_API_KEY</li>
              <li>Add it in Vercel Project Settings - Environment Variables.</li>
              <li>Optional: BUSINESS_HOME_BASE_ADDRESS, BUSINESS_LAT, BUSINESS_LNG.</li>
              <li>OpenWeather is the active weather provider for this widget.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3">
            <p className="font-black uppercase tracking-wider text-zinc-200">Apple advanced APIs</p>
            <p className="mt-1 text-zinc-400">{weather?.appleAdvancedApi?.message || 'Apple advanced weather/maps API not configured. Basic Apple Maps links still work.'}</p>
            {weather?.appleAdvancedApi?.missing?.length ? (
              <p className="mt-2 break-words font-mono text-[10px] text-zinc-500">
                Missing later: {weather.appleAdvancedApi.missing.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <Link href="/admin/integrations#weather" className="mt-5 inline-flex rounded-xl border border-cyan-400/30 px-4 py-2 text-xs font-black uppercase text-cyan-200 hover:bg-cyan-400/10">
        Configure weather
      </Link>
    </GlassCard>
  );
}

function ExecutiveRecommendations({ metrics }: { metrics: OwnerDashboardSnapshot }) {
  const recommendations = [
    {
      title: 'Close receivables',
      metric: metrics.balanceDue,
      action: 'Open balance calls and payment links should happen before new dispatch planning.',
      href: '/admin/payments',
      tone: 'text-rose-300',
    },
    {
      title: 'Lock tomorrow',
      metric: `${metrics.jobsTomorrowCount} jobs`,
      action: metrics.jobsTomorrowCount > 0 ? 'Confirm assignments, addresses, and first-stop arrival windows.' : 'Use the quiet window to fill the route from leads.',
      href: '/admin/dispatch',
      tone: 'text-cyan-300',
    },
    {
      title: 'Raise ticket quality',
      metric: metrics.averageTicketSize,
      action: 'Audit add-ons and memberships on upcoming bookings before the customer arrives.',
      href: '/admin/services',
      tone: 'text-gold-soft',
    },
    {
      title: 'Recover deposits',
      metric: metrics.pendingDeposits,
      action: 'Send deposit reminders for unconfirmed bookings before the route gets crowded.',
      href: '/admin/booking-health',
      tone: 'text-amber-300',
    },
    {
      title: 'Repeat engine',
      metric: `${metrics.customerRetentionRate}%`,
      action: 'Target recent premium customers with membership and maintenance follow-up.',
      href: '/admin/customers',
      tone: 'text-emerald-300',
    },
    {
      title: 'Notification health',
      metric: `${metrics.notificationRows.filter((n) => ['failed', 'error'].includes(n.status.toLowerCase())).length} blockers`,
      action: 'Clear failed booking, payment, and work-order notifications before they age.',
      href: '/admin/notifications',
      tone: 'text-indigo-300',
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionEyebrow>Actionable BI Recommendations</SectionEyebrow>
        <Link href="/admin/reports" className="text-[10px] font-black uppercase text-gold-soft">Reports</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((item) => (
          <Link key={item.title} href={item.href} className="group rounded-2xl border border-white/10 bg-black/45 p-4 transition-all hover:-translate-y-0.5 hover:border-gold/30 hover:bg-black/60">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{item.title}</p>
              <ArrowUpRight className="h-4 w-4 text-zinc-600 transition group-hover:text-gold-soft" />
            </div>
            <p className={`mt-3 font-mono text-2xl font-black ${item.tone}`}>{item.metric}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{item.action}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function OwnerCommandCenter({ metrics, isSuperAdmin = false, goals = [] }: { metrics: OwnerDashboardSnapshot; isSuperAdmin?: boolean; goals?: any[] }) {
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

            <details className="rounded-xl border border-zinc-700/50 bg-zinc-950/50 p-4">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-500">
                Stale / test balances (excluded from active total) — {displayMoney(metrics.staleBalancesCents ?? 0)}
              </summary>
              <div className="mt-3 space-y-2">
                {(metrics.staleBalanceRows ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500">No stale balances hidden from active dashboard.</p>
                ) : (
                  (metrics.staleBalanceRows ?? []).slice(0, 8).map((item) => (
                    <div key={item.id} className="flex justify-between text-xs text-zinc-400 border-b border-white/5 py-2 last:border-0">
                      <span>{item.label} · {item.category ?? 'stale'}</span>
                      <span className="font-mono">{displayMoney(item.amountCents)}</span>
                    </div>
                  ))
                )}
              </div>
            </details>

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
                { title: 'MTD Revenue Target', target: '$10,000.00', current: metrics.revenueMonth, value: (metrics.financial?.grossRevenueCents ?? 0) / 100, max: 10000 },
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
        const membershipMetrics = metrics.membershipMetrics ?? { activeTotal: 0, bronze: 0, silver: 0, gold: 0, renewingThisWeek: 0 };
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Membership & Loyalty Tiers</p>
              <h2 className="text-4xl font-black text-gold-soft mt-1 font-mono">{metrics.membershipRevenueMonth} <span className="text-xs text-zinc-500 font-medium">MTD</span></h2>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3 text-xs">
                <p className="font-bold uppercase tracking-wider text-[10px] text-zinc-400">Live Membership Tiers</p>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Active total</span>
                  <span className="font-bold text-white font-mono">{membershipMetrics.activeTotal} members</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Bronze</span>
                  <span className="font-bold text-orange-200 font-mono">{membershipMetrics.bronze} members</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Silver</span>
                  <span className="font-bold text-zinc-200 font-mono">{membershipMetrics.silver} members</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Gold</span>
                  <span className="font-bold text-gold-soft font-mono">{membershipMetrics.gold} members</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Renewing this week</span>
                  <span className="font-bold text-emerald-300 font-mono">{membershipMetrics.renewingThisWeek}</span>
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
        const notifications = metrics.notificationRows ?? [];
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

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Owner Notification Outbox</p>
              <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">No owner notification rows found yet.</p>
                ) : (
                  notifications.slice(0, 12).map((notice) => (
                    <Link
                      key={notice.id}
                      href={notice.href}
                      onClick={() => setActiveDrawer(null)}
                      className="block rounded-xl border border-white/10 bg-black/35 p-3 text-xs hover:border-gold/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold capitalize text-white">{notice.kind.replace(/_/g, ' ')}</p>
                          <p className="mt-1 text-[10px] text-zinc-500">{notice.title}</p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${notice.status === 'failed' ? 'bg-rose-500/15 text-rose-200' : notice.status === 'sent' || notice.status === 'delivered' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>
                            {notice.status}
                          </span>
                          <p className="mt-1 text-[9px] text-zinc-600">{notice.createdAt ? new Date(notice.createdAt).toLocaleString() : 'No date'}</p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

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

  const getAlertAction = (alertText: string) => {
    const text = alertText.toLowerCase();
    if (text.includes('open balance') || text.includes('receivable')) {
      return (
        <button
          type="button"
          onClick={() => setActiveDrawer('open-balances')}
          className="shrink-0 rounded-lg bg-rose-500/25 border border-rose-500/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-200 hover:bg-rose-500/35 transition-all"
        >
          Collect Balance
        </button>
      );
    }
    if (text.includes('unassigned') || text.includes('need attention')) {
      return (
        <Link
          href="/admin/dispatch"
          className="shrink-0 rounded-lg bg-cyan-500/25 border border-cyan-500/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/35 transition-all"
        >
          Assign Tech
        </Link>
      );
    }
    if (text.includes('supply request')) {
      return (
        <Link
          href="/admin/supply-requests"
          className="shrink-0 rounded-lg bg-amber-500/25 border border-amber-500/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/35 transition-all"
        >
          Review Requests
        </Link>
      );
    }
    if (text.includes('store credit') || text.includes('credit expiring')) {
      return (
        <button
          type="button"
          onClick={() => setActiveDrawer('credits')}
          className="shrink-0 rounded-lg bg-rose-500/25 border border-rose-500/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-200 hover:bg-rose-500/35 transition-all"
        >
          Inspect Credits
        </button>
      );
    }
    return null;
  };

  const healthPercent = Math.min(100, Math.max(0, metrics.bookingHealth ?? 0));
  const circ = 2 * Math.PI * 36;
  const strokeDashoffset = circ - (healthPercent / 100) * circ;

  return (
    <div className="space-y-8 pb-10">
      {/* Alert Banner if any */}
      {metrics.alerts.length > 0 ? (
        <ul className="space-y-2">
          {metrics.alerts.map((a) => {
            const action = getAlertAction(a);
            return (
              <motion.li
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                key={a}
                className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>{a}</span>
                </div>
                {action}
              </motion.li>
            );
          })}
        </ul>
      ) : null}

      {/* Operational Goals (Large, Glowing, Interactive) */}
      <section className="gb-premium-card rounded-3xl border border-gold/30 bg-black/55 p-6 shadow-[0_0_50px_rgba(212,175,55,0.15)] relative overflow-hidden">
        <div className="absolute -top-12 -left-12 h-40 w-40 bg-gold/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 h-40 w-40 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-6">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-gold animate-pulse" />
            <span className="text-sm font-black uppercase tracking-[0.2em] text-white">Active Operational Targets</span>
          </div>
          <Link href="/admin/goals" className="text-[10px] font-black uppercase text-gold hover:underline">
            Goal Configurator →
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {goals && goals.length > 0 ? (
            goals.map((g) => {
              const isCents = g.unit === 'cents';
              const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
              const isComplete = g.status === 'completed' || pct >= 100;
              const displayVal = isCents ? displayMoney(g.current_value) : String(g.current_value);
              const targetVal = isCents ? displayMoney(g.target_value) : String(g.target_value);
              
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveDrawer('goals')}
                  className="group text-left rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all duration-300 hover:border-gold/45 hover:bg-black/60 hover:shadow-[0_0_30px_rgba(212,175,55,0.12)] focus:outline-none relative overflow-hidden"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 group-hover:text-gold-soft transition">{g.title}</p>
                      <p className="mt-2 font-mono text-xl font-black text-white">
                        {displayVal}
                        <span className="text-xs text-zinc-500 font-medium"> / {targetVal}</span>
                      </p>
                    </div>
                    <div className="relative h-12 w-12 shrink-0">
                      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.04)" strokeWidth="10" fill="none" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          stroke={isComplete ? '#10b981' : '#d4af37'}
                          strokeWidth="10"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray="251"
                          strokeDashoffset={251 - (251 * pct) / 100}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-mono text-[10px] font-black text-white">{pct}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${
                        isComplete ? 'from-emerald-500 to-teal-400' : 'from-gold via-gold-soft to-amber-400'
                      }`}
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                  
                  <div className="mt-2.5 flex justify-between items-center text-[9px] text-zinc-500 font-medium">
                    <span className="capitalize">{g.goal_type.replace(/_/g, ' ')}</span>
                    {g.period_end ? (
                      <span>Ends {new Date(g.period_end).toLocaleDateString()}</span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </div>
                  
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gold transition-all duration-300 group-hover:w-full" />
                </button>
              );
            })
          ) : (
            /* Fallback Goals (if none configured) */
            [
              { title: 'MTD Revenue Target', current: metrics.revenueMonth, target: '$10,000.00', pct: Math.min(100, Math.round((parseFloat(metrics.revenueMonth.replace(/[^0-9.]/g, '')) / 10000) * 100)) },
              { title: 'Client Repeat Retention', current: `${metrics.customerRetentionRate}%`, target: '70%', pct: Math.min(100, Math.round((metrics.customerRetentionRate / 70) * 100)) },
              { title: 'Loyalty Portal Signups', current: `${metrics.loyaltyParticipation}%`, target: '50%', pct: Math.min(100, Math.round((metrics.loyaltyParticipation / 50) * 100)) }
            ].map((g, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveDrawer('goals')}
                className="group text-left rounded-2xl border border-white/10 bg-zinc-950/40 p-5 transition-all duration-300 hover:border-gold/45 hover:bg-black/60 hover:shadow-[0_0_30px_rgba(212,175,55,0.12)] focus:outline-none relative overflow-hidden"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 group-hover:text-gold-soft transition">{g.title}</p>
                    <p className="mt-2 font-mono text-xl font-black text-white">
                      {g.current}
                      <span className="text-xs text-zinc-500 font-medium"> / {g.target}</span>
                    </p>
                  </div>
                  <div className="relative h-12 w-12 shrink-0">
                    <svg className="h-12 w-12 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.04)" strokeWidth="10" fill="none" />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#d4af37"
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray="251"
                        strokeDashoffset={251 - (251 * g.pct) / 100}
                        className="transition-all duration-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-mono text-[10px] font-black text-white">{g.pct}%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-amber-400 transition-all duration-500" style={{ width: `${g.pct}%` }} />
                </div>
                
                <div className="mt-2.5 flex justify-between items-center text-[9px] text-zinc-500 font-medium">
                  <span>Automatic Tracked</span>
                  <span>Rolling Month</span>
                </div>
                <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gold transition-all duration-300 group-hover:w-full" />
              </button>
            ))
          )}
        </div>
      </section>

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

      {/* SECTION 1: EXECUTIVE SNAPSHOT (Top Section) */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1.7fr]">
        {/* Booking Health Dial Card */}
        <GlassCard className="border-gold/25 bg-black/65 p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-[0_0_30px_rgba(212,175,55,0.06)] relative overflow-hidden group hover:border-gold/45 transition-all duration-300">
          <div className="absolute -top-12 -left-12 h-40 w-40 bg-gold/5 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-3 text-center sm:text-left min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Advanced Health Signal</span>
            <div>
              <p className="text-zinc-400 text-xs">Revenue, receivables, dispatch, and customer momentum</p>
              <h2 className="mt-1 font-mono text-3xl font-black text-white tracking-tight">
                {healthInfo.label}
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              Your headquarters is operating at <strong className="text-white">{healthPercent}%</strong>. Watch receivables, pending deposits, and unassigned jobs first.
            </p>
          </div>
          
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-zinc-950/60 border border-white/10 p-2 shadow-inner">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" className="text-white/5" strokeWidth="6" stroke="currentColor" fill="none" />
              <circle
                cx="40"
                cy="40"
                r="36"
                className="text-gold-soft transition-all duration-1000 ease-out"
                strokeWidth="6"
                strokeDasharray={circ}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="font-mono text-2.5xl font-black text-white">{healthPercent}%</span>
              <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Score</span>
            </div>
          </div>
        </GlassCard>

        {/* Executive Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <TodayMetricCard label="Today's Revenue" value={metrics.revenueToday} href="/admin/revenue" icon={DollarSign} colorClass="text-emerald-400" subtitle="Cash collected today" />
          <TodayMetricCard label="This Week Revenue" value={metrics.revenueWeek} href="/admin/revenue" icon={TrendingUp} colorClass="text-emerald-300" subtitle="Week-to-date collections" />
          <TodayMetricCard label="This Month Revenue" value={metrics.revenueMonth} href="/admin/revenue" icon={DollarSign} colorClass="text-gold" subtitle="Month-to-date collections" />
          <TodayMetricCard label="Open Balances" value={metrics.balanceDue} onClick={() => setActiveDrawer('open-balances')} icon={AlertTriangle} colorClass="text-rose-400" subtitle="Receivables outstanding" />
          <TodayMetricCard label="Pending Deposits" value={metrics.pendingDeposits} onClick={() => setActiveDrawer('pending-deposits')} icon={Clock} colorClass="text-amber-400" subtitle="Awaiting initial deposit" />
          <TodayMetricCard label="Bookings Today" value={metrics.jobsTodayCount} onClick={() => setActiveDrawer('bookings')} icon={Calendar} colorClass="text-cyan-400" subtitle={`${metrics.dispatchCompletedToday} completed`} />
          <TodayMetricCard label="Jobs Tomorrow" value={metrics.jobsTomorrowCount} href="/admin/dispatch" icon={Calendar} colorClass="text-cyan-300" subtitle="Route planning focus" />
          <TodayMetricCard label="Jobs Scheduled" value={metrics.upcomingAppts.length} href="/admin/dispatch" icon={ClipboardList} colorClass="text-sky-300" subtitle="Upcoming visible jobs" />
          <TodayMetricCard label="Average Ticket" value={metrics.averageTicketSize} href="/admin/revenue" icon={BadgePercent} colorClass="text-gold-soft" subtitle="Month-to-date quality" />
          <TodayMetricCard label="Repeat Rate" value={`${metrics.customerRetentionRate}%`} href="/admin/customers" icon={Users} colorClass="text-emerald-300" subtitle="Customers with multiple jobs" />
          <TodayMetricCard label="Fleet Accounts" value={metrics.leadPipeline.convertedCount} href="/admin/fleet" icon={Users} colorClass="text-indigo-300" subtitle="Converted commercial leads" />
          <TodayMetricCard label="Membership Revenue" value={metrics.membershipRevenueMonth} onClick={() => setActiveDrawer('memberships')} icon={Sparkles} colorClass="text-gold" subtitle={`${metrics.membershipMetrics?.activeTotal ?? 0} active members`} />
          <TodayMetricCard label="Customer Credits" value={displayMoney(metrics.creditMetrics?.outstandingLiabilityCents ?? 0)} onClick={() => setActiveDrawer('credits')} icon={CreditCard} colorClass="text-rose-300" subtitle="Outstanding liability" />
          
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-5 transition-all duration-300 hover:border-gold/30 hover:bg-black/60 flex flex-col justify-between xl:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Revenue Forecast</span>
              <div className="rounded-lg bg-zinc-950/60 p-2 border border-white/5 group-hover:border-gold/20 transition-all">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 opacity-85" />
              </div>
            </div>
            <p className="mt-3 font-mono text-lg font-black text-white truncate">
              {dispatchStatus}
            </p>
            <p className="text-[10px] text-zinc-500 font-medium">{techStatusLabel} · forecast improves when deposits and open balances close</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <ExecutiveCalendarWidget jobs={metrics.scheduleMonth ?? []} events={metrics.calendarEvents ?? []} />
        <WeatherReadinessWidget />
      </section>

      <ExecutiveRecommendations metrics={metrics} />

      {/* Interactive Mission Revenue Console */}
      <InteractiveRevenueDashboard metrics={metrics} />

      {/* SECTION 2: ACTIONABLE ALERTS (Middle Section) */}
      <section className="space-y-3">
        <SectionEyebrow>Actionable Alerts & Tasks</SectionEyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Expiring Store Credits */}
          {metrics.creditMetrics?.expiringSoon && metrics.creditMetrics.expiringSoon.length > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-col justify-between hover:border-rose-500/50 transition">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs uppercase text-rose-300">Credits Expiring Soon</h4>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {metrics.creditMetrics.expiringSoon.length} customer credit(s) expire within 30 days.
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveDrawer('credits')} className="mt-3 text-[10px] font-black uppercase text-rose-400 hover:underline text-left">
                Manage Credits →
              </button>
            </div>
          )}

          {/* Unread Messages */}
          {metrics.unreadMessageCount > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col justify-between hover:border-amber-500/50 transition">
              <div className="flex items-start gap-2.5">
                <MessageSquare className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs uppercase text-amber-300 font-mono">Unread Messages</h4>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    You have {metrics.unreadMessageCount} new message(s) from customers.
                  </p>
                </div>
              </div>
              <Link href="/admin/messages" className="mt-3 text-[10px] font-black uppercase text-amber-400 hover:underline text-left">
                Open Chat Hub →
              </Link>
            </div>
          )}

          {/* Booking Health issues or Unassigned Jobs */}
          {(metrics.dispatchUnassignedToday > 0 || metrics.bookingHealth < 75) && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 flex flex-col justify-between hover:border-cyan-500/50 transition">
              <div className="flex items-start gap-2.5">
                <Zap className="h-5 w-5 shrink-0 text-cyan-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs uppercase text-cyan-300">Booking & Dispatch Alert</h4>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {metrics.dispatchUnassignedToday > 0 
                      ? `${metrics.dispatchUnassignedToday} unassigned job(s) today need scheduling.`
                      : `Booking health is currently at ${metrics.bookingHealth}%.`}
                  </p>
                </div>
              </div>
              <Link href="/admin/dispatch" className="mt-3 text-[10px] font-black uppercase text-cyan-400 hover:underline text-left">
                Open Dispatch Board →
              </Link>
            </div>
          )}

          {/* Custom Alerts */}
          {metrics.alerts.map((alert, idx) => (
            <div key={idx} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-zinc-500 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs uppercase text-zinc-300">System Alert</h4>
                <p className="text-[10px] text-zinc-500 mt-1">{alert}</p>
              </div>
            </div>
          ))}

          {/* Empty state alert if clear */}
          {(!metrics.creditMetrics?.expiringSoon?.length && metrics.unreadMessageCount === 0 && metrics.dispatchUnassignedToday === 0 && metrics.bookingHealth >= 75 && !metrics.alerts.length) && (
            <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-4 sm:col-span-2 lg:col-span-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-xs uppercase text-white">All Clear</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">No critical alerts or pending customer items.</p>
                </div>
              </div>
              <PremiumBadge tone="emerald">Healthy</PremiumBadge>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: COMMAND CENTER SHORTCUTS (Bottom Section) */}
      <section>
        <SectionEyebrow>Command Center Shortcuts</SectionEyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { href: '/admin/operations', label: 'Operations', desc: 'Expenses & mileage logs', icon: ClipboardList, color: 'text-indigo-400' },
            { href: '/admin/dispatch', label: 'Dispatch', desc: 'Slots, routes & technicians', icon: Zap, color: 'text-cyan-400' },
            { href: '/admin/customers', label: 'Customers', desc: 'CRM directory & profiles', icon: Users, color: 'text-amber-400' },
            { href: '/admin/revenue', label: 'Revenue', desc: 'Sales ledger & statements', icon: DollarSign, color: 'text-emerald-400' },
            { href: '/admin/reports', label: 'Reports', desc: 'Tax & financial exports', icon: Activity, color: 'text-rose-300' },
          ].map((q) => (
            <Link key={q.label} href={q.href} className="group block focus:outline-none">
              <div className="group relative h-28 flex flex-col justify-between rounded-2xl border border-gold/15 bg-black/60 p-4 transition-all duration-300 hover:border-gold/45 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(212,175,55,0.1)]">
                <div className="flex items-center justify-between">
                  <div className={`rounded-xl bg-zinc-950/60 p-2.5 border border-white/5 group-hover:border-gold/20 transition-all ${q.color}`}>
                    <q.icon className="h-5 w-5 shrink-0" />
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white mt-2 truncate">{q.label}</h3>
                  <p className="text-[9px] text-zinc-500 font-medium truncate mt-0.5 group-hover:text-zinc-400 transition">{q.desc}</p>
                </div>
                <div className="absolute top-0 right-0 h-2 w-2 rounded-bl-lg bg-gold-soft/0 group-hover:bg-gold-soft/20 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* SECTION 4: ADVANCED SYSTEM HEALTH (Collapsed by default) */}
      <section className="border border-white/5 rounded-3xl overflow-hidden bg-zinc-950/45">
        <details className="group">
          <summary className="flex items-center justify-between px-6 py-4 cursor-pointer text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white select-none">
            <span>Advanced System Health</span>
            <ChevronRight className="h-4 w-4 transform group-open:rotate-90 transition-transform duration-200" />
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-white/5 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { href: '/admin/work-orders/add-past', label: 'Add Past Job', desc: 'Backfill completed work', icon: ClipboardList, color: 'text-amber-300' },
                { href: '/admin/system-diagnostics', label: 'Diagnostics', desc: 'Find data blockers fast', icon: Wrench, color: 'text-rose-300' },
                { href: '/admin/cms', label: 'Gallery Manager', desc: 'Review & publish showcase', icon: Sparkles, color: 'text-gold' },
                { href: 'https://dashboard.stripe.com/', label: 'Stripe Dashboard', desc: 'External Stripe Console', icon: ExternalLink, external: true, color: 'text-indigo-400' },
                { href: 'https://mail.google.com/', label: 'Gmail Admin', desc: 'Business mailbox console', icon: ExternalLink, external: true, color: 'text-red-400' },
                { href: 'https://console.twilio.com/', label: 'Twilio Console', desc: 'External SMS Console', icon: ExternalLink, external: true, color: 'text-rose-400' },
                { href: 'https://vercel.com/dashboard', label: 'Vercel Dashboard', desc: 'Deployments & production logs', icon: ExternalLink, external: true, color: 'text-white' },
              ].map((q) => {
                const card = (
                  <div className="group flex flex-col justify-between rounded-xl border border-white/5 bg-black/45 p-3 hover:border-gold/30 transition h-24">
                    <div className="flex items-center justify-between">
                      <div className={`p-1.5 rounded-lg bg-zinc-900 border border-white/5 ${q.color}`}>
                        <q.icon className="h-4 w-4" />
                      </div>
                      {q.external && <ExternalLink className="h-3 w-3 text-zinc-500" />}
                    </div>
                    <div className="mt-1">
                      <p className="text-[10px] font-bold uppercase text-white truncate">{q.label}</p>
                      <p className="text-[8px] text-zinc-500 truncate">{q.desc}</p>
                    </div>
                  </div>
                );
                return q.external ? (
                  <a key={q.label} href={q.href} target="_blank" rel="noreferrer" className="block">{card}</a>
                ) : (
                  <Link key={q.label} href={q.href} className="block">{card}</Link>
                );
              })}
            </div>
          </div>
        </details>
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
