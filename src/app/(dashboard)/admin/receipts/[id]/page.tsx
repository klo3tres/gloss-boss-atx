import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ReceiptDocument } from '@/components/documents/receipt-document';
import { PrintDocumentActions } from '@/components/ui/print-document-actions';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';
import { ReceiptAdminControls } from '@/components/admin/receipt-admin-controls';
import { ReceiptLedgerDebugPanel } from '@/components/admin/receipt-ledger-debug-panel';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';
import { sendReceiptActionState } from '../receipt-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

export default async function AdminReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  try {
    return await renderReceiptPage(admin, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[admin/receipts] render failed', { id, msg });
    return (
      <DashboardShell title='Receipt error' subtitle='Order ledger or unified receipt could not be built.' role='admin'>
        <p className='rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-sm text-red-100'>{msg}</p>
        <p className='mt-2 text-xs text-zinc-400'>
          Receipt preview, PDF, and email are blocked until the order ledger resolves. Use Advanced repair on the work order or contact support.
        </p>
        <Link href='/admin/receipts' className='mt-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
          Back to receipts
        </Link>
      </DashboardShell>
    );
  }
}

async function renderReceiptPage(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, id: string) {
  let receipt = (await admin.from('receipts').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!receipt) receipt = (await admin.from('receipts').select('*').eq('payment_id', id).maybeSingle()).data as Row | null;
  let paymentId = str(receipt?.payment_id || id);
  let payment = (await admin.from('payments').select('*').eq('id', paymentId).maybeSingle()).data as Row | null;
  if (!payment && receipt?.payment_id) {
    payment = (await admin.from('payments').select('*').eq('id', str(receipt.payment_id)).maybeSingle()).data as Row | null;
  }
  if (!receipt && !payment) {
    const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
    if (appt) {
      const { upsertWorkOrderReceipt } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
      try {
        await upsertWorkOrderReceipt(admin, id, id, '', appt);
        receipt = (await admin.from('receipts').select('*').eq('appointment_id', id).maybeSingle()).data as Row | null;
      } catch (err) {
        console.error('[admin/receipts] on-demand rebuild failed for appt', err);
      }
    } else {
      const { data: fb } = await admin.from('booking_fallbacks').select('*').eq('id', id).maybeSingle();
      if (fb) {
        const { upsertWorkOrderReceipt } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
        try {
          await upsertWorkOrderReceipt(admin, id, '', id, fb);
          receipt = (await admin.from('receipts').select('*').eq('fallback_booking_id', id).maybeSingle()).data as Row | null;
        } catch (err) {
          console.error('[admin/receipts] on-demand rebuild failed for fb', err);
        }
      }
    }
  }
  if (!receipt && !payment) notFound();
  paymentId = str(payment?.id || receipt?.payment_id);

  const appointmentId = str(receipt?.appointment_id || payment?.appointment_id);
  const fallbackId = str(receipt?.fallback_booking_id || payment?.fallback_booking_id);
  const [apptRes, fallbackRes] = await Promise.all([
    appointmentId ? admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null }),
    fallbackId ? admin.from('booking_fallbacks').select('*').eq('id', fallbackId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const job = (apptRes.data ?? fallbackRes.data ?? {}) as Row;
  if (!Object.keys(job).length) notFound();

  const workOrderId = appointmentId || fallbackId || str(job.id);
  const isFallback = Boolean(fallbackId && !appointmentId);

  const techId = str(job.assigned_technician_id);
  let technicianName: string | undefined;
  if (techId) {
    const { data: techProfile } = await admin.from('profiles').select('full_name, email').eq('id', techId).maybeSingle();
    technicianName = str((techProfile as Row | null)?.full_name) || str((techProfile as Row | null)?.email) || undefined;
  }

  const receiptNumber =
    str(receipt?.receipt_number) || `RCPT-${(paymentId || workOrderId).slice(0, 8).toUpperCase()}`;

  const view = await buildUnifiedReceiptView(admin, {
    job,
    appointmentId: isFallback ? undefined : workOrderId,
    fallbackBookingId: isFallback ? workOrderId : undefined,
    receiptNumber,
    techName: technicianName,
    receiptId: str(receipt?.id) || undefined,
  });

  const pdfHref = `/api/receipts/${encodeURIComponent(str(receipt?.id || paymentId || workOrderId))}/pdf`;

  return (
    <DashboardShell title='Receipt detail' subtitle='Unified ledger receipt — matches PDF and email.' role='admin'>
      <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
        <Link href='/admin/receipts' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
          Back to Receipts
        </Link>
        {paymentId ? (
          <Link href={`/admin/payments/${paymentId}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
            Payment Detail
          </Link>
        ) : null}
        {workOrderId ? (
          <Link
            href={`/admin/work-orders/${encodeURIComponent(workOrderId)}${isFallback ? '?source=fallback&shell=admin' : '?shell=admin'}`}
            className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'
          >
            Edit work order
          </Link>
        ) : null}
      </div>

      <div className='gb-no-print mb-4 max-w-xs'>
        <ReceiptPdfDownloadButton href={pdfHref} className='' label='Download invoice PDF' />
      </div>

      <ReceiptLedgerDebugPanel parity={view.parity} />

      <ReceiptAdminControls
        appointmentId={appointmentId}
        fallbackBookingId={fallbackId}
        receiptId={str(receipt?.id)}
        paymentId={paymentId}
        receiptPath={`/admin/receipts/${id}`}
      />

      <PrintDocumentActions
        sendForm={
          <ToastActionForm action={sendReceiptActionState}>
            {receipt?.id ? <input type='hidden' name='receiptId' value={str(receipt.id)} /> : null}
            {paymentId ? <input type='hidden' name='paymentId' value={paymentId} /> : null}
            <SubmitStatusButton pendingText='Sending...' className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'>
              Send Receipt
            </SubmitStatusButton>
          </ToastActionForm>
        }
      />

      <ReceiptDocument {...view.documentProps} />
    </DashboardShell>
  );
}
