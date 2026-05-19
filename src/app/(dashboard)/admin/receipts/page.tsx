import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { sendReceiptAction } from './receipt-actions';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';

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
          <p className='mt-2 text-3xl font-black text-white'>{money(rows.reduce((sum, r) => sum + (typeof r.amount_cents === 'number' ? r.amount_cents : 0), 0))}</p>
        </div>
        <Link href='/admin/payments' className='rounded-3xl border border-white/10 bg-black/40 p-5 transition hover:border-gold/40 hover:shadow-[0_0_28px_rgba(212,166,77,0.14)]'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Payments Ledger</p>
          <p className='mt-2 text-sm text-zinc-400'>Open Stripe/cash source records</p>
        </Link>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/90 p-5'>
        <div className='grid gap-3'>
          {rows.length === 0 ? <p className='rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500'>No payments or receipts found.</p> : null}
          {rows.map((r) => {
            const receipt = (r.receipt && typeof r.receipt === 'object' ? r.receipt : {}) as Row;
            const customer = (r.customer && typeof r.customer === 'object' ? r.customer : {}) as Row;
            const id = str(receipt.id || r.payment_id || r.id);
            const receiptNumber = str(receipt.receipt_number) || `RCPT-${id.slice(0, 8).toUpperCase()}`;
            return (
              <article key={`${id}-${str(r.created_at)}`} className='rounded-2xl border border-white/10 bg-black/35 p-4 transition hover:border-gold/30'>
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
                  <Link href={`/admin/receipts/${encodeURIComponent(id)}`} className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Open Receipt</Link>
                  {str(r.payment_id) ? <Link href={`/admin/payments/${str(r.payment_id)}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Payment</Link> : null}
                  <form action={sendReceiptAction}>
                    {str(receipt.id) ? <input type='hidden' name='receiptId' value={str(receipt.id)} /> : null}
                    {str(r.payment_id) ? <input type='hidden' name='paymentId' value={str(r.payment_id)} /> : null}
                    <SubmitStatusButton pendingText='Sending...' className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'>Send Receipt</SubmitStatusButton>
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
