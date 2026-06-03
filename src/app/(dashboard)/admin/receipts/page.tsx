import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminReceiptsListClient, mapReceiptRows } from '@/components/admin/admin-receipts-list-client';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
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

  const listRows = mapReceiptRows(rows);

  return (
    <DashboardShell title='Receipts' subtitle='Search, filter, and open customer-ready receipts.' role='admin'>
      {error ? <p className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{error}</p> : null}
      <AdminReceiptsListClient rows={listRows} />
    </DashboardShell>
  );
}
