import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { reconcileStripeSessionAction, refundStripePaymentAction } from './payment-actions';

export const dynamic = 'force-dynamic';

type PayRow = Record<string, unknown>;

function money(cents: unknown) {
  return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : '—';
}

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

export default async function AdminPaymentsPage() {
  const session = await getSessionWithProfile();
  const canView = Boolean(session.user && isAdminLevel(session.profile?.role ?? null));
  const admin = canView ? tryCreateAdminSupabase() : null;
  let rows: PayRow[] = [];
  let loadError: string | null = null;
  if (admin) {
    const [payments, appointments, fallbacks] = await Promise.all([
      admin.from('payments').select('*').order('created_at', { ascending: false }).limit(120),
      admin
        .from('appointments')
        .select('id, customer_id, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, service_slug, base_price_cents, deposit_amount_cents, payment_status, status, stripe_checkout_session_id, final_payment_checkout_session_id, scheduled_start, created_at')
        .order('created_at', { ascending: false })
        .limit(120),
      admin
        .from('booking_fallbacks')
        .select('id, guest_name, guest_email, guest_phone, vehicle_description, service_address, service_city, service_state, service_zip, service_slug, base_price_cents, deposit_amount_cents, payment_status, status, stripe_checkout_session_id, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
    ]);
    if (payments.error) loadError = payments.error.message;
    const bySession = new Map<string, PayRow>();
    for (const p of payments.data ?? []) {
      const r = p as PayRow;
      const sid = str(r.stripe_checkout_session_id);
      if (sid) bySession.set(sid, r);
      rows.push({ source: 'payment', ...r });
    }
    for (const a of appointments.data ?? []) {
      const r = a as PayRow;
      for (const sid of [str(r.stripe_checkout_session_id), str(r.final_payment_checkout_session_id)].filter(Boolean)) {
        if (!bySession.has(sid)) rows.push({ source: 'appointment_session', stripe_checkout_session_id: sid, appointment_id: r.id, ...r });
      }
    }
    for (const f of fallbacks.data ?? []) {
      const r = f as PayRow;
      const sid = str(r.stripe_checkout_session_id);
      if (sid && !bySession.has(sid)) rows.push({ source: 'fallback_session', fallback_booking_id: r.id, ...r });
    }
  }

  return (
    <DashboardShell title='Payments' subtitle='Live Stripe payment visibility, repair, and refund controls.' role='admin'>
      {!canView ? <p className='text-sm text-amber-200'>Admin access required.</p> : null}
      {loadError ? <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{loadError}</p> : null}
      <section className='rounded-2xl border border-gold/25 bg-zinc-950/90 p-5 shadow-[0_0_30px_rgba(212,166,77,0.08)]'>
        <h2 className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Stripe ledger</h2>
        <div className='mt-4 overflow-x-auto'>
          <table className='min-w-[1100px] w-full text-left text-xs text-zinc-300'>
            <thead className='text-[10px] uppercase tracking-wider text-zinc-500'>
              <tr>
                <th className='p-2'>Customer</th>
                <th className='p-2'>Service / vehicle</th>
                <th className='p-2'>Address</th>
                <th className='p-2'>Deposit</th>
                <th className='p-2'>Total</th>
                <th className='p-2'>Status</th>
                <th className='p-2'>Checkout session</th>
                <th className='p-2'>Payment intent</th>
                <th className='p-2'>Link</th>
                <th className='p-2'>Created</th>
                <th className='p-2'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sid = str(r.stripe_checkout_session_id);
                const pi = str(r.stripe_payment_intent_id);
                return (
                  <tr key={`${sid || r.id || i}`} className='border-t border-white/10 align-top'>
                    <td className='p-2'>
                      <p className='font-semibold text-white'>{str(r.guest_name) || str(r.customer_name) || 'Customer'}</p>
                      <p>{str(r.guest_email) || str(r.email)}</p>
                      <p>{str(r.guest_phone) || str(r.phone)}</p>
                      {str(r.customer_id) ? <Link href={`/admin/customers/${str(r.customer_id)}`} className='text-gold-soft underline'>Customer record</Link> : null}
                    </td>
                    <td className='p-2'>
                      <p>{str(r.service_slug).replace(/-/g, ' ') || str(r.payment_kind)}</p>
                      <p className='text-zinc-500'>{Array.isArray(r.booking_vehicles) ? `${r.booking_vehicles.length} vehicle(s)` : str(r.vehicle_description)}</p>
                    </td>
                    <td className='p-2'>{[r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ') || '—'}</td>
                    <td className='p-2'>{money(r.deposit_amount_cents ?? r.amount_cents)}</td>
                    <td className='p-2'>{money(r.base_price_cents)}</td>
                    <td className='p-2'>{str(r.payment_status) || str(r.status) || 'unknown'}</td>
                    <td className='p-2 font-mono'>{sid || '—'}</td>
                    <td className='p-2 font-mono'>{pi || '—'}</td>
                    <td className='p-2 font-mono'>{str(r.appointment_id) ? `appt ${str(r.appointment_id).slice(0, 8)}` : str(r.fallback_booking_id) ? `fb ${str(r.fallback_booking_id).slice(0, 8)}` : '—'}</td>
                    <td className='p-2'>{chicago(r.created_at)}</td>
                    <td className='space-y-2 p-2'>
                      {sid ? (
                        <form action={reconcileStripeSessionAction}>
                          <input type='hidden' name='sessionId' value={sid} />
                          <button className='rounded bg-gold px-3 py-1 text-[10px] font-black uppercase text-black'>Repair</button>
                        </form>
                      ) : null}
                      {(sid || pi) ? (
                        <form action={refundStripePaymentAction} className='space-y-1'>
                          <input type='hidden' name='sessionId' value={sid} />
                          <input type='hidden' name='paymentIntentId' value={pi} />
                          <input name='amountCents' placeholder='partial cents' className='w-24 rounded border border-white/10 bg-black px-2 py-1' />
                          <input name='confirm' placeholder='REFUND' className='w-24 rounded border border-red-500/20 bg-black px-2 py-1' />
                          <button className='block rounded bg-red-500/20 px-3 py-1 text-[10px] font-black uppercase text-red-200'>Refund</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className='py-8 text-sm text-zinc-500'>No payment records or Stripe session IDs found.</p> : null}
        </div>
      </section>
    </DashboardShell>
  );
}

