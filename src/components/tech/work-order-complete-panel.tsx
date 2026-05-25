'use client';

import { CheckCircle2, PartyPopper, Receipt, Send } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';
import { techCompleteJobAction } from '@/app/(dashboard)/tech/tech-actions';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { sendWorkOrderReceiptEmailAction } from '@/app/(dashboard)/tech/work-order-payment-actions';

export function WorkOrderCompletePanel({
  jobId,
  isFallback,
  workflowSessionId,
  canAdminOverride,
  paymentComplete,
  balanceDueCents,
  guestEmail,
  agreementCaptureHref,
}: {
  jobId: string;
  isFallback: boolean;
  workflowSessionId?: string | null;
  canAdminOverride: boolean;
  paymentComplete: boolean;
  balanceDueCents: number;
  guestEmail: string;
  agreementCaptureHref: string;
}) {
  const [state, formAction, pending] = useActionState(techCompleteJobAction, null);

  if (state?.ok) {
    return (
      <section className='gb-completion-celebrate space-y-4 rounded-3xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/15 via-black to-zinc-950 p-6 text-center shadow-[0_0_48px_rgba(16,185,129,0.2)]'>
        <div className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-500/20'>
          <CheckCircle2 className='gb-check-pop h-12 w-12 text-emerald-300' />
        </div>
        <p className='text-xs font-black uppercase tracking-[0.28em] text-emerald-300'>Job complete</p>
        <h2 className='gb-display-serif text-2xl font-black text-white sm:text-3xl'>Good job — Gloss Boss ATX</h2>
        <p className='mx-auto max-w-md text-sm text-zinc-300'>
          Work order marked complete. Send receipt, balance link, or completion message below.
        </p>
        <div className='flex flex-wrap justify-center gap-2 pt-2'>
          {!isFallback ? (
            <ToastActionForm action={sendWorkOrderReceiptEmailAction}>
              <input type='hidden' name='appointmentId' value={jobId} />
              <SubmitStatusButton
                pendingText='Sending…'
                className='inline-flex items-center gap-2 rounded-2xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'
              >
                <Receipt className='h-4 w-4' /> Email receipt
              </SubmitStatusButton>
            </ToastActionForm>
          ) : null}
          {balanceDueCents > 0 && !isFallback ? (
            <NotificationSendForm
              kind='payment_link'
              appointmentId={jobId}
              buttonClassName='inline-flex items-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-3 text-xs font-black uppercase text-gold-soft'
            >
              <Send className='h-4 w-4' /> Balance link
            </NotificationSendForm>
          ) : null}
          <Link
            href={`/admin/receipts/${encodeURIComponent(jobId)}`}
            className='inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-xs font-black uppercase text-zinc-200'
          >
            View receipt
          </Link>
        </div>
        {guestEmail ? <p className='text-[10px] text-zinc-500'>Customer: {guestEmail}</p> : null}
      </section>
    );
  }

  return (
    <form id='complete-job' action={formAction} className='gb-premium-card space-y-3 rounded-2xl border border-gold/30 p-4'>
      <div className='flex items-center gap-2'>
        <PartyPopper className='h-5 w-5 text-gold-soft' />
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Complete job</p>
      </div>
      {!isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
      {isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
      {workflowSessionId ? <input type='hidden' name='workflowSessionId' value={workflowSessionId} /> : null}
      {canAdminOverride && !paymentComplete ? (
        <label className='flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'>
          <input type='checkbox' name='adminOverride' value='true' className='rounded border-amber-400' />
          Admin override — complete with balance due (${(balanceDueCents / 100).toFixed(2)})
        </label>
      ) : null}
      {canAdminOverride ? (
        <>
          <label className='flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'>
            <input type='checkbox' name='completionOverride' value='true' className='rounded border-amber-400' />
            Admin override — skip after photos / checklist
          </label>
          <input
            name='completionOverrideReason'
            placeholder='Override reason (required when skipping requirements)'
            className='w-full rounded-xl border border-amber-500/30 bg-black px-3 py-2 text-sm text-white'
          />
        </>
      ) : null}
      {state?.error ? (
        <p className='rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100' role='alert'>
          {state.error}
        </p>
      ) : null}
      <p className='text-[10px] text-zinc-500'>
        Requires agreement, before/after photos, checklist, and payment (or admin override).{' '}
        <Link href={agreementCaptureHref} className='text-gold-soft underline'>
          Agreement
        </Link>
      </p>
      <button
        type='submit'
        disabled={pending}
        className='gb-premium-btn flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-sm font-black uppercase text-black disabled:opacity-60'
      >
        {pending ? 'Completing…' : (
          <>
            <CheckCircle2 className='h-5 w-5' /> Complete job
          </>
        )}
      </button>
    </form>
  );
}
