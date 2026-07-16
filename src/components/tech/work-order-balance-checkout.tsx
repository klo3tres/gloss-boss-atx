'use client';

import { useCallback, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { recordManualPaymentActionState } from '@/app/(dashboard)/admin/payment-ops-actions';

type CheckoutResponse = {
  ok?: boolean;
  url?: string;
  error?: string;
  code?: string;
  balanceCents?: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WorkOrderBalanceCheckout({
  appointmentId,
  balanceDueCents,
  balanceDue,
  finalTotal,
  depositPaid,
  depositRequired,
  paymentStatusLabel: paymentStatusText,
  totalPaid,
  paymentComplete,
  isFallback,
  workOrderPath,
}: {
  appointmentId: string;
  balanceDueCents: number;
  balanceDue: string;
  finalTotal?: string;
  depositPaid?: string;
  depositRequired?: string;
  paymentStatusLabel?: string;
  totalPaid?: string;
  paymentComplete: boolean;
  isFallback: boolean;
  workOrderPath?: string;
}) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionAmount, setSessionAmount] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState<'open' | 'copy' | null>(null);
  const [manualMsg, setManualMsg] = useState<string | null>(null);

  const canPay = balanceDueCents > 0 && !isFallback;
  const depositDisplay = depositPaid && depositPaid !== '—' ? depositPaid : 'No deposit recorded';
  const requiredDisplay = depositRequired && depositRequired !== '—' ? depositRequired : null;

  const createSession = useCallback(async (): Promise<{ url: string; balanceCents: number }> => {
    const res = await fetch('/api/tech/final-balance-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    });
    const data = (await res.json().catch(() => ({}))) as CheckoutResponse;
    if (!res.ok || !data.ok || !data.url) {
      const msg =
        data.code === 'STRIPE_NOT_CONFIGURED'
          ? 'Stripe is not configured for this environment. Set STRIPE_SECRET_KEY in .env.local or record cash payment.'
          : data.code === 'NO_BALANCE_DUE'
            ? 'No balance due.'
            : data.error ?? 'Could not create balance checkout.';
      throw new Error(msg);
    }
    return { url: data.url, balanceCents: data.balanceCents ?? balanceDueCents };
  }, [appointmentId, balanceDueCents]);

  const handleOpen = async () => {
    if (!canPay) return;
    setLoading('open');
    setStatus(null);
    try {
      const { url, balanceCents } = await createSession();
      setCheckoutUrl(url);
      setSessionAmount(money(balanceCents));
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setStatus({
          tone: 'info',
          text: 'Popup blocked — tap “Open secure checkout” below (works on mobile Safari/Chrome).',
        });
      } else {
        setStatus({ tone: 'success', text: 'Checkout opened in a new tab. If it did not appear, use the link below.' });
      }
    } catch (e) {
      setCheckoutUrl(null);
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Checkout failed.' });
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!canPay) return;
    setLoading('copy');
    setStatus(null);
    try {
      const { url, balanceCents } = await createSession();
      setCheckoutUrl(url);
      setSessionAmount(money(balanceCents));
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setStatus({ tone: 'success', text: 'Stripe payment link copied.' });
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Could not copy link.' });
    } finally {
      setLoading(null);
    }
  };

  const statusClass =
    status?.tone === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-100'
      : status?.tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-100';

  return (
    <div className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/80 p-4'>
      <div>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Collect payment</p>
        {paymentStatusText ? <p className='mt-1 text-sm text-zinc-300'>{paymentStatusText}</p> : null}
      </div>

      <div className='grid gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-sm sm:grid-cols-2'>
        <p className='text-zinc-400'>
          Final total <span className='font-mono text-white'>{finalTotal ?? '—'}</span>
        </p>
        <p className='text-zinc-400'>
          Deposit paid <span className='font-mono text-white'>{depositDisplay}</span>
          {requiredDisplay ? <span className='block text-[10px] text-zinc-500'>Required: {requiredDisplay}</span> : null}
        </p>
        <p className='text-zinc-400'>
          Total paid <span className='font-mono text-emerald-300'>{totalPaid ?? '—'}</span>
        </p>
        <p className='text-zinc-400'>
          Balance due <span className='font-mono text-gold-soft'>{balanceDue}</span>
        </p>
      </div>

      {canPay ? (
        <>
          <div className='grid gap-2 sm:grid-cols-2'>
            <button
              type='button'
              disabled={loading !== null}
              onClick={() => void handleOpen()}
              className='w-full rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black disabled:opacity-50'
            >
              {loading === 'open' ? 'Creating…' : 'Send / open Stripe link'}
            </button>
            <button
              type='button'
              disabled={loading !== null}
              onClick={() => void handleCopy()}
              className='w-full rounded-2xl border border-gold/40 px-4 py-3 text-xs font-black uppercase text-gold-soft disabled:opacity-50'
            >
              {loading === 'copy' ? 'Creating…' : 'Copy Stripe link'}
            </button>
            <NotificationSendForm
              kind='payment_link'
              appointmentId={appointmentId}
              buttonClassName='w-full rounded-2xl border border-white/20 px-4 py-3 text-xs font-black uppercase text-zinc-200'
            >
              Preview payment link
            </NotificationSendForm>
            <NotificationSendForm
              kind='zelle_instructions'
              appointmentId={appointmentId}
              buttonClassName='w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase text-cyan-100'
            >
              Preview Zelle instructions
            </NotificationSendForm>
          </div>

          <ToastActionForm
            className='grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:grid-cols-6'
            action={async (prev, fd) => {
              if (workOrderPath) fd.set('workOrderPath', workOrderPath);
              const r = await recordManualPaymentActionState(prev, fd);
              setManualMsg(r.ok ? r.message ?? 'Payment recorded.' : r.error ?? 'Failed.');
              return r;
            }}
          >
            <input type='hidden' name='appointmentId' value={appointmentId} />
            {workOrderPath ? <input type='hidden' name='workOrderPath' value={workOrderPath} /> : null}
            <label className='text-xs text-zinc-400 sm:col-span-1'>
              Amount ($)
              <input name='amountDollars' type='number' step='0.01' min='0.01' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' required />
            </label>
            <label className='text-xs text-zinc-400 sm:col-span-1'>
              Method
              <select name='method' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' defaultValue='cash'>
                <option value='cash'>Cash</option>
                <option value='zelle'>Zelle</option>
                <option value='cash_app'>Cash App</option>
                <option value='venmo'>Venmo</option>
                <option value='check'>Check</option>
                <option value='external_card'>External card terminal</option>
                <option value='bank_transfer'>Bank transfer</option>
                <option value='other'>Other</option>
              </select>
            </label>
            <label className='text-xs text-zinc-400 sm:col-span-1'>
              Tip ($)
              <input name='tipDollars' type='number' step='0.01' min='0' defaultValue='0' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
            </label>
            <label className='text-xs text-zinc-400 sm:col-span-1'>
              Reference
              <input name='referenceNumber' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='Check / transfer ID' />
            </label>
            <label className='text-xs text-zinc-400 sm:col-span-2'>
              Note
              <input name='note' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='Optional payment note' />
            </label>
            <label className='flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2'>
              <input name='sendReceipt' type='checkbox' /> Prepare receipt for review/send
            </label>
            <div className='flex items-end sm:col-span-4'>
              <SubmitStatusButton pendingText='Saving…' className='w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-200'>
                Mark paid manually
              </SubmitStatusButton>
            </div>
          </ToastActionForm>
          {manualMsg ? <p className='text-xs text-zinc-400'>{manualMsg}</p> : null}
        </>
      ) : (
        <p className='rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center text-xs text-zinc-500'>
          {paymentComplete
            ? 'No balance due — paid in full.'
            : isFallback
              ? 'Balance checkout requires a live appointment (not fallback).'
              : 'No balance due.'}
        </p>
      )}

      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-4 text-center text-sm font-black uppercase tracking-wide text-emerald-100'
        >
          <ExternalLink className='h-4 w-4 shrink-0' />
          Tap to open secure checkout
        </a>
      ) : null}

      {status ? (
        <p className={`rounded-xl border px-3 py-2 text-sm ${statusClass}`} role='status'>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
