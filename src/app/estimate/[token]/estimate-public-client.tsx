'use client';

import { useState, useTransition } from 'react';
import {
  approveEstimatePublicAction,
  declineEstimatePublicAction,
  payEstimateDepositAction,
} from '@/app/(dashboard)/admin/estimate-actions';
import type { ServiceEstimate } from '@/lib/service-estimates';
import { formatChicagoDate, formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

export function EstimatePublicClient({ estimate }: { estimate: ServiceEstimate }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(estimate.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const approve = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await approveEstimatePublicAction(estimate.accessToken);
      if (res.error) setErr(res.error);
      else {
        setStatus('approved');
        setMsg('Estimate approved. Pay your deposit below to schedule service.');
      }
    });
  };

  const decline = () => {
    if (!window.confirm('Decline this estimate?')) return;
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await declineEstimatePublicAction(estimate.accessToken);
      if (res.error) setErr(res.error);
      else {
        setStatus('declined');
        setMsg('Estimate declined. Contact us if you change your mind.');
      }
    });
  };

  const payDeposit = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await payEstimateDepositAction(estimate.accessToken);
      if (res.error) setErr(res.error);
      else if (res.url) window.location.href = res.url;
    });
  };

  const canApprove = status === 'sent' || status === 'draft';
  const canPay = status === 'approved' || status === 'sent';
  const isDone = status === 'deposit_paid' || status === 'converted' || status === 'declined';

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-3xl border border-gold/20 bg-black/80 p-8 shadow-2xl">
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Gloss Boss ATX</p>
        <h1 className="mt-2 text-2xl font-black uppercase text-white">Service estimate</h1>
        <p className="mt-1 text-sm text-zinc-400">Prepared for {estimate.customerName}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 space-y-3">
        {estimate.vehicleDescription ? (
          <p className="text-sm text-zinc-300">{estimate.vehicleDescription}</p>
        ) : null}
        {estimate.serviceAddress ? (
          <p className="text-xs text-zinc-500">{estimate.serviceAddress}</p>
        ) : null}
        <ul className="space-y-2 border-t border-white/5 pt-3">
          {estimate.lineItems.map((line, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-zinc-400">{line.label}</span>
              <span className="font-mono text-white">{displayMoney(line.amountCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-gold/20 pt-3">
          <span className="text-sm font-black uppercase text-gold-soft">Total</span>
          <span className="font-mono text-xl font-black text-white">{displayMoney(estimate.totalCents)}</span>
        </div>
        <p className="text-right text-xs text-zinc-500">Deposit due: {displayMoney(estimate.depositCents)}</p>
        {estimate.scheduledStart ? (
          <p className="text-xs text-zinc-500">Proposed date: {formatChicagoDate(estimate.scheduledStart)}</p>
        ) : null}
        {estimate.validUntil ? (
          <p className="text-[10px] text-zinc-600">Valid until {formatChicagoDateTime(estimate.validUntil)}</p>
        ) : null}
        {estimate.notes ? <p className="text-xs leading-5 text-zinc-400">{estimate.notes}</p> : null}
      </div>

      {msg ? <p className="text-center text-sm text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-center text-sm text-red-300">{err}</p> : null}

      {!isDone ? (
        <div className="space-y-3">
          {canApprove ? (
            <button
              type="button"
              disabled={pending}
              onClick={approve}
              className="w-full rounded-xl border border-gold/40 bg-gold/15 py-3 text-sm font-black uppercase text-gold-soft disabled:opacity-50"
            >
              Approve estimate
            </button>
          ) : null}
          {canPay ? (
            <button
              type="button"
              disabled={pending}
              onClick={payDeposit}
              className="w-full rounded-xl bg-gradient-to-r from-gold/80 to-gold py-3 text-sm font-black uppercase text-black disabled:opacity-50"
            >
              Pay deposit · {displayMoney(estimate.depositCents)}
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="button"
              disabled={pending}
              onClick={decline}
              className="w-full py-2 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300"
            >
              Decline
            </button>
          ) : null}
        </div>
      ) : status === 'deposit_paid' || status === 'converted' ? (
        <p className="text-center text-sm text-emerald-400">Deposit received — we will confirm your appointment shortly.</p>
      ) : null}
    </div>
  );
}
