'use client';

import { useState } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  rebuildReceiptFromWorkOrderActionState,
  recordManualPaymentActionState,
  voidPaymentActionState,
} from '@/app/(dashboard)/admin/payment-ops-actions';

export function ReceiptAdminControls({
  appointmentId,
  fallbackBookingId,
  receiptId,
  paymentId,
  receiptPath,
}: {
  appointmentId: string;
  fallbackBookingId: string;
  receiptId: string;
  paymentId: string;
  receiptPath: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className='gb-no-print mt-6 rounded-2xl border border-gold/25 bg-zinc-950/90 p-5'>
      <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Receipt & payment ops</p>
      <p className='mt-1 text-sm text-zinc-400'>Rebuild from work order, record Zelle/cash, or void a payment row.</p>
      {msg ? (
        <p className='mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      <div className='mt-4 flex flex-wrap gap-3'>
        <ToastActionForm
          action={async (prev, fd) => {
            const r = await rebuildReceiptFromWorkOrderActionState(prev, fd);
            setMsg(r.ok ? r.message ?? 'Done' : r.error ?? 'Failed');
            return r;
          }}
        >
          {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
          {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
          <SubmitStatusButton pendingText='Rebuilding…' className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
            Rebuild receipt from WO
          </SubmitStatusButton>
        </ToastActionForm>
      </div>

      {paymentId ? (
        <ToastActionForm
          className='mt-4 flex flex-wrap items-end gap-2'
          action={async (prev, fd) => {
            fd.set('receiptPath', receiptPath);
            const r = await voidPaymentActionState(prev, fd);
            setMsg(r.ok ? r.message ?? 'Voided' : r.error ?? 'Failed');
            return r;
          }}
        >
          <input type='hidden' name='paymentId' value={paymentId} />
          <input type='hidden' name='receiptPath' value={receiptPath} />
          <label className='text-xs text-zinc-400'>
            Void reason
            <input name='reason' className='mt-1 block w-48 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='Duplicate / error' />
          </label>
          <SubmitStatusButton pendingText='Voiding…' className='rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200'>
            Void payment
          </SubmitStatusButton>
        </ToastActionForm>
      ) : null}

      <ToastActionForm
        className='mt-4 grid gap-2 sm:grid-cols-4'
        action={async (prev, fd) => {
          const r = await recordManualPaymentActionState(prev, fd);
          setMsg(r.ok ? r.message ?? 'Recorded' : r.error ?? 'Failed');
          return r;
        }}
      >
        {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
        {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
        {receiptId ? <input type='hidden' name='receiptId' value={receiptId} /> : null}
        <label className='text-xs text-zinc-400 sm:col-span-1'>
          Amount ($)
          <input name='amountDollars' type='number' step='0.01' min='0.01' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' required />
        </label>
        <label className='text-xs text-zinc-400 sm:col-span-1'>
          Method
          <select name='method' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' defaultValue='cash'>
            <option value='cash'>Cash</option>
            <option value='zelle'>Zelle</option>
            <option value='venmo'>Venmo</option>
            <option value='check'>Check</option>
          </select>
        </label>
        <div className='flex items-end sm:col-span-2'>
          <SubmitStatusButton pendingText='Saving…' className='rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-200'>
            Record manual payment
          </SubmitStatusButton>
        </div>
      </ToastActionForm>
    </section>
  );
}
