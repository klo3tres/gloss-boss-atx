'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, TrendingUp } from 'lucide-react';
import { closeDayAction, closeMonthAction } from '@/app/(dashboard)/admin/financial-closeout/closeout-actions';
import type { CloseoutDraft, CloseoutRecord, MoneyPulse } from '@/lib/financial-closeout';
import { formatChicagoDate, formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

function MoneyTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
      <p className="text-[10px] font-black uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function CloseoutLines({ draft }: { draft: CloseoutDraft }) {
  const lines = [
    { label: 'Cash collected', value: draft.cashCents },
    { label: 'Stripe', value: draft.stripeCents },
    { label: 'Zelle / electronic', value: draft.zelleCents },
    { label: 'Deposits collected', value: draft.depositsCollectedCents },
    { label: 'Refunds', value: -draft.refundsCents, tone: 'text-red-300' },
    { label: 'Expenses (excl. fuel)', value: -draft.expensesCents, tone: 'text-red-300' },
    { label: 'Fuel / mileage', value: -draft.fuelCents, tone: 'text-red-300' },
    { label: 'Stripe fees', value: -draft.stripeFeesCents, tone: 'text-red-300' },
  ];

  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div key={line.label} className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">{line.label}</span>
          <span className={`font-mono font-black ${line.tone ?? 'text-white'}`}>
            {line.value < 0 ? '−' : ''}
            {displayMoney(Math.abs(line.value))}
          </span>
        </div>
      ))}
      <div className="mt-4 flex items-center justify-between border-t border-gold/20 pt-4">
        <span className="text-sm font-black uppercase text-gold-soft">Net profit</span>
        <span className="font-mono text-2xl font-black text-emerald-400">{displayMoney(draft.netProfitCents)}</span>
      </div>
      {draft.marginPercent != null ? (
        <p className="text-right text-[11px] text-zinc-500">Margin {draft.marginPercent}%</p>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[11px] text-zinc-500">
        <p>Open balances: {displayMoney(draft.openBalancesCents)}</p>
        <p>Pending deposits: {displayMoney(draft.pendingDepositsCents)}</p>
        <p>Completed jobs: {draft.completedJobs}</p>
        <p>Gross revenue: {displayMoney(draft.grossRevenueCents)}</p>
      </div>
    </div>
  );
}

function CloseoutPanel({
  title,
  subtitle,
  draft,
  onClose,
  pending,
}: {
  title: string;
  subtitle: string;
  draft: CloseoutDraft;
  onClose: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState('');

  return (
    <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        {draft.alreadyClosed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">
            <Lock className="h-3 w-3" />
            Closed
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        <CloseoutLines draft={draft} />
      </div>

      {draft.alreadyClosed ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
          <p>
            Closed {draft.closedAt ? formatChicagoDateTime(draft.closedAt) : '—'}
            {draft.closedByName ? ` by ${draft.closedByName}` : ''}
          </p>
          {draft.note ? <p className="mt-2 text-zinc-500">Note: {draft.note}</p> : null}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional closeout note (variance, cash drawer, etc.)"
            rows={2}
            className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => onClose(note)}
            className="w-full rounded-xl border border-gold/40 bg-gold/10 py-3 text-sm font-black uppercase text-gold-soft hover:border-gold/60 disabled:opacity-50"
          >
            {pending ? 'Saving…' : title.includes('Day') ? 'Close Day' : 'Close Month'}
          </button>
          <p className="text-[10px] text-zinc-600">
            Creates a permanent record. Numbers are frozen at close time.
          </p>
        </div>
      )}
    </section>
  );
}

export function FinancialCloseoutClient({
  pulse,
  dailyDraft,
  monthlyDraft,
  history,
}: {
  pulse: MoneyPulse;
  dailyDraft: CloseoutDraft;
  monthlyDraft: CloseoutDraft;
  history: CloseoutRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runClose = (type: 'daily' | 'monthly', note: string) => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = type === 'daily' ? await closeDayAction(undefined, note) : await closeMonthAction(undefined, note);
      if (res.error) setErr(res.error);
      else {
        setMsg(type === 'daily' ? 'Day closed and recorded.' : 'Month closed and recorded.');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gold/15 bg-gradient-to-br from-black/80 to-zinc-950 p-6">
        <div className="flex flex-wrap items-center gap-2 text-gold-soft">
          <TrendingUp className="h-4 w-4" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Money at a glance</h2>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Live numbers — close day or month to freeze a permanent record.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyTile label="Made today" value={displayMoney(pulse.todayGrossCents)} hint={`Net ${displayMoney(pulse.todayNetCents)}`} />
          <MoneyTile label="Made this week" value={displayMoney(pulse.weekGrossCents)} hint={`Net ${displayMoney(pulse.weekNetCents)}`} />
          <MoneyTile label="Made this month" value={displayMoney(pulse.monthGrossCents)} hint={`Net ${displayMoney(pulse.monthNetCents)}`} />
          <MoneyTile
            label="Margin (month)"
            value={pulse.monthMarginPercent != null ? `${pulse.monthMarginPercent}%` : '—'}
            hint={`Fuel ${displayMoney(pulse.monthFuelCents)} · Refunds ${displayMoney(pulse.monthRefundsCents)}`}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MoneyTile label="Who owes me" value={displayMoney(pulse.openBalancesCents)} hint="Open balances right now" />
          <MoneyTile label="Deposits outstanding" value={displayMoney(pulse.pendingDepositsCents)} hint="Awaiting initial deposit" />
        </div>
      </section>

      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <CloseoutPanel
          title="Daily Closeout"
          subtitle={`${formatChicagoDate(dailyDraft.periodStart)} · Chicago time`}
          draft={dailyDraft}
          pending={pending}
          onClose={(note) => runClose('daily', note)}
        />
        <CloseoutPanel
          title="Monthly Closeout"
          subtitle={`${monthlyDraft.periodKey} · through ${formatChicagoDate(monthlyDraft.periodEnd)}`}
          draft={monthlyDraft}
          pending={pending}
          onClose={(note) => runClose('monthly', note)}
        />
      </div>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Closeout history</h2>
          <Link href="/admin/revenue" className="text-[10px] font-black uppercase text-gold hover:underline">
            Revenue detail →
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No closeouts recorded yet. Close your first day above.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase text-zinc-500">
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Gross</th>
                  <th className="py-2 pr-4">Net</th>
                  <th className="py-2 pr-4">Margin</th>
                  <th className="py-2 pr-4">Closed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 text-zinc-300">
                    <td className="py-3 pr-4">
                      <span className="font-black uppercase text-white">
                        {row.periodType === 'daily' ? 'Day' : 'Month'}
                      </span>{' '}
                      {row.periodKey}
                    </td>
                    <td className="py-3 pr-4 font-mono">{displayMoney(row.grossRevenueCents)}</td>
                    <td className="py-3 pr-4 font-mono text-emerald-400">{displayMoney(row.netProfitCents)}</td>
                    <td className="py-3 pr-4">{row.marginPercent != null ? `${row.marginPercent}%` : '—'}</td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {row.closedAt ? formatChicagoDateTime(row.closedAt) : '—'}
                      {row.closedByName ? ` · ${row.closedByName}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
