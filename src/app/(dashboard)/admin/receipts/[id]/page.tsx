import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ReceiptDocument } from '@/components/documents/receipt-document';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';
import { ReceiptAdminControls } from '@/components/admin/receipt-admin-controls';
import { ReceiptLedgerDebugPanel } from '@/components/admin/receipt-ledger-debug-panel';
import { WorkOrderReceiptSendFlow } from '@/components/tech/work-order-receipt-send-flow';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveReceiptContext } from '@/lib/receipt-resolve';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

async function resolveCtx(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, id: string) {
  for (const hint of [undefined, 'appointment', 'fallback'] as const) {
    const ctx = await resolveReceiptContext(admin, id, hint);
    if (ctx) return ctx;
  }
  return null;
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
        <p className='mt-2 text-xs text-muted-foreground'>
          Receipt preview, PDF, and email are blocked until the order ledger resolves. Open the linked work order and use Advanced repair, or contact support.
        </p>
        <Link href='/admin/receipts' className='mt-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
          Back to receipts
        </Link>
      </DashboardShell>
    );
  }
}

async function renderReceiptPage(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, id: string) {
  const ctx = await resolveCtx(admin, id);
  if (!ctx) notFound();

  const { receipt, payment, job, workOrderId, isFallback, receiptNumber, techName } = ctx;
  const paymentId = str(payment?.id || receipt?.payment_id);
  const appointmentId = isFallback ? '' : workOrderId;
  const fallbackId = isFallback ? workOrderId : '';

  const view = await buildUnifiedReceiptView(admin, {
    job,
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackId || undefined,
    receiptNumber,
    techName: techName || undefined,
    receiptId: str(receipt?.id) || undefined,
  });

  const pdfHref = `/api/receipts/${encodeURIComponent(str(receipt?.id || paymentId || workOrderId))}/pdf${isFallback ? '?source=fallback' : appointmentId ? '?source=appointment' : ''}`;

  return (
    <DashboardShell title='Receipt detail' subtitle='Unified ledger receipt — matches PDF and email.' role='admin'>
      <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
        <Link href='/admin/receipts' className='rounded-xl border border-border px-4 py-2 text-xs font-black uppercase text-muted-foreground transition hover:border-gold/40 hover:text-foreground'>
          Back to Receipts
        </Link>
        {paymentId ? (
          <Link href={`/admin/payments/${paymentId}`} className='rounded-xl border border-border px-4 py-2 text-xs font-black uppercase text-muted-foreground transition hover:border-gold/40 hover:text-foreground'>
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

      <div className='gb-no-print mb-6'>
        <WorkOrderReceiptSendFlow
          appointmentId={appointmentId || undefined}
          fallbackBookingId={fallbackId || undefined}
          isFallback={isFallback}
          receiptPdfHref={pdfHref}
        />
      </div>

      <ReceiptDocument {...view.documentProps} />
    </DashboardShell>
  );
}
