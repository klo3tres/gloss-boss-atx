'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  rebuildReceiptFromWorkOrderActionState,
  recordManualPaymentActionState,
  voidExtrasAndRebuildActionState,
  voidPaymentActionState,
} from '@/app/(dashboard)/admin/payment-ops-actions';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import { filterReceiptBreakdownForCustomer } from '@/lib/unified-receipt';
import type { JobPricingDisplay } from '@/lib/job-pricing-display';
import { displayMoney } from '@/lib/display-format';

export type WorkOrderPaymentRow = {
  id: string;
  amount: string;
  amountCents: number;
  status: string;
  method: string;
  at: string;
  voided?: boolean;
};

export function WorkOrderReceiptPanel({
  appointmentId,
  fallbackBookingId,
  receiptPdfHref,
  pricing,
  breakdownLines,
  payments,
  promoCode,
  canManagePayments,
  workOrderPath,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  receiptPdfHref?: string;
  pricing: JobPricingDisplay;
  breakdownLines: ReceiptBreakdownLine[];
  payments: WorkOrderPaymentRow[];
  promoCode?: string;
  canManagePayments: boolean;
  workOrderPath: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  const activePayments = payments.filter((p) => p.id && !p.voided && !p.status.toLowerCase().includes('void'));
  const customerBreakdown = filterReceiptBreakdownForCustomer(breakdownLines);

  const afterAction = (text: string, ok: boolean) => {
    setMsg(text);
    if (ok) router.refresh();
  };

  return (
    <section className='gb-premium-card mt-6 rounded-2xl border border-gold/25 bg-zinc-950/90 p-5'>
      <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Receipt builder</p>
      <p className='mt-1 text-sm text-zinc-400'>
        Void test/duplicate payments, rebuild from work order pricing, then print PDF or send checkout.
      </p>

      {pricing.hasOverpayment ? (
        <p className='mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
          <strong>Payment mismatch:</strong> {displayMoney(pricing.rawTotalPaidCents)} on payment rows vs{' '}
          {displayMoney(pricing.finalTotalCents)} job total. Void extras, then rebuild receipt.
        </p>
      ) : null}

      {promoCode ? (
        <p className='mt-2 text-xs text-zinc-400'>
          Promo: <span className='font-mono text-gold-soft'>{promoCode}</span>
        </p>
      ) : null}

      {msg ? (
        <p className='mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      <div className='mt-4 rounded-xl border border-white/10 bg-black/40 p-4'>
        <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Live receipt preview (customer view)</p>
        <ul className='mt-3 space-y-1.5 text-sm'>
          {customerBreakdown.map((line, i) => (
            <li key={`${line.label}-${i}`} className='flex justify-between gap-4'>
              <span className={line.tone === 'discount' ? 'text-emerald-300' : 'text-zinc-300'}>{line.label}</span>
              <span
                className={`font-mono font-bold ${
                  line.tone === 'total' || line.tone === 'paid' ? 'text-gold-soft' : 'text-white'
                }`}
              >
                {line.amount}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canManagePayments && payments.length > 0 ? (
        <div className='mt-4'>
          <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Payment rows</p>
          <ul className='mt-2 space-y-2'>
            {payments.map((p) => (
              <li
                key={p.id || p.at}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs'
              >
                <span>
                  <strong className='text-white'>{p.amount}</strong> · {p.method} · {p.status}
                  <span className='ml-2 text-zinc-500'>{p.at}</span>
                </span>
                {p.id && canManagePayments && !p.voided && !p.status.toLowerCase().includes('void') ? (
                  <ToastActionForm
                    action={async (prev, fd) => {
                      fd.set('receiptPath', workOrderPath);
                      fd.set('workOrderPath', workOrderPath);
                      const r = await voidPaymentActionState(prev, fd);
                      afterAction(r.ok ? r.message ?? 'Voided' : r.error ?? 'Failed', r.ok);
                      return r;
                    }}
                  >
                    <input type='hidden' name='paymentId' value={p.id} />
                    <input type='hidden' name='receiptPath' value={workOrderPath} />
                    <input type='hidden' name='workOrderPath' value={workOrderPath} />
                    <SubmitStatusButton
                      pendingText='…'
                      className='rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-black uppercase text-red-200'
                    >
                      Void
                    </SubmitStatusButton>
                  </ToastActionForm>
                ) : (
                  <span className='text-zinc-600'>voided</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManagePayments ? (
        <>
          <div className='mt-4 flex flex-wrap gap-3'>
            {pricing.hasOverpayment ? (
              <ToastActionForm
                action={async (prev, fd) => {
                  fd.set('workOrderPath', workOrderPath);
                  const r = await voidExtrasAndRebuildActionState(prev, fd);
                  afterAction(r.ok ? r.message ?? 'Extras voided' : r.error ?? 'Failed', r.ok);
                  return r;
                }}
              >
                {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
                {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
                <input type='hidden' name='workOrderPath' value={workOrderPath} />
                <SubmitStatusButton
                  pendingText='Fixing…'
                  className='rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-200'
                >
                  Void extras & rebuild receipt
                </SubmitStatusButton>
              </ToastActionForm>
            ) : null}
            <ToastActionForm
              action={async (prev, fd) => {
                fd.set('workOrderPath', workOrderPath);
                const r = await rebuildReceiptFromWorkOrderActionState(prev, fd);
                afterAction(r.ok ? r.message ?? 'Receipt rebuilt' : r.error ?? 'Failed', r.ok);
                return r;
              }}
            >
              {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
              {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
              <input type='hidden' name='workOrderPath' value={workOrderPath} />
              <SubmitStatusButton
                pendingText='Rebuilding…'
                className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'
              >
                Rebuild receipt from WO
              </SubmitStatusButton>
            </ToastActionForm>
          </div>

          <ToastActionForm
            className='mt-4 grid gap-2 sm:grid-cols-4'
            action={async (prev, fd) => {
              fd.set('workOrderPath', workOrderPath);
              const r = await recordManualPaymentActionState(prev, fd);
              afterAction(r.ok ? r.message ?? 'Recorded' : r.error ?? 'Failed', r.ok);
              return r;
            }}
          >
            {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
            {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
            <input type='hidden' name='workOrderPath' value={workOrderPath} />
            <label className='text-xs text-zinc-400 sm:col-span-1'>
              Amount ($)
              <input
                name='amountDollars'
                type='number'
                step='0.01'
                min='0.01'
                className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white'
                required
              />
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
              <SubmitStatusButton
                pendingText='Saving…'
                className='rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-200'
              >
                Record manual payment
              </SubmitStatusButton>
            </div>
          </ToastActionForm>
        </>
      ) : null}

      <div className='mt-4 flex flex-wrap gap-2'>
        {receiptPdfHref ? (
          <ReceiptPdfDownloadButton
            href={receiptPdfHref}
            label='Print / download PDF'
            className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'
          />
        ) : null}
        {activePayments.length > 0 ? (
          <p className='text-[10px] text-zinc-500 self-center'>{activePayments.length} active payment row(s)</p>
        ) : null}
      </div>
    </section>
  );
}
