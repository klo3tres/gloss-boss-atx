'use client';

import { useActionState } from 'react';
import { correctPaymentTruthActionState } from '@/app/(dashboard)/admin/payment-ops-actions';

export function CorrectPaymentTruthPanel({
  appointmentId,
  fallbackBookingId,
  workOrderPath,
  defaultFinalDollars,
  defaultPaidDollars,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  workOrderPath: string;
  defaultFinalDollars?: string;
  defaultPaidDollars?: string;
}) {
  const [state, action, pending] = useActionState(correctPaymentTruthActionState, null);

  return (
    <form action={action} className='mt-4 rounded-2xl border border-amber-500/35 bg-amber-500/5 p-4'>
      <p className='text-xs font-black uppercase tracking-wider text-amber-200'>Correct payment truth</p>
      <p className='mt-1 text-[11px] leading-relaxed text-zinc-400'>
        Voids incorrect payment rows, records one correct payment, sets final total, and rebuilds receipt/revenue. Use for cash-paid jobs with fake Stripe deposits.
      </p>
      {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
      {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
      <input type='hidden' name='workOrderPath' value={workOrderPath} />

      <div className='mt-3 grid gap-3 sm:grid-cols-2'>
        <label className='text-xs text-zinc-400'>
          Final total ($)
          <input
            name='finalTotalDollars'
            type='number'
            step='0.01'
            min={0}
            defaultValue={defaultFinalDollars}
            className='gb-input mt-1 w-full'
            required
          />
        </label>
        <label className='text-xs text-zinc-400'>
          Amount actually paid ($)
          <input
            name='amountPaidDollars'
            type='number'
            step='0.01'
            min={0}
            defaultValue={defaultPaidDollars}
            className='gb-input mt-1 w-full'
            required
          />
        </label>
        <label className='text-xs text-zinc-400 sm:col-span-2'>
          Payment method
          <select name='paymentMethod' className='gb-input mt-1 w-full' defaultValue='cash'>
            <option value='cash'>Cash</option>
            <option value='zelle'>Zelle</option>
            <option value='venmo'>Venmo</option>
            <option value='cash_app'>Cash App</option>
            <option value='apple_pay'>Apple Pay</option>
            <option value='check'>Check</option>
            <option value='stripe'>Stripe / card</option>
          </select>
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2'>
          <input type='checkbox' name='removeFakeDeposit' defaultChecked className='h-4 w-4 rounded border-amber-500/50' />
          Remove fake deposit (clear expected deposit & Stripe session on appointment)
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2'>
          <input type='checkbox' name='voidDuplicates' defaultChecked className='h-4 w-4 rounded border-amber-500/50' />
          Void all existing payment rows before recording correct payment
        </label>
        <label className='text-xs text-zinc-400 sm:col-span-2'>
          Reason (required)
          <textarea name='reason' rows={2} className='gb-input mt-1 w-full' placeholder='e.g. Customer paid $200 cash in full — no Stripe deposit' required />
        </label>
      </div>

      <button
        type='submit'
        disabled={pending}
        className='mt-3 rounded-xl bg-amber-500 px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50'
      >
        {pending ? 'Saving…' : 'Save payment truth'}
      </button>

      {state?.ok === false && state.error ? (
        <p className='mt-2 text-xs text-red-300' role='alert'>
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className='mt-2 text-xs text-emerald-300' role='status'>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
