import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ReceiptDocument } from '@/components/documents/receipt-document';
import { PrintDocumentActions } from '@/components/ui/print-document-actions';
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
        price: typeof row.price_cents === 'number' ? money(row.price_cents) : 'Price included',
      };
    });
  }
  return [
    {
      name: str(job.vehicle_description) || 'Vehicle on file',
      service: label(job.service_slug),
      color: 'Color not provided',
      price: typeof job.base_price_cents === 'number' ? money(job.base_price_cents) : 'Price included',
    },
  ];
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
    str(receipt?.customer_id || payment?.customer_id)
      ? admin.from('customers').select('*').eq('id', str(receipt?.customer_id || payment?.customer_id)).maybeSingle()
      : Promise.resolve({ data: null }),
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
  const depositPaid = method.toLowerCase().includes('cash') ? 0 : typeof job.deposit_amount_cents === 'number' ? job.deposit_amount_cents : typeof payment?.amount_cents === 'number' ? payment.amount_cents : 0;
  const cashPaid = method.toLowerCase().includes('cash') ? payment?.amount_cents : 0;
  const remaining = typeof job.balance_due_cents === 'number' ? job.balance_due_cents : Math.max(0, (typeof finalTotal === 'number' ? finalTotal : 0) - paidTotal);
  const receiptNumber = str(receipt?.receipt_number) || `RCPT-${(paymentId || appointmentId || fallbackId || id).slice(0, 8).toUpperCase()}`;
  const vehicleRows = vehicles(job, paymentMeta);
  const fullPaid = paidRows.filter((p) => !str(p.payment_kind).toLowerCase().includes('deposit')).reduce((s, p) => s + (typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0);

  const techId = str(job.assigned_technician_id);
  let technicianName: string | undefined;
  if (techId) {
    const { data: techProfile } = await admin.from('profiles').select('full_name, email').eq('id', techId).maybeSingle();
    technicianName = str((techProfile as Row | null)?.full_name) || str((techProfile as Row | null)?.email) || undefined;
  }

  function formatDuration(start: unknown, end: unknown) {
    if (!start || !end) return undefined;
    const ms = new Date(str(end)).getTime() - new Date(str(start)).getTime();
    if (ms <= 0) return undefined;
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const serviceDuration = formatDuration(job.job_started_at, job.job_completed_at || job.completed_at);
  const taxCents =
    typeof pricing.taxCents === 'number'
      ? pricing.taxCents
      : typeof pricing.tax_cents === 'number'
        ? pricing.tax_cents
        : undefined;

  const docProps = {
    receiptNumber,
    paidAt: chicago(payment?.paid_at || payment?.created_at || receipt?.created_at),
    serviceAt: chicago(job.scheduled_start),
    completedAt: chicago(job.job_completed_at || job.completed_at),
    method,
    status: label(payment?.status || receipt?.status || job.payment_status),
    customerName: str(job.guest_name || customer.full_name || payment?.customer_name) || 'Customer',
    customerEmail: str(job.guest_email || customer.email || payment?.email) || 'Not provided',
    customerPhone: str(job.guest_phone || customer.phone || payment?.phone) || 'Not provided',
    serviceAddress: address(job, paymentMeta) || 'Service address not provided',
    vehicles: vehicleRows,
    baseTotal: money(baseTotal),
    onlineDiscount: money(pricing.onlineDiscountCents ?? pricing.sitewideDiscountCents),
    multiCarDiscount: money(pricing.multiCarDiscountCents),
    promoLabel: str(job.promo_code || pricing.offerLabel || paymentMeta.promo_code) || 'None',
    promoDiscount: money(pricing.offerDiscountCents ?? pricing.promoDiscountCents),
    depositPaid: money(depositPaid),
    cashPaid: money(cashPaid),
    fullPaid: money(fullPaid),
    remainingBalance: money(remaining),
    finalTotal: money(finalTotal),
    stripeSession: str(payment?.stripe_checkout_session_id || job.stripe_checkout_session_id) || 'Not provided',
    stripePaymentIntent: str(payment?.stripe_payment_intent_id) || 'Not provided',
    paymentRowId: paymentId || 'Not provided',
    technicianName,
    serviceDuration,
    taxAmount: taxCents != null ? money(taxCents) : undefined,
  };

  return (
    <DashboardShell title='Receipt detail' subtitle='Print or download a customer-ready receipt document (not the admin chrome).' role='admin'>
      <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
        <Link href='/admin/receipts' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
          Back to Receipts
        </Link>
        {paymentId ? (
          <Link href={`/admin/payments/${paymentId}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
            Payment Detail
          </Link>
        ) : null}
        {appointmentId || fallbackId ? (
          <Link
            href={`/admin/work-orders/${encodeURIComponent(appointmentId || fallbackId)}${fallbackId && !appointmentId ? '?source=fallback&shell=admin' : '?shell=admin'}`}
            className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'
          >
            Edit work order
          </Link>
        ) : null}
      </div>

      <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
        <a
          href={`/api/receipts/${encodeURIComponent(str(receipt?.id || paymentId))}/pdf`}
          className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'
        >
          Download invoice PDF
        </a>
      </div>

      <PrintDocumentActions
        sendForm={
          <form action={sendReceiptAction}>
            {receipt?.id ? <input type='hidden' name='receiptId' value={str(receipt.id)} /> : null}
            {paymentId ? <input type='hidden' name='paymentId' value={paymentId} /> : null}
            <SubmitStatusButton pendingText='Sending...' className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'>
              Send Receipt
            </SubmitStatusButton>
          </form>
        }
      />

      <ReceiptDocument {...docProps} />
    </DashboardShell>
  );
}
