'use client';

import { motion } from 'framer-motion';
import { Award, CreditCard, DollarSign, ArrowRight, ShieldCheck, Percent, Sparkles } from 'lucide-react';
import { displayMoney } from '@/lib/display-format';

interface MonthData {
  label: string;
  value: number; // cents
}

interface CustomerData {
  name: string;
  email: string;
  totalCents: number;
  jobCount: number;
}

interface RevenueChartsProps {
  monthsData: MonthData[];
  paymentMixMonth: {
    stripeCents: number;
    cashCents: number;
    zelleCents: number;
    otherCents: number;
    grossCents: number;
    paymentCount: number;
  };
  depositCollectionRate: number;
  avgTicketSize: string;
  topCustomers: CustomerData[];
}

export function RevenueChartsClient({
  monthsData,
  paymentMixMonth,
  depositCollectionRate,
  avgTicketSize,
  topCustomers,
}: RevenueChartsProps) {
  // Chart dimensions & calculations
  const width = 600;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...monthsData.map((d) => d.value), 100000); // minimum scale at $1000

  // Coordinates for the SVG path
  const points = monthsData.map((d, i) => {
    const x = paddingLeft + (i * chartWidth) / Math.max(monthsData.length - 1, 1);
    const y = height - paddingBottom - (d.value / maxVal) * chartHeight;
    return { x, y, label: d.label, amount: displayMoney(d.value) };
  });

  // SVG Line path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // SVG Area path for gradient fill
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : '';

  // Payment Mix breakdown percentage calculation
  const totalMix =
    paymentMixMonth.stripeCents +
    paymentMixMonth.cashCents +
    paymentMixMonth.zelleCents +
    paymentMixMonth.otherCents;
  const getPct = (val: number) => (totalMix > 0 ? (val / totalMix) * 100 : 0);

  const stripePct = getPct(paymentMixMonth.stripeCents);
  const cashPct = getPct(paymentMixMonth.cashCents);
  const zellePct = getPct(paymentMixMonth.zelleCents);
  const otherPct = getPct(paymentMixMonth.otherCents);

  return (
    <div className="space-y-6">
      {/* Visual Chart Panel */}
      <div className="gb-glass rounded-3xl border border-white/10 p-5 sm:p-6 bg-black/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Performance trend</p>
            <h3 className="text-lg font-black text-white mt-1">Monthly Revenue (Last 6 Months)</h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/5 px-3 py-1 text-[10px] font-bold text-gold-soft">
            <Sparkles className="h-3 w-3" /> Live Transaction Volume
          </div>
        </div>

        {/* Responsive SVG Chart */}
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible select-none"
            style={{ maxHeight: '280px' }}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4af37" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#d4af37" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = paddingTop + ratio * chartHeight;
              const val = maxVal * (1 - ratio);
              return (
                <g key={ratio} className="opacity-30">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    fill="#9ca3af"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {displayMoney(Math.round(val)).split('.')[0]}
                  </text>
                </g>
              );
            })}

            {/* Area under the line */}
            {areaPath && (
              <path d={areaPath} fill="url(#chartGradient)" />
            )}

            {/* Line Path */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#d4af37"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Point circles and value labels */}
            {points.map((p, idx) => (
              <g key={idx} className="group">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#000"
                  stroke="#d4af37"
                  strokeWidth="2"
                  className="transition duration-150 hover:r-6 cursor-pointer"
                />
                {/* Amount tooltip above node */}
                <text
                  x={p.x}
                  y={p.y - 10}
                  fill="#fff"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                >
                  {p.amount.split('.')[0]}
                </text>
                {/* Month labels at bottom */}
                <text
                  x={p.x}
                  y={height - paddingBottom + 20}
                  fill="#9ca3af"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Row of stats & breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Card: Deposit Rate & Payment Types */}
        <div className="gb-glass rounded-3xl border border-white/10 p-5 sm:p-6 bg-black/40 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft border-b border-white/10 pb-3 mb-4">
              Revenue Splitting
            </p>

            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-zinc-400">Deposit Collection Efficiency</p>
                <p className="mt-1 font-mono text-3xl font-black text-white">{depositCollectionRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            {/* Payment Method Stacked Bar */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                  <span>Channel Breakdown</span>
                  <span className="font-mono text-[10px]">{displayMoney(totalMix)} total</span>
                </div>
                <div className="h-4 w-full rounded-full overflow-hidden flex bg-white/5">
                  {stripePct > 0 && (
                    <div
                      style={{ width: `${stripePct}%` }}
                      className="bg-gold-soft h-full transition-all"
                      title={`Stripe: ${stripePct.toFixed(1)}%`}
                    />
                  )}
                  {cashPct > 0 && (
                    <div
                      style={{ width: `${cashPct}%` }}
                      className="bg-emerald-500/70 h-full transition-all"
                      title={`Cash: ${cashPct.toFixed(1)}%`}
                    />
                  )}
                  {zellePct > 0 && (
                    <div
                      style={{ width: `${zellePct}%` }}
                      className="bg-amber-500/70 h-full transition-all"
                      title={`Zelle/Venmo: ${zellePct.toFixed(1)}%`}
                    />
                  )}
                  {otherPct > 0 && (
                    <div
                      style={{ width: `${otherPct}%` }}
                      className="bg-zinc-500/60 h-full transition-all"
                      title={`Other: ${otherPct.toFixed(1)}%`}
                    />
                  )}
                </div>
              </div>

              {/* Legend with values */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-gold-soft shrink-0" />
                  <span className="text-zinc-400 truncate">Card: {stripePct.toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500/70 shrink-0" />
                  <span className="text-zinc-400 truncate">Cash: {cashPct.toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500/70 shrink-0" />
                  <span className="text-zinc-400 truncate">Zelle: {zellePct.toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-500/60 shrink-0" />
                  <span className="text-zinc-400 truncate">Other: {otherPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Average Booking Ticket</span>
            <span className="font-mono font-bold text-white text-base">{avgTicketSize}</span>
          </div>
        </div>

        {/* Right Card: Leaderboard Top Customers */}
        <div className="gb-glass rounded-3xl border border-white/10 p-5 sm:p-6 bg-black/40">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft border-b border-white/10 pb-3 mb-4">
            Top Clientele
          </p>

          {topCustomers.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-12">No completed customer totals available yet.</p>
          ) : (
            <div className="space-y-3.5">
              {topCustomers.map((cust, idx) => (
                <div
                  key={cust.email}
                  className="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/20 px-3.5 py-3 hover:border-gold/25 transition duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-soft">
                      {idx === 0 ? (
                        <Award className="h-4.5 w-4.5 text-gold" />
                      ) : (
                        <span className="font-mono text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{cust.name}</p>
                      <p className="text-[9px] text-zinc-500 truncate">{cust.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs font-bold text-gold-soft">{displayMoney(cust.totalCents)}</p>
                    <p className="text-[9px] text-zinc-400 mt-0.5">{cust.jobCount} services</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
