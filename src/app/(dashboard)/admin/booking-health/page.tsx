'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { clearExpiredFallbacksAction } from '@/app/(dashboard)/admin/booking-fallback-actions';
type Api = {
  ok: boolean;
  supabase?: boolean;
  serviceRole?: boolean;
  stripe?: { configured: boolean; webhook: boolean };
  resend?: boolean;
  twilio?: boolean;
  snapshot?: {
    last_success_at: string | null;
    last_failure_at: string | null;
    last_error_message: string | null;
    last_failure_stage: string | null;
  } | null;
  pendingFallbacks?: number | null;
  activeFallbacks?: number | null;
  expiredFallbacks?: number | null;
  lastFallbackError?: { message: string | null; created_at: string | null } | null;
  recentFallbacks?: {
    id: string;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    status: string | null;
    deposit_amount_cents: number | null;
    created_at: string | null;
    converted_appointment_id: string | null;
    reviewed_at?: string | null;
    archived_at?: string | null;
    promotion_error?: string | null;
  }[];
  lastBookingError?: { message: string | null; created_at: string | null; stage: string | null } | null;
  error?: string;
};
function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
        ok ? 'border border-emerald-500/50 text-emerald-200' : 'border border-rose-500/50 text-rose-200'
      }`}
    >
      {label}
    </span>
  );
}

export default function BookingHealthPage() {
  const router = useRouter();
  const [data, setData] = useState<Api | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  useEffect(() => {
    void fetchWithTimeout('/api/admin/booking-health', { credentials: 'same-origin', timeoutMs: 15000 })
      .then((r) => r.json() as Promise<Api>)
      .then(setData)
      .catch(() => setData({ ok: false, error: 'Request failed' }));
  }, []);

  const snap = data?.snapshot;

  return (
    <DashboardShell
      title='Booking health'
      subtitle='Super Admin — live booking pipeline signals (Stripe, Supabase, fallbacks).'
      role='super_admin'
    >
      <Link href='/admin/super' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Command center
      </Link>

      {localMsg ? (
        <p className='mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100'>{localMsg}</p>
      ) : null}
      {!data ? (
        <p className='text-sm text-zinc-400'>Loading…</p>
      ) : !data.ok ? (
        <p className='text-sm text-rose-300'>{data.error ?? 'Forbidden — super admin only.'}</p>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          <section className='rounded-2xl border border-gold/25 bg-black/50 p-5'>
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Integrations</p>
            <ul className='mt-4 space-y-3 text-sm'>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-zinc-300'>Supabase reachable (service role)</span>
                <Badge ok={Boolean(data.serviceRole)} label={data.serviceRole ? 'Ready' : 'Down'} />
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-zinc-300'>Stripe secret</span>
                <Badge ok={Boolean(data.stripe?.configured)} label={data.stripe?.configured ? 'Set' : 'Missing'} />
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-zinc-300'>Stripe webhook secret</span>
                <Badge ok={Boolean(data.stripe?.webhook)} label={data.stripe?.webhook ? 'Set' : 'Missing'} />
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-zinc-300'>Resend (email)</span>
                <Badge ok={Boolean(data.resend)} label={data.resend ? 'Configured' : 'Optional'} />
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-zinc-300'>Twilio (SMS)</span>
                <Badge ok={Boolean(data.twilio)} label={data.twilio ? 'Configured' : 'Optional'} />
              </li>
            </ul>
          </section>

          <section className='rounded-2xl border border-gold/25 bg-black/50 p-5'>
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Booking snapshot</p>
            <ul className='mt-4 space-y-2 text-sm text-zinc-300'>
              <li>
                <span className='text-zinc-500'>Last success: </span>
                {snap?.last_success_at ? new Date(snap.last_success_at).toLocaleString() : '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Last failure: </span>
                {snap?.last_failure_at ? new Date(snap.last_failure_at).toLocaleString() : '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Last error: </span>
                {snap?.last_error_message ?? '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Stage: </span>
                {snap?.last_failure_stage ?? '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Pending fallbacks: </span>
                {data.pendingFallbacks != null ? data.pendingFallbacks : '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Active / needs review: </span>
                {data.activeFallbacks != null ? data.activeFallbacks : '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Expired fallbacks: </span>
                {data.expiredFallbacks != null ? data.expiredFallbacks : '—'}
              </li>
              <li>
                <span className='text-zinc-500'>Last fallback error: </span>
                {data.lastFallbackError?.message ?? '—'}
              </li>            </ul>
          </section>

          <section className='md:col-span-2 rounded-2xl border border-amber-500/20 bg-black/40 p-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-bold uppercase tracking-[0.2em] text-amber-200'>Recent fallback bookings</p>
                <p className='mt-1 text-[11px] text-zinc-500'>
                  Stored when the primary appointments insert could not complete; Stripe deposit checkout can still run. Stale pending rows
                  auto-expire after 10 minutes on this page load.
                </p>
              </div>
              <form
                action={async () => {
                  setLocalMsg(null);
                  const r = await clearExpiredFallbacksAction();
                  setLocalMsg(r.ok ? `Expired ${r.count ?? 0} stale fallback row(s).` : r.error ?? 'Clear failed');
                  const next = await fetchWithTimeout('/api/admin/booking-health', { credentials: 'same-origin', timeoutMs: 15000 }).then(
                    (x) => x.json() as Promise<Api>,
                  );
                  setData(next);
                  router.refresh();
                }}
              >
                <button
                  type='submit'
                  className='rounded-lg border border-amber-500/50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-500/10'
                >
                  Clear expired fallbacks
                </button>
              </form>
            </div>            {!data.recentFallbacks || data.recentFallbacks.length === 0 ? (
              <p className='mt-3 text-sm text-zinc-500'>None returned (or table not migrated).</p>
            ) : (
              <div className='gb-admin-table-wrap mt-4'>
                <table className='w-full min-w-[640px] border-collapse text-left text-xs text-zinc-300'>
                  <thead>
                    <tr className='border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500'>
                      <th className='py-2 pr-3'>Created</th>
                      <th className='py-2 pr-3'>Guest</th>
                      <th className='py-2 pr-3'>Contact</th>
                      <th className='py-2 pr-3'>Deposit</th>
                      <th className='py-2 pr-3'>Status</th>
                      <th className='py-2 pr-3'>Error</th>
                      <th className='py-2'>Converted appt</th>                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFallbacks.map((r) => (
                      <tr key={r.id} className='border-b border-white/5'>
                        <td className='py-2 pr-3 font-mono text-[10px] text-zinc-400'>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                        </td>
                        <td className='py-2 pr-3'>{r.guest_name ?? '—'}</td>
                        <td className='py-2 pr-3'>
                          {r.guest_email ?? '—'}
                          <br />
                          {r.guest_phone ?? ''}
                        </td>
                        <td className='py-2 pr-3'>
                          {r.deposit_amount_cents != null ? `$${(r.deposit_amount_cents / 100).toFixed(2)}` : '—'}
                        </td>
                        <td className='py-2 pr-3'>{r.status ?? '—'}</td>
                        <td className='max-w-[200px] py-2 pr-3 break-words text-rose-200/90'>{r.promotion_error ?? '—'}</td>
                        <td className='py-2 font-mono text-[10px] text-zinc-500'>                          {r.converted_appointment_id ? `${r.converted_appointment_id.slice(0, 8)}…` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className='md:col-span-2 rounded-2xl border border-white/10 bg-black/40 p-5'>
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-zinc-400'>Latest booking_errors row</p>
            {data.lastBookingError?.message ? (
              <pre className='mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black p-3 text-xs text-zinc-300'>
                {JSON.stringify(data.lastBookingError, null, 2)}
              </pre>
            ) : (
              <p className='mt-2 text-sm text-zinc-500'>No errors logged (or table not migrated yet).</p>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
