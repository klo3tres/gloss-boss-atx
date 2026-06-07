'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Mail, Save } from 'lucide-react';
import { ReceiptDocument, type ReceiptDocumentProps } from '@/components/documents/receipt-document';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';
import {
  previewCustomerReceiptAction,
  saveReceiptDraftAction,
  sendReceiptTestToOwnerAction,
  sendWorkOrderReceiptConfirmedAction,
} from '@/app/(dashboard)/tech/work-order-payment-actions';

export function WorkOrderReceiptSendFlow({
  appointmentId,
  fallbackBookingId,
  isFallback,
  receiptPdfHref,
  compact,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  isFallback: boolean;
  receiptPdfHref?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [docProps, setDocProps] = useState<ReceiptDocumentProps | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const baseFd = () => {
    const fd = new FormData();
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    return fd;
  };

  const loadPreview = () => {
    startTransition(async () => {
      setMsg(null);
      const res = await previewCustomerReceiptAction(baseFd());
      if (!res.ok || !res.documentProps) {
        setMsg({ tone: 'err', text: res.error ?? 'Could not build receipt preview.' });
        return;
      }
      setDocProps(res.documentProps as ReceiptDocumentProps);
      setReceiptNumber(res.receiptNumber ?? '');
      setPreviewOpen(true);
      setApproved(false);
      setMsg({ tone: 'ok', text: 'Preview rebuilt from latest work order totals.' });
    });
  };

  const saveDraft = () => {
    startTransition(async () => {
      setMsg(null);
      const res = await saveReceiptDraftAction(baseFd());
      setMsg({ tone: res.ok ? 'ok' : 'err', text: res.ok ? res.message ?? 'Draft saved.' : res.error ?? 'Save failed' });
      if (res.ok) router.refresh();
    });
  };

  const sendTest = () => {
    startTransition(async () => {
      setMsg(null);
      const res = await sendReceiptTestToOwnerAction(baseFd());
      setMsg({ tone: res.ok ? 'ok' : 'err', text: res.ok ? res.message ?? 'Test sent.' : res.error ?? 'Test failed' });
    });
  };

  const sendCustomer = () => {
    setShowConfirm(false);
    if (!approved) {
      setMsg({ tone: 'err', text: 'Approve the preview before sending to the customer.' });
      return;
    }
    startTransition(async () => {
      setMsg(null);
      const fd = baseFd();
      fd.set('sendConfirmed', 'true');
      const res = await sendWorkOrderReceiptConfirmedAction(fd);
      setMsg({ tone: res.ok ? 'ok' : 'err', text: res.ok ? res.message ?? 'Receipt sent.' : res.error ?? 'Send failed' });
      if (res.ok) router.refresh();
    });
  };

  return (
    <section className={`rounded-2xl border border-gold/25 bg-zinc-950/90 ${compact ? 'p-4' : 'p-5'}`}>
      <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Customer receipt (preview before send)</p>
      <p className='mt-1 text-sm text-zinc-400'>
        Rebuild, preview exactly what the customer will receive, approve, then send. Nothing emails without your approval.
      </p>

      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={pending}
          onClick={loadPreview}
          className='inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50'
        >
          <Eye className='h-4 w-4' />
          Preview customer receipt
        </button>
        <button
          type='button'
          disabled={pending}
          onClick={saveDraft}
          className='inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50'
        >
          <Save className='h-4 w-4' />
          Save draft receipt
        </button>
        {receiptPdfHref ? (
          <ReceiptPdfDownloadButton
            href={receiptPdfHref}
            label='Download PDF'
            className='rounded-xl border border-white/20 px-4 py-3 text-[10px] font-black uppercase text-white'
          />
        ) : null}
        <button
          type='button'
          disabled={pending}
          onClick={sendTest}
          className='rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-[10px] font-black uppercase text-violet-200 disabled:opacity-50'
        >
          Send test to owner
        </button>
      </div>

      {previewOpen && docProps ? (
        <div className='mt-5 space-y-4'>
          <div className='max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-white p-2'>
            <ReceiptDocument {...docProps} />
          </div>
          <p className='text-center font-mono text-xs text-zinc-500'>{receiptNumber}</p>
          <label className='flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100'>
            <input type='checkbox' checked={approved} onChange={(e) => setApproved(e.target.checked)} className='h-4 w-4' />
            I have reviewed this receipt — it matches what the customer should receive (email + PDF).
          </label>
          <button
            type='button'
            disabled={pending || !approved}
            onClick={() => setShowConfirm(true)}
            className='flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-40'
          >
            <Mail className='h-4 w-4' />
            Approve and send to customer
          </button>
        </div>
      ) : null}

      {showConfirm && docProps && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="gb-glass w-full max-w-md rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Receipt Email Preview</p>
              <h3 className="text-lg font-bold text-white">Confirm Send Receipt</h3>
            </div>
            
            <div className="space-y-2 text-sm text-zinc-300">
              <p><strong>To:</strong> {docProps.customerEmail || docProps.customerEmail}</p>
              <p><strong>Subject:</strong> Gloss Boss ATX Receipt: {receiptNumber || docProps.receiptNumber}</p>
              <p className="pt-2 text-xs text-zinc-400">
                This will email the official PDF receipt and update details to the customer.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendCustomer}
                className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200 shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {msg ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' : 'border-red-500/35 bg-red-500/10 text-red-100'}`}
          role='status'
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
