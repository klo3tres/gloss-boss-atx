'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
  sendFollowUpNowAction,
  skipFollowUpAction,
  snoozeFollowUpAction,
  syncFollowUpsNowAction,
  toggleFollowUpTierAction,
} from '@/app/(dashboard)/admin/follow-ups/follow-up-actions';
import type { FollowUpDashboard, FollowUpTier } from '@/lib/follow-up-engine';
import { formatChicagoDate, formatChicagoDateTime } from '@/lib/chicago-time';

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
      <p className="text-[10px] font-black uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function FollowUpEngineClient({ dashboard }: { dashboard: FollowUpDashboard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runSync = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await syncFollowUpsNowAction();
      if (res.error) setErr(res.error);
      else {
        setMsg(
          `Synced — ${res.enqueued ?? 0} queued, ${res.sent ?? 0} sent, ${res.skipped ?? 0} skipped, ${res.failed ?? 0} failed.`,
        );
        router.refresh();
      }
    });
  };

  const sendNow = (id: string) => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await sendFollowUpNowAction(id);
      if (res.error) setErr(res.error);
      else {
        setMsg('Follow-up sent.');
        router.refresh();
      }
    });
  };

  const snooze = (id: string, days: 7 | 30 | 60) => {
    startTransition(async () => {
      await snoozeFollowUpAction(id, days);
      router.refresh();
    });
  };

  const skip = (id: string) => {
    startTransition(async () => {
      await skipFollowUpAction(id);
      router.refresh();
    });
  };

  const toggleTier = (tier: FollowUpTier, enabled: boolean) => {
    startTransition(async () => {
      await toggleFollowUpTierAction(tier, enabled);
      router.refresh();
    });
  };

  if (!dashboard.tablesReady) {
    return (
      <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
        <p className="text-sm font-black uppercase text-amber-200">Migration required</p>
        <p className="mt-2 text-sm text-amber-100/90">
          Apply Supabase migration <code className="text-amber-50">000086_follow_up_engine.sql</code> to enable the follow-up
          queue and automated sends.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pending" value={dashboard.pending} hint="Waiting to send" />
        <StatTile label="Due today" value={dashboard.dueToday} hint="Scheduled for today" />
        <StatTile label="Sent (7 days)" value={dashboard.sentWeek} hint="Delivered this week" />
        <StatTile label="Failed" value={dashboard.failed} hint="Needs attention" />
      </section>

      <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Campaign tiers</p>
            <p className="mt-2 text-sm text-zinc-400">
              After a completed job with no future booking, customers enter the 30 → 60 → 90 day sequence automatically.
              Daily cron at 14:00 UTC (Hobby) — use Sync &amp; send now between runs.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={runSync}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
            Sync & send now
          </button>
        </div>

        {msg ? <p className="mt-4 text-sm text-emerald-400">{msg}</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {dashboard.settings.map((setting) => (
            <div key={setting.tier} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black uppercase text-white">{setting.tier}-day follow-up</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleTier(setting.tier, !setting.enabled)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
                    setting.enabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-zinc-600 bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {setting.enabled ? 'On' : 'Off'}
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-zinc-500">{setting.smsTemplate.slice(0, 120)}…</p>
              {setting.promoCode ? (
                <p className="mt-2 text-[10px] font-black uppercase text-gold-soft">Promo: {setting.promoCode}</p>
              ) : null}
              <p className="mt-2 text-[10px] text-zinc-600">
                {setting.smsEnabled ? 'SMS' : ''}
                {setting.smsEnabled && setting.emailEnabled ? ' + ' : ''}
                {setting.emailEnabled ? 'Email' : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Queue</p>
        <p className="mt-2 text-sm text-zinc-500">Pending and failed follow-ups. Snooze or send manually anytime.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase text-zinc-500">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.queue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-zinc-500">
                    No pending follow-ups. Run sync after completed jobs to populate the queue.
                  </td>
                </tr>
              ) : (
                dashboard.queue.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="px-3 py-3">
                      <p className="font-bold text-white">{row.customerName || 'Customer'}</p>
                      <p className="text-[11px] text-zinc-500">
                        {row.customerEmail || row.customerPhone || 'No contact'}
                        {row.vehicleDescription ? ` · ${row.vehicleDescription}` : ''}
                      </p>
                      {row.customerId ? (
                        <Link href={`/admin/customers/${row.customerId}`} className="text-[10px] text-gold-soft hover:underline">
                          Open profile
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-zinc-300">{row.tier}d</td>
                    <td className="px-3 py-3 text-zinc-400">
                      {formatChicagoDate(row.dueAt)}
                      {row.snoozedUntil ? (
                        <span className="block text-[10px] text-amber-300">Snoozed until {formatChicagoDate(row.snoozedUntil)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                          row.status === 'failed'
                            ? 'border-red-500/30 text-red-300'
                            : 'border-sky-500/30 text-sky-300'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => sendNow(row.id)}
                          className="rounded-lg border border-gold/30 px-2 py-1 text-[10px] font-black uppercase text-gold-soft"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => snooze(row.id, 7)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-400"
                        >
                          7d
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => snooze(row.id, 30)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-400"
                        >
                          30d
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => skip(row.id)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-500"
                        >
                          Skip
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Recent engine runs</p>
        <div className="mt-4 space-y-2">
          {dashboard.recentRuns.length === 0 ? (
            <p className="text-xs text-zinc-500">No runs yet. Cron sends daily once migration is applied.</p>
          ) : (
            dashboard.recentRuns.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 px-4 py-3 text-xs">
                <span className="text-zinc-400">{formatChicagoDateTime(run.startedAt)}</span>
                <span className="font-mono text-zinc-300">
                  +{run.enqueuedCount} queued · {run.sentCount} sent · {run.skippedCount} skipped · {run.failedCount} failed
                </span>
                {run.errorMessage ? <span className="text-red-300">{run.errorMessage}</span> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
