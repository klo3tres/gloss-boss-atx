import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PrintButton } from '@/components/ui/print-button';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { sendReceiptAction } from '../receipt-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function obj(v: unknown): Row {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : '$0.00';
}

function chicago(v: unknown) {
  if (!v) return 'Not provided';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function label(v: unknown) {
  return str(v).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || 'Not provided';
}

function address(r: Row, meta: Row) {
  return [r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ') || str(meta.service_address);
}

function vehicles(job: Row, meta: Row) {
  const raw = Array.isArray(job.booking_vehicles) && job.booking_vehicles.length ? job.booking_vehicles : Array.isArray(meta.vehicles) ? meta.vehicles : [];
  if (raw.length) {
    return raw.map((v, i) => {
      const row = obj(v);
      return {
        name: str(row.vehicle_description || row.description) || `Vehicle ${i + 1}`,
        service: label(row.service_slug || job.service_slug),
        color: str(row.vehicle_color || row.color) || 'Color not provided',
        price: typeof row.price_cents === 'number' ? row.price_cents : null,
      };
    });
  }
  return [{ name: str(job.vehicle_description) || 'Vehicle on file', service: label(job.service_slug), color: 'Color not provided', price: typeof job.base_price_cents === 'number' ? job.base_price_cents : null }];
}

export default async function AdminReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  let receipt = (await admin.from('receipts').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!receipt) receipt = (await admin.from('receipts').select('*').eq('payment_id', id).maybeSingle()).data as Row | null;
  let paymentId = str(receipt?.payment_id || id);
  let payment = (await admin.from('payments').select('*').eq('id', paymentId).maybeSingle()).data as Row | null;
  if (!payment && receipt?.payment_id) payment = (await admin.from('payments').select('*').eq('id', str(receipt.payment_id)).maybeSingle()).data as Row | null;
  if (!receipt && !payment) notFound();
  paymentId = str(payment?.id || receipt?.payment_id);

  const appointmentId = str(receipt?.appointment_id || payment?.appointment_id);
  const fallbackId = str(receipt?.fallback_booking_id || payment?.fallback_booking_id);
  const [apptRes, fallbackRes, customerRes, allPaymentsRes] = await Promise.all([
    appointmentId ? admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null }),
    fallbackId ? admin.from('booking_fallbacks').select('*').eq('id', fallbackId).maybeSingle() : Promise.resolve({ data: null }),
    str(receipt?.customer_id || payment?.customer_id) ? admin.from('customers').select('*').eq('id', str(receipt?.customer_id || payment?.customer_id)).maybeSingle() : Promise.resolve({ data: null }),
    appointmentId
      ? admin.from('payments').select('*').eq('appointment_id', appointmentId)
      : fallbackId
        ? admin.from('payments').select('*').eq('fallback_booking_id', fallbackId)
        : Promise.resolve({ data: payment ? [payment] : [] }),
  ]);
  const job = (apptRes.data ?? fallbackRes.data ?? {}) as Row;
  const customer = (customerRes.data ?? {}) as Row;
  const paymentMeta = obj(payment?.metadata);
  const receiptMeta = obj(receipt?.metadata);
  const pricing = obj(job.booking_pricing_breakdown || obj(job.payload).booking_pricing_breakdown || paymentMeta.booking_pricing_breakdown || receiptMeta.booking_pricing_breakdown);
  const paidRows = ((allPaymentsRes.data ?? []) as Row[]).filter((p) => ['succeeded', 'paid', 'comped', 'manual_comped'].includes(str(p.status)));
  const paidTotal = paidRows.reduce((sum, p) => sum + (typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0);
  const method = label(payment?.payment_method || payment?.payment_kind || receipt?.payment_method || (payment?.stripe_checkout_session_id ? 'stripe' : 'manual'));
  const baseTotal = typeof pricing.baseTotalCents === 'number' ? pricing.baseTotalCents : job.base_price_cents;
  const finalTotal = typeof pricing.finalTotalCents === 'number' ? pricing.finalTotalCents : job.base_price_cents ?? payment?.amount_cents ?? receipt?.amount_cents;
  const depositPaid = method.toLowerCase().includes('cash') ? 0 : (typeof job.deposit_amount_cents === 'number' ? job.deposit_amount_cents : (typeof payment?.amount_cents === 'number' ? payment.amount_cents : 0));
  const cashPaid = method.toLowerCase().includes('cash') ? payment?.amount_cents : 0;
  const remaining = typeof job.balance_due_cents === 'number' ? job.balance_due_cents : Math.max(0, (typeof finalTotal === 'number' ? finalTotal : 0) - paidTotal);
  const receiptNumber = str(receipt?.receipt_number) || `RCPT-${(paymentId || appointmentId || fallbackId || id).slice(0, 8).toUpperCase()}`;
  const vehicleRows = vehicles(job, paymentMeta);

  return (
    <DashboardShell title='Receipt detail' subtitle='Customer-ready printable receipt with payment, vehicle, pricing, and Stripe reconciliation details.' role='admin'>
      <div className='mb-4 flex flex-wrap gap-2 print:hidden'>
        <Link href='/admin/receipts' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Back to Receipts</Link>
        {paymentId ? <Link href={`/admin/payments/${paymentId}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Payment Detail</Link> : null}
        <PrintButton className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Print / Download PDF</PrintButton>
        <form action={sendReceiptAction}>
          {receipt?.id ? <input type='hidden' name='receiptId' value={str(receipt.id)} /> : null}
          {paymentId ? <input type='hidden' name='paymentId' value={paymentId} /> : null}
          <SubmitStatusButton pendingText='Sending...' className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'>Send Receipt</SubmitStatusButton>
        </form>
      </div>

      <section className='mx-auto max-w-4xl rounded-3xl border border-gold/30 bg-zinc-950 p-6 shadow-[0_0_50px_rgba(212,166,77,0.12)] print:border-zinc-300 print:bg-white print:text-black'>
        <header className='flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between print:border-zinc-300'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.35em] text-gold-soft print:text-black'>Gloss Boss ATX</p>
            <h1 className='mt-2 text-3xl font-black uppercase text-white print:text-black'>Receipt</h1>
            <p className='mt-1 text-sm text-zinc-400 print:text-zinc-700'>Luxury mobile detailing · Austin, TX</p>
          </div>
          <div className='sm:text-right'>
            <p className='font-mono text-lg font-black text-white print:text-black'>{receiptNumber}</p>
            <p className='text-sm text-zinc-400 print:text-zinc-700'>Paid {chicago(payment?.paid_at || payment?.created_at || receipt?.created_at)}</p>
            <p className='text-sm text-zinc-400 print:text-zinc-700'>{method} · {label(payment?.status || receipt?.status || job.payment_status)}</p>
          </div>
        </header>

        <div className='mt-6 grid gap-4 md:grid-cols-2'>
          <section className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Customer</p>
            <p className='mt-2 text-lg font-bold text-white print:text-black'>{str(job.guest_name || customer.full_name || payment?.customer_name) || 'Customer'}</p>
            <p className='text-sm text-zinc-400 print:text-zinc-700'>{str(job.guest_email || customer.email || payment?.email)}</p>
            <p className='text-sm text-zinc-400 print:text-zinc-700'>{str(job.guest_phone || customer.phone || payment?.phone)}</p>
            <p className='mt-2 text-sm text-zinc-300 print:text-zinc-700'>{address(job, paymentMeta) || 'Service address not provided'}</p>
          </section>
          <section className='rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Payment IDs</p>
            <p className='mt-2 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Stripe session: {str(payment?.stripe_checkout_session_id || job.stripe_checkout_session_id) || 'Not provided'}</p>
            <p className='mt-1 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Payment intent: {str(payment?.stripe_payment_intent_id) || 'Not provided'}</p>
            <p className='mt-1 break-all font-mono text-xs text-zinc-300 print:text-zinc-700'>Payment row: {paymentId || 'Not provided'}</p>
          </section>
        </div>

        <section className='mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Vehicles / Services</p>
          <div className='mt-3 grid gap-3'>
            {vehicleRows.map((v, i) => (
              <div key={`${v.name}-${i}`} className='rounded-xl border border-white/10 bg-black/30 p-3 print:border-zinc-300 print:bg-white'>
                <p className='font-bold text-white print:text-black'>Vehicle {i + 1}: {v.name}</p>
                <p className='text-sm text-zinc-400 print:text-zinc-700'>{v.color} · {v.service} · {v.price != null ? money(v.price) : 'Price included'}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 print:border-zinc-300 print:bg-white'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft print:text-black'>Pricing Breakdown</p>
          <div className='mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 print:text-zinc-800'>
            <p>Base total: <strong>{money(baseTotal)}</strong></p>
            <p>Online booking discount: <strong>{money(pricing.onlineDiscountCents ?? pricing.sitewideDiscountCents)}</strong></p>
            <p>Multi-car discount: <strong>{money(pricing.multiCarDiscountCents)}</strong></p>
            <p>Promo / offer: <strong>{str(job.promo_code || pricing.offerLabel || paymentMeta.promo_code) || 'None'}</strong></p>
            <p>Offer discount: <strong>{money(pricing.offerDiscountCents ?? pricing.promoDiscountCents)}</strong></p>
            <p>Deposit paid: <strong>{money(depositPaid)}</strong></p>
            <p>Full/cash paid: <strong>{money(cashPaid || payment?.amount_cents)}</strong></p>
            <p>Remaining balance: <strong>{money(remaining)}</strong></p>
            <p className='text-lg text-white sm:col-span-2 print:text-black'>Final total: <strong>{money(finalTotal)}</strong></p>
          </div>
        </section>
      </section>
    </DashboardShell>
  );
}
