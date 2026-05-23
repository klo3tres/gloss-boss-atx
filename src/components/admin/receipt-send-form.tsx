'use client';

import { sendReceiptActionState } from '@/app/(dashboard)/admin/receipts/receipt-actions';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { ToastActionForm } from '@/components/ui/toast-action-form';

export function ReceiptSendForm({ receiptId, paymentId }: { receiptId?: string; paymentId?: string }) {
  return (
    <ToastActionForm action={sendReceiptActionState}>
      {receiptId ? <input type='hidden' name='receiptId' value={receiptId} /> : null}
      {paymentId ? <input type='hidden' name='paymentId' value={paymentId} /> : null}
      <SubmitStatusButton
        pendingText='Sending...'
        className='rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'
      >
        Send Receipt
      </SubmitStatusButton>
    </ToastActionForm>
  );
}
