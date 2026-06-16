'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  recordManualStripePaymentAction,
  syncStripePaymentsForWorkOrderAction,
} from '@/app/(dashboard)/tech/work-order-stripe-sync-actions';

export function WorkOrderStripeDebugPanel({
  appointmentId,
  fallbackBookingId,
  source,
  stripeSessionId,
  stripePaymentIntent,
  paymentRows,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
  stripeSessionId: string;
  stripePaymentIntent: string;
  paymentRows: Array<{
    id: string;
    amount: string;
    method: string;
    kind?: string;
    status: string;
    stripeSession?: string;
    stripeIntent?: string;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; detail?: string } | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualRef, setManualRef] = useState(stripeSessionId);

  const sync = () => {
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('source', source);
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      const res = await syncStripePaymentsForWorkOrderAction(fd);
      if (!res.ok) {
        setMsg({
          tone: 'err',
          text: res.error ?? 'Sync failed',
          detail: [res.blocker ? `Blocker: ${res.blocker}` : '', ...(res.diagnostics ?? [])].filter(Boolean).join('\n'),
        });
        return;
      }
      setMsg({
        tone: 'ok',
        text: `Synced ${res.attachedIds.length} payment row(s). Matched ${res.matchedBefore} → ${res.matchedAfter}.`,
        detail: JSON.stringify(
          {
            appointment_id: res.appointmentId,
            stripe_session_id: res.stripeSessionId,
            stripe_payment_intent: res.stripePaymentIntent,
            attachedIds: res.attachedIds,
            paymentRows: res.paymentRows,
          },
          null,
          2,
        ),
      });
      router.refresh();
    });
  };

  return (
    <details className='gb-no-print rounded-2xl border border-dashed border-violet-500/40 bg-black/50 p-4 text-xs text-zinc-400'>
      <summary className='cursor-pointer font-black uppercase tracking-wider text-violet-200'>Stripe / payments debug (admin)</summary>
      <dl className='mt-3 grid gap-1 font-mono sm:grid-cols-2'>
        <dt>appointment_id</dt>
        <dd className='text-zinc-200'>{appointmentId || '—'}</dd>
        <dt>stripe_session_id</dt>
        <dd className='break-all text-zinc-200'>{stripeSessionId || '—'}</dd>
        <dt>stripe_payment_intent</dt>
        <dd className='break-all text-zinc-200'>{stripePaymentIntent || '—'}</dd>
        <dt>matching payments found</dt>
        <dd className='text-zinc-200'>{paymentRows.length}</dd>
      </dl>
      {paymentRows.length > 0 ? (
        <ul className='mt-3 space-y-2'>
          {paymentRows.map((p) => (
            <li key={p.id} className='rounded border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-zinc-300'>
              {p.id} · {p.amount} · {p.method} · {p.status}
              {p.stripeSession ? ` · session ${p.stripeSession.slice(0, 12)}…` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-2 text-amber-200/90'>No succeeded payment rows linked to this work order.</p>
      )}
      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={pending}
          onClick={sync}
          className='rounded-lg border border-violet-500/50 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase text-violet-200 disabled:opacity-50'
        >
          Sync Stripe payments for this work order
        </button>
      </div>
      <div className='mt-4 rounded-xl border border-white/10 bg-black/40 p-3'>
        <p className='text-[10px] font-black uppercase text-zinc-400'>Record Stripe payment (legacy jobs)</p>
        <div className='mt-2 flex flex-wrap gap-2'>
          <input
            type='number'
            step='0.01'
            min={0}
            placeholder='Amount $'
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            className='w-28 rounded border border-zinc-700 bg-black px-2 py-1 text-white'
          />
          <input
            placeholder='Session / intent ref'
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            className='min-w-[160px] flex-1 rounded border border-zinc-700 bg-black px-2 py-1 text-white'
          />
          <input
            placeholder='Reason (required)'
            value={manualReason}
            onChange={(e) => setManualReason(e.target.value)}
            className='min-w-[160px] flex-1 rounded border border-zinc-700 bg-black px-2 py-1 text-white'
          />
          <button
            type='button'
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const fd = new FormData();
                fd.set('source', source);
                if (appointmentId) fd.set('appointmentId', appointmentId);
                if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
                fd.set('amountDollars', manualAmount);
                fd.set('reason', manualReason);
                fd.set('reference', manualRef);
                const res = await recordManualStripePaymentAction(fd);
                setMsg({
                  tone: res.ok ? 'ok' : 'err',
                  text: res.ok ? `Recorded payment. Rows: ${res.matchedBefore} → ${res.matchedAfter}` : res.error ?? 'Failed',
                  detail: !res.ok
                    ? [res.blocker ? `Blocker: ${res.blocker}` : '', ...(res.diagnostics ?? [])].filter(Boolean).join('\n')
                    : undefined,
                });
                if (res.ok) router.refresh();
              });
            }}
            className='rounded-lg bg-violet-600 px-3 py-1 text-[10px] font-black uppercase text-white disabled:opacity-50'
          >
            Record Stripe payment
          </button>
        </div>
      </div>
      {msg ? (
        <div className={`mt-3 rounded border p-3 text-sm ${msg.tone === 'ok' ? 'border-emerald-500/40 text-emerald-200' : 'border-red-500/40 text-red-200'}`}>
          <p>{msg.text}</p>
          {msg.detail ? <pre className='mt-2 max-h-48 overflow-auto text-[10px] text-zinc-500'>{msg.detail}</pre> : null}
        </div>
      ) : null}
    </details>
  );
}
