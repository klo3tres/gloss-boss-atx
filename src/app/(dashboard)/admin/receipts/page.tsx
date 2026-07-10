import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { ReceiptSendForm } from '@/components/admin/receipt-send-form';
import { ReceiptLiveSearch } from '@/components/admin/receipt-live-search';
import { ReceiptDetailDrawer } from '@/components/admin/receipt-detail-drawer';
import { bulkReceiptRevenueFlagsAction, updateReceiptRevenueFlagsAction } from './receipt-actions';
import { summarizePayments, type PayRow } from '@/lib/revenue-metrics';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : '$0.00';
}

function chicago(v: unknown) {
  if (!v) return 'Not sent';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function address(r: Row) {
  return [r.service_address, r.service_city, r.service_state, r.service_zip].map(str).filter(Boolean).join(', ');
}

function countsForRevenue(r: Row) {
  const receipt = (r.receipt && typeof r.receipt === 'object' ? r.receipt : {}) as Row;
  const status = str(r.status || receipt.status).toLowerCase();
  return (
    r.is_test !== true &&
    receipt.is_test !== true &&
    r.exclude_from_revenue !== true &&
    receipt.exclude_from_revenue !== true &&
    !r.voided_at &&
    !receipt.voided_at &&
    !r.refunded_at &&
    !receipt.refunded_at &&
    !['voided', 'refunded', 'canceled', 'cancelled'].includes(status)
  );
}

export default async function AdminReceiptsPage() {
  const admin = tryCreateAdminSupabase();
  let rows: Row[] = [];
  let error: string | null = null;
  if (admin) {
    const [receiptsRes, paymentsRes, apptRes, fallbackRes, customerRes] = await Promise.all([
      admin.from('receipts').select('*').order('created_at', { ascending: false }).limit(200),
      admin.from('payments').select('*').order('created_at', { ascending: false }).limit(240),
      admin.from('appointments').select('*').order('created_at', { ascending: false }).limit(240),
      admin.from('booking_fallbacks').select('*').order('created_at', { ascending: false }).limit(120),
      admin.from('customers').select('id, full_name, email, phone').limit(500),
    ]);
    if (paymentsRes.error) error = paymentsRes.error.message;
    const receiptByPayment = new Map<string, Row>();
    for (const r of (receiptsRes.data ?? []) as Row[]) {
      if (r.payment_id) receiptByPayment.set(str(r.payment_id), r);
    }
    const apptById = new Map(((apptRes.data ?? []) as Row[]).map((r) => [str(r.id), r]));
    const fbById = new Map(((fallbackRes.data ?? []) as Row[]).map((r) => [str(r.id), r]));
    const customerById = new Map(((customerRes.data ?? []) as Row[]).map((r) => [str(r.id), r]));
    for (const p of (paymentsRes.data ?? []) as Row[]) {
      const receipt = receiptByPayment.get(str(p.id)) ?? {};
      const job = apptById.get(str(p.appointment_id)) ?? fbById.get(str(p.fallback_booking_id)) ?? {};
      const customer = customerById.get(str(p.customer_id || job.customer_id)) ?? {};
      rows.push({ ...job, ...p, receipt, customer, receipt_id: receipt.id, payment_id: p.id });
    }
    for (const r of (receiptsRes.data ?? []) as Row[]) {
      if (r.payment_id && rows.some((row) => str(row.payment_id) === str(r.payment_id))) continue;
      const job = apptById.get(str(r.appointment_id)) ?? fbById.get(str(r.fallback_booking_id)) ?? {};
      const customer = customerById.get(str(r.customer_id || job.customer_id)) ?? {};
      rows.push({ ...job, ...r, receipt: r, receipt_id: r.id, payment_id: r.payment_id });
    }
  }
  const revenueRows = rows.filter(countsForRevenue);
  const canonicalPayRows: PayRow[] = [];
  const seenPaymentIds = new Set<string>();
  for (const r of revenueRows) {
    const paymentId = str(r.payment_id || r.id);
    if (paymentId && seenPaymentIds.has(paymentId)) continue;
    if (paymentId) seenPaymentIds.add(paymentId);
    canonicalPayRows.push({
      id: paymentId,
      payment_id: str(r.payment_id) || null,
      amount_cents: typeof r.amount_cents === 'number' ? r.amount_cents : null,
      status: str(r.status || (r.receipt as Row)?.status) || 'paid',
      payment_method: str(r.payment_method || (r.receipt as Row)?.payment_method) || null,
      payment_kind: str(r.payment_kind) || null,
      created_at: str(r.created_at) || null,
      paid_at: str(r.paid_at || r.created_at) || null,
      appointment_id: str(r.appointment_id) || null,
      metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : null) as Record<string, unknown> | null,
      exclude_from_revenue: r.exclude_from_revenue === true || (r.receipt as Row)?.exclude_from_revenue === true,
      is_test: r.is_test === true || (r.receipt as Row)?.is_test === true,
      voided_at: str(r.voided_at || (r.receipt as Row)?.voided_at) || null,
      stripe_checkout_session_id: str(r.stripe_checkout_session_id) || null,
      stripe_payment_intent_id: str(r.stripe_payment_intent_id) || null,
      source_table: str(r.receipt_id) && !str(r.payment_id) ? 'receipts' : 'payments',
    });
  }
  const paidTotalCents = summarizePayments(canonicalPayRows).grossCents;

  return (
    <DashboardShell title='Receipts' subtitle='Printable and emailable customer receipts reconstructed from payments, bookings, and CRM records.' role='admin'>
      {error ? <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{error}</p> : null}
      <section className='grid gap-4 md:grid-cols-3'>
        <div className='rounded-3xl border border-gold/25 bg-zinc-950/90 p-5 shadow-[0_0_32px_rgba(212,166,77,0.10)]'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Receipts</p>
          <p className='mt-2 text-3xl font-black text-white'>{rows.length}</p>
        </div>
        <div className='rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-emerald-200'>Paid Total</p>
          <p className='mt-2 text-3xl font-black text-white'>{money(paidTotalCents)}</p>
          <p className='mt-1 text-xs text-emerald-100/80'>Canonical cash collected — deduped payments/receipts, credits excluded.</p>
        </div>
        <Link href='/admin/payments' className='rounded-3xl border border-white/10 bg-black/40 p-5 transition hover:border-gold/40 hover:shadow-[0_0_28px_rgba(212,166,77,0.14)]'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Payments Ledger</p>
          <p className='mt-2 text-sm text-zinc-400'>Open Stripe/cash source records</p>
        </Link>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/90 p-5'>
        <form id='receipt-bulk-form' action={bulkReceiptRevenueFlagsAction} className='mb-4 rounded-2xl border border-white/10 bg-black/35 p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <select name='bulkAction' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
              <option value='exclude'>Bulk exclude from revenue</option>
              <option value='mark_test'>Bulk mark as test</option>
              <option value='void'>Bulk void receipt + linked payment</option>
              <option value='delete_test'>Bulk delete test receipts only</option>
            </select>
            <button type='submit' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-black uppercase text-gold-soft'>
              Apply to selected
            </button>
          </div>
          <p className='mt-2 text-xs text-zinc-500'>Select receipt checkboxes below. Delete only removes rows already marked test.</p>
        </form>
        <ReceiptLiveSearch total={rows.length} />
        <div className='grid gap-3'>
          {rows.length === 0 ? <p className='rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500'>No payments or receipts found.</p> : null}
          {rows.map((r) => {
            const receipt = (r.receipt && typeof r.receipt === 'object' ? r.receipt : {}) as Row;
            const customer = (r.customer && typeof r.customer === 'object' ? r.customer : {}) as Row;
            const workOrderId = str(r.appointment_id || r.fallback_booking_id);
            const id = str(receipt.id || r.payment_id || workOrderId || r.id);
            const receiptNumber = str(receipt.receipt_number) || `RCPT-${id.slice(0, 8).toUpperCase()}`;
            const statusText = str(receipt.status || r.status || (Number(r.balance_due_cents ?? 0) > 0 ? 'Balance due' : 'Draft'));
            const customerName = str(r.guest_name || customer.full_name || r.customer_name) || 'Customer';
            const email = str(r.guest_email || customer.email || r.email);
            const phone = str(r.guest_phone || customer.phone || r.phone);
            const balance = Number(r.balance_due_cents ?? receipt.balance_due_cents ?? 0);
            const lineItems = [str(r.service_slug).replace(/-/g, ' ') || 'Service package'].filter(Boolean);
            const searchText = [
              id,
              receiptNumber,
              statusText,
              customerName,
              email,
              phone,
              str(r.payment_id),
              str(r.appointment_id),
              str(r.fallback_booking_id),
              str(r.amount_cents ?? receipt.amount_cents),
              str(r.payment_method || r.payment_kind || receipt.payment_method),
            ].join(' ');
            return (
              <article key={`${id}-${str(r.created_at)}`} data-receipt-card data-search={searchText} className='rounded-2xl border border-white/10 bg-black/35 p-4 transition hover:border-gold/30'>
                {str(receipt.id) ? (
                  <label className='mb-3 flex items-center gap-2 text-xs font-bold uppercase text-zinc-400'>
                    <input form='receipt-bulk-form' type='checkbox' name='receiptIds' value={str(receipt.id)} className='h-4 w-4 accent-[var(--gold)]' />
                    Select for bulk action
                  </label>
                ) : null}
                <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                  <div>
                    <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>{receiptNumber}</p>
                    <h2 className='mt-2 text-xl font-black text-white'>{str(r.guest_name || customer.full_name || r.customer_name) || 'Customer'}</h2>
                    <p className='text-sm text-zinc-400'>{str(r.guest_email || customer.email || r.email)} · {str(r.guest_phone || customer.phone || r.phone)}</p>
                    <p className='mt-2 text-sm text-zinc-500'>{address(r) || 'Service address pending'}</p>
                  </div>
                  <div className='text-left lg:text-right'>
                    <p className='text-2xl font-black text-white'>{money(r.amount_cents ?? receipt.amount_cents)}</p>
                    <p className='text-xs text-zinc-400'>{str(r.payment_method || r.payment_kind || receipt.payment_method || 'stripe').replace(/_/g, ' ')} · {str(r.status || receipt.status)}</p>
                    <p className='text-xs text-zinc-500'>{chicago(r.paid_at || r.created_at || receipt.created_at)}</p>
                  </div>
                </div>
                <div className='mt-4 flex flex-wrap gap-2'>
                  <ReceiptDetailDrawer
                    row={{
                      id,
                      receiptNumber,
                      customer: customerName,
                      email,
                      phone,
                      workOrderId: str(r.appointment_id || r.fallback_booking_id),
                      paymentId: str(r.payment_id),
                      amount: money(r.amount_cents ?? receipt.amount_cents),
                      balance: money(balance),
                      status: statusText,
                      sentStatus: str(receipt.sent_status || receipt.last_send_status),
                      lineItems,
                      discounts: str(receipt.discount_label || r.promo_code),
                      pdfHref: `/api/receipts/${encodeURIComponent(id)}/pdf${workOrderId && !str(receipt.id) && !str(r.payment_id) ? (str(r.fallback_booking_id) ? '?source=fallback' : '?source=appointment') : ''}`,
                      receiptHref: `/admin/receipts/${encodeURIComponent(id)}`,
                      paymentHref: str(r.payment_id) ? `/admin/payments/${str(r.payment_id)}` : undefined,
                    }}
                  />
                  <Link href={`/admin/receipts/${encodeURIComponent(id)}`} className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Open Receipt</Link>
                  {str(r.payment_id) ? <Link href={`/admin/payments/${str(r.payment_id)}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Payment</Link> : null}
                  <ReceiptSendForm
                    receiptId={str(receipt.id) || undefined}
                    paymentId={str(r.payment_id) || undefined}
                    workOrderId={workOrderId || undefined}
                  />
                  <form action={updateReceiptRevenueFlagsAction} className='flex flex-wrap gap-2'>
                    <input type='hidden' name='receiptId' value={str(receipt.id)} />
                    <input type='hidden' name='paymentId' value={str(r.payment_id)} />
                    <button name='flagAction' value='mark_test' className='rounded-xl border border-amber-500/40 px-3 py-2 text-xs font-black uppercase text-amber-200'>Test</button>
                    <button name='flagAction' value='exclude' className='rounded-xl border border-white/15 px-3 py-2 text-xs font-black uppercase text-zinc-300'>Exclude</button>
                    <button name='flagAction' value='include' className='rounded-xl border border-emerald-500/40 px-3 py-2 text-xs font-black uppercase text-emerald-200'>Include</button>
                    <button name='flagAction' value='void' className='rounded-xl border border-red-500/40 px-3 py-2 text-xs font-black uppercase text-red-200'>Void</button>
                    {receipt.is_test === true ? <button name='flagAction' value='delete_test' className='rounded-xl border border-red-500/40 px-3 py-2 text-xs font-black uppercase text-red-200'>Delete test</button> : null}
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </DashboardShell>
  );
}
