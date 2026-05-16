import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { reconcileStripeSessionAction, refundStripePaymentAction } from '../payment-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : '$0.00';
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function address(r: Row) {
  return [r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ');
}

function vehicleSummary(r: Row) {
  if (Array.isArray(r.booking_vehicles) && r.booking_vehicles.length > 0) {
    return r.booking_vehicles
      .map((v, i) => {
        const row = v && typeof v === 'object' ? (v as Row) : {};
        return `Vehicle ${i + 1}: ${str(row.vehicle_description || row.description) || 'Vehicle'} (${str(row.service_slug || r.service_slug)})`;
      })
      .join(' · ');
  }
  return str(r.vehicle_description) || 'Vehicle pending';
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const { data: payment } = await admin.from('payments').select('*').eq('id', id).maybeSingle();
  if (!payment) notFound();
  const p = payment as Row;
  const [apptRes, fallbackRes, customerRes] = await Promise.all([
    p.appointment_id
      ? admin.from('appointments').select('*').eq('id', str(p.appointment_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    p.fallback_booking_id
      ? admin.from('booking_fallbacks').select('*').eq('id', str(p.fallback_booking_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    p.customer_id
      ? admin.from('customers').select('*').eq('id', str(p.customer_id)).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const linked = ((apptRes.data ?? fallbackRes.data ?? {}) as Row);
  const customer = (customerRes.data ?? {}) as Row;
  const total = typeof linked.base_price_cents === 'number' ? linked.base_price_cents : null;
  const deposit = typeof linked.deposit_amount_cents === 'number' ? linked.deposit_amount_cents : typeof p.amount_cents === 'number' ? p.amount_cents : null;
  const balance = total != null && deposit != null ? Math.max(0, total - deposit) : null;
  const sessionId = str(p.stripe_checkout_session_id || linked.stripe_checkout_session_id);
  const paymentIntentId = str(p.stripe_payment_intent_id);

  return (
    <DashboardShell title='Payment detail' subtitle='Specific payment, booking, customer, and refund controls.' role='admin'>
      <Link href='/admin/payments' className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'>← Payments</Link>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='grid gap-4 lg:grid-cols-2'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Customer</p>
            <p className='mt-2 text-white'>{str(linked.guest_name || customer.full_name || p.customer_name) || 'Customer'}</p>
            <p className='text-sm text-zinc-400'>{str(linked.guest_email || customer.email || p.email)}</p>
            <p className='text-sm text-zinc-400'>{str(linked.guest_phone || customer.phone || p.phone)}</p>
            {str(customer.id) ? <Link href={`/admin/customers/${str(customer.id)}`} className='mt-2 inline-block text-xs text-gold-soft underline'>Open customer</Link> : null}
          </div>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Payment</p>
            <p className='mt-2 text-2xl font-black text-white'>{money(p.amount_cents)}</p>
            <p className='text-sm text-zinc-400'>{str(p.status)} · {chicago(p.created_at)}</p>
            <p className='mt-1 font-mono text-xs text-zinc-500'>{sessionId || 'No checkout session'}</p>
            <p className='font-mono text-xs text-zinc-500'>{paymentIntentId || 'No payment intent'}</p>
          </div>
        </div>
        <div className='mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300 lg:grid-cols-2'>
          <p><span className='text-zinc-500'>Service:</span> {str(linked.service_slug || p.payment_kind).replace(/-/g, ' ')}</p>
          <p><span className='text-zinc-500'>Vehicles:</span> {vehicleSummary(linked)}</p>
          <p><span className='text-zinc-500'>Address:</span> {address(linked) || str((p.metadata as Row | undefined)?.service_address) || 'No service address saved'}</p>
          <p><span className='text-zinc-500'>Appointment:</span> {str(p.appointment_id || linked.id) || '—'}</p>
          <p><span className='text-zinc-500'>Deposit:</span> {deposit != null ? money(deposit) : '—'}</p>
          <p><span className='text-zinc-500'>Total:</span> {total != null ? money(total) : '—'}</p>
          <p><span className='text-zinc-500'>Balance:</span> {balance != null ? money(balance) : '—'}</p>
          <p><span className='text-zinc-500'>Payment status:</span> {str(linked.payment_status || p.status)}</p>
        </div>
        <div className='mt-5 flex flex-wrap gap-3'>
          {sessionId ? (
            <form action={reconcileStripeSessionAction}>
              <input type='hidden' name='sessionId' value={sessionId} />
              <button className='rounded bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Repair / Reconcile</button>
            </form>
          ) : null}
          {(sessionId || paymentIntentId) ? (
            <form action={refundStripePaymentAction} className='flex flex-wrap gap-2'>
              <input type='hidden' name='sessionId' value={sessionId} />
              <input type='hidden' name='paymentIntentId' value={paymentIntentId} />
              <input name='amountCents' placeholder='partial cents' className='w-28 rounded border border-white/10 bg-black px-3 py-2 text-xs' />
              <input name='confirm' placeholder='REFUND' className='w-28 rounded border border-red-500/30 bg-black px-3 py-2 text-xs' />
              <button className='rounded border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200'>Refund</button>
            </form>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}
