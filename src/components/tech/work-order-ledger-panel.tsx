'use client';

import { displayMoney } from '@/lib/display-format';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { JobPricingDisplay } from '@/lib/job-pricing-display';
import { WorkOrderInvoiceBuilder, type InvoicePricingSnapshot } from '@/components/tech/work-order-invoice-builder';
import { WorkOrderReceiptPanel } from '@/components/tech/work-order-receipt-panel';
import { WorkOrderPricingPanel } from '@/components/tech/work-order-pricing-panel';
import { WorkOrderReceiptSendFlow } from '@/components/tech/work-order-receipt-send-flow';
import { WorkOrderStripeDebugPanel } from '@/components/tech/work-order-stripe-debug-panel';
import { WorkOrderCollapsible } from '@/components/tech/work-order-collapsible';
import { CorrectPaymentTruthPanel } from '@/components/tech/correct-payment-truth-panel';
import { PremiumBadge } from '@/components/ui/premium';
import { recalculateWorkOrderPricingAction } from '@/app/(dashboard)/tech/work-order-pricing-actions';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import {
  recordManualStripePaymentAction,
  syncStripePaymentsForWorkOrderAction,
} from '@/app/(dashboard)/tech/work-order-stripe-sync-actions';
import { generateWorkOrderReceiptActionState } from '@/app/(dashboard)/tech/work-order-payment-actions';
import { detachUnrelatedPaymentsFromWorkOrderActionState, voidExtrasAndRebuildActionState } from '@/app/(dashboard)/admin/payment-ops-actions';
import { applyCreditToWorkOrderAction } from '@/app/(dashboard)/admin/customer-credit-actions';
import { CustomerCreditsManager, type CreditHistoryItem, type CreditRedemptionItem } from '@/components/admin/customer-credits-manager';

export type LedgerDiscountRow = { id: string; label: string; amount: string; source: string };
export type LedgerPaymentRow = {
  id: string;
  label: string;
  amount: string;
  status: string;
  bucket: string;
  voided?: boolean;
  amountCents?: number;
};

function ApplyCreditForm({
  customerId,
  creditId,
  workOrderId,
  source,
  maxAmountCents,
  onApplied,
}: {
  customerId: string;
  creditId: string;
  workOrderId: string;
  source: 'appointment' | 'fallback';
  maxAmountCents: number;
  onApplied?: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState((maxAmountCents / 100).toFixed(2));
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const amountVal = Number(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setErr('Enter a valid amount.');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('customerId', customerId);
      fd.set('creditId', creditId);
      fd.set('workOrderId', workOrderId);
      fd.set('amountDollars', amountVal.toString());
      fd.set('source', source);

      const res = await applyCreditToWorkOrderAction(fd);
      if (res.error) {
        setErr(res.error);
      } else {
        if (onApplied) onApplied(res.message ?? 'Applied credit successfully.');
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-xl border border-gold/20 bg-gold/5 p-3">
      <div className="flex-1 min-w-[100px]">
        <label className="text-[9px] font-black uppercase text-gold-soft block">
          Amount to Apply ($)
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={(maxAmountCents / 100).toFixed(2)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="gb-input mt-1 w-24 bg-black border border-zinc-800 text-white rounded px-2.5 py-1 text-xs"
          required
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gold px-3 py-1.5 text-[9px] font-black uppercase text-black hover:bg-gold-soft transition"
      >
        {pending ? 'Applying...' : 'Apply'}
      </button>
      {err && <p className="w-full text-rose-400 text-[9px] mt-1">{err}</p>}
    </form>
  );
}

function RecordPaymentForm({
  jobId,
  isFallback,
  method,
  label,
  recordCashAction,
}: {
  jobId: string;
  isFallback: boolean;
  method: string;
  label: string;
  recordCashAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={recordCashAction} className='flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/30 p-3'>
      {!isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
      {isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
      <input type='hidden' name='paymentMethod' value={method} />
      <label className='text-xs text-zinc-400'>
        Amount ($)
        <input name='amountReceived' placeholder='0.00' className='gb-input mt-1 w-28' required />
      </label>
      <button type='submit' className='rounded-xl bg-emerald-500 px-4 py-2.5 text-[10px] font-black uppercase text-black'>
        {label}
      </button>
    </form>
  );
}

function RebuildLedgerButton({
  appointmentId,
  fallbackBookingId,
  source,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className='mt-3'>
      <button
        type='button'
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData();
            fd.set('source', source);
            if (appointmentId) fd.set('appointmentId', appointmentId);
            if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
            const res = await recalculateWorkOrderPricingAction(fd);
            setMsg(res.ok ? (res.message ?? 'Ledger rebuilt from catalog.') : (res.error ?? 'Rebuild failed'));
            if (res.ok) router.refresh();
          });
        }}
        className='rounded-xl border border-amber-500/40 px-4 py-2 text-[10px] font-black uppercase text-amber-100 disabled:opacity-50'
      >
        {pending ? 'Rebuilding…' : 'Rebuild ledger from catalog'}
      </button>
      {msg ? <p className='mt-2 text-xs text-zinc-400'>{msg}</p> : null}
    </div>
  );
}

function DetachUnrelatedPaymentsCard({
  appointmentId,
  fallbackBookingId,
  workOrderPath,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  workOrderPath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  return (
    <div className='gb-premium-card gb-glass rounded-2xl border border-amber-500/25 bg-black/40 p-4 text-xs'>
      <h4 className='font-black uppercase tracking-wider text-amber-200'>Detach unrelated payments</h4>
      <p className='mt-1 text-zinc-400 leading-relaxed'>
        Removes suspicious payment links from this work order without deleting the payment rows. Unlinked payments stay in payment history as unassigned.
      </p>
      <button
        type='button'
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData();
            if (appointmentId) fd.set('appointmentId', appointmentId);
            if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
            if (workOrderPath) fd.set('workOrderPath', workOrderPath);
            const res = await detachUnrelatedPaymentsFromWorkOrderActionState(null, fd);
            setMsg(res.ok ? { tone: 'ok', text: res.message ?? 'Repair complete.' } : { tone: 'err', text: res.error ?? 'Repair failed.' });
            if (res.ok) router.refresh();
          });
        }}
        className='mt-4 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 font-black uppercase tracking-wider text-amber-100 disabled:opacity-50'
      >
        {pending ? 'Checking rows...' : 'Detach suspicious rows'}
      </button>
      {msg ? <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p> : null}
    </div>
  );
}

export function WorkOrderLedgerPanel({
  jobId,
  isFallback,
  source,
  appointmentId,
  fallbackBookingId,
  orderSourceLabel,
  isTest,
  vehicles,
  discounts,
  payments,
  pricingSnapshot,
  pricing,
  breakdownLines,
  balanceDue,
  balanceDueCents,
  finalTotal,
  depositPaid,
  totalPaid,
  paymentComplete,
  receiptPdfHref,
  customLineItems,
  promoCode,
  pricingOverrideReason,
  canEditPricing,
  canManagePayments,
  canAdvancedRepair,
  workOrderPath,
  customerName,
  recordCashAction,
  stripeSessionId,
  stripePaymentIntent,
  recentPaymentsForRepair,
  unassignedPaymentDiagnostics,
  ledgerWarnings,
  ledgerTotals,
  customerId,
  credits,
  redemptions,
}: {
  jobId: string;
  isFallback: boolean;
  source: 'appointment' | 'fallback';
  appointmentId?: string;
  fallbackBookingId?: string;
  orderSourceLabel: string;
  isTest?: boolean;
  vehicles: Array<{
    index: number;
    label: string;
    service: string;
    vehicleClass?: string;
    priceCents: number | null;
    priceLabel: string;
  }>;
  discounts: LedgerDiscountRow[];
  payments: LedgerPaymentRow[];
  pricingSnapshot: InvoicePricingSnapshot;
  pricing: JobPricingDisplay;
  breakdownLines: ReceiptBreakdownLine[];
  balanceDue: string;
  balanceDueCents: number;
  finalTotal?: string;
  depositPaid?: string;
  totalPaid?: string;
  paymentComplete: boolean;
  receiptPdfHref?: string;
  customLineItems: Array<{ id: string; label: string; kind?: string; amountCents: number; quantity?: number; notes?: string }>;
  promoCode?: string;
  pricingOverrideReason?: string;
  canEditPricing: boolean;
  canManagePayments: boolean;
  canAdvancedRepair: boolean;
  workOrderPath?: string;
  customerName: string;
  recordCashAction: (formData: FormData) => void | Promise<void>;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  ledgerWarnings?: string[];
  ledgerTotals?: {
    serviceSubtotal: string;
    addOnSubtotal: string;
    grossSubtotal: string;
    totalDiscounts: string;
    finalTotal: string;
    totalPaid: string;
    balanceDue: string;
  };
  recentPaymentsForRepair: Array<{
    id: string;
    amount: string;
    method: string;
    kind?: string;
    status: string;
    stripeSession?: string;
    stripeIntent?: string;
  }>;
  unassignedPaymentDiagnostics?: Array<{
    id: string;
    amount: string;
    amountCents?: number;
    status: string;
    method: string;
    source: string;
    appointmentId: string;
    fallbackBookingId: string;
    customerId: string;
    stripeSession: string;
    stripeIntent: string;
    at: string;
  }>;
  customerId?: string;
  credits?: CreditHistoryItem[];
  redemptions?: CreditRedemptionItem[];
}) {
  const vehicleBreakdownLines = (breakdownLines ?? []).filter(
    (l) =>
      l.label !== 'Customer' &&
      !['Final total', 'Balance due', 'Payments', 'Discounts & Offers'].includes(l.label) &&
      l.tone !== 'paid' &&
      l.tone !== 'discount' &&
      l.tone !== 'total',
  );

  const totals = ledgerTotals ?? {
    serviceSubtotal: displayMoney(pricingSnapshot.vehicleSubtotalCents),
    addOnSubtotal: displayMoney(pricingSnapshot.addOnSubtotalCents),
    grossSubtotal: displayMoney(pricingSnapshot.vehicleSubtotalCents + pricingSnapshot.addOnSubtotalCents),
    totalDiscounts: displayMoney(
      pricingSnapshot.onlineDiscountCents +
        pricingSnapshot.multiCarDiscountCents +
        pricingSnapshot.promoDiscountCents +
        pricingSnapshot.manualDiscountCents,
    ),
    finalTotal: finalTotal ?? displayMoney(pricingSnapshot.finalTotalCents),
    totalPaid: totalPaid ?? displayMoney(pricingSnapshot.totalPaidCents),
    balanceDue,
  };

  return (
    <div className='space-y-4'>
      {isTest ? (
        <div className='flex flex-wrap gap-2'>
          <PremiumBadge tone='amber'>Test / sandbox</PremiumBadge>
        </div>
      ) : null}

      {ledgerWarnings && ledgerWarnings.length > 0 ? (
        <div className='rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3'>
          <p className='text-[10px] font-black uppercase tracking-wider text-amber-200'>Ledger warnings</p>
          <ul className='mt-2 list-inside list-disc text-sm text-amber-100'>
            {ledgerWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <WorkOrderCollapsible title='A. Order lines' defaultOpen>
        <p className='text-xs text-zinc-500'>
          Source: <span className='text-zinc-300'>{orderSourceLabel}</span>
        </p>
        <ul className='mt-3 space-y-2 text-sm'>
          {vehicles.map((v) => (
            <li key={v.index} className='rounded-xl border border-white/10 px-3 py-2'>
              <div className='flex justify-between gap-2'>
                <span className='font-semibold text-white'>{v.label}</span>
                <span className='font-mono text-gold-soft'>{v.priceLabel}</span>
              </div>
              <p className='mt-1 text-xs text-zinc-500'>
                {v.vehicleClass ? `${v.vehicleClass.toUpperCase()} · ` : ''}
                {v.service.replace(/-/g, ' ')}
              </p>
            </li>
          ))}
        </ul>
      </WorkOrderCollapsible>

      <WorkOrderCollapsible title='B. Discounts & offers' defaultOpen>
        {discounts.length === 0 ? (
          <p className='text-sm text-zinc-500'>No discounts on this order yet.</p>
        ) : (
          <ul className='mb-4 space-y-2 text-sm'>
            {discounts.map((d) => (
              <li key={d.id} className='flex justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2'>
                <span className='text-emerald-100'>
                  {d.label}
                  <span className='ml-2 text-[10px] uppercase text-zinc-500'>{d.source}</span>
                </span>
                <span className='font-mono text-emerald-300'>−{d.amount}</span>
              </li>
            ))}
          </ul>
        )}
        {canEditPricing ? (
          <WorkOrderPricingPanel
            appointmentId={isFallback ? undefined : jobId}
            fallbackBookingId={isFallback ? jobId : undefined}
            source={source}
            vehicles={vehicles.map((v) => ({
              index: v.index,
              label: v.label,
              service: v.service.replace(/-/g, ' '),
              priceCents: v.priceCents,
              priceLabel: v.priceLabel,
            }))}
            promoCode={promoCode ?? ''}
            pricing={{
              finalTotalCents: pricingSnapshot.finalTotalCents,
              onlineDiscountCents: pricingSnapshot.onlineDiscountCents,
              multiCarDiscountCents: pricingSnapshot.multiCarDiscountCents,
              promoDiscountCents: pricingSnapshot.promoDiscountCents,
              overrideReason: pricingOverrideReason,
            }}
          />
        ) : (
          <p className='text-xs text-zinc-500'>Discount controls require admin access.</p>
        )}
      </WorkOrderCollapsible>

      <WorkOrderCollapsible title='C. Payment summary' defaultOpen>
        <div className='grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3'>
          {[
            ['Service total', totals.finalTotal],
            ['Discounts', `-${totals.totalDiscounts.replace(/^[-−]/, '')}`],
            ['Credits applied', displayMoney(pricing.creditPaidCents || 0)],
            ['Cash / direct paid', displayMoney((pricing.cashPaidCents || 0) + (pricing.zellePaidCents || 0) + (pricing.manualPaidCents || 0))],
            ['Stripe/card paid', displayMoney(pricing.stripePaidCents || 0)],
            ['Balance due', totals.balanceDue],
          ].map(([label, value]) => (
            <div key={label} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
              <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>{label}</p>
              <p className={`mt-2 font-mono text-xl font-black ${label === 'Balance due' && balanceDueCents > 0 ? 'text-amber-200' : label === 'Credits applied' ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
        <div className='mt-3 rounded-2xl border border-white/10 bg-zinc-950/70 p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-gold-soft'>Payment status</p>
              <p className='mt-1 text-sm text-zinc-400'>Only payments linked to this exact work order are counted.</p>
            </div>
            <PremiumBadge tone={paymentComplete ? 'emerald' : balanceDueCents > 0 ? 'amber' : 'zinc'}>
              {paymentComplete ? 'Paid' : balanceDueCents > 0 ? 'Balance due' : 'No payment due'}
            </PremiumBadge>
          </div>
        </div>

        <WorkOrderCollapsible title='Payment rows and collection tools' defaultOpen={false}>
          <p className='mb-3 text-xs text-zinc-500'>Stripe deposits appear automatically for new online bookings. Credits reduce balance but do not count as cash revenue.</p>
        <ul className='space-y-2 text-sm'>
          {payments.length === 0 ? <li className='text-zinc-500'>No payments recorded yet.</li> : null}
          {payments.map((p) => (
            <li
              key={p.id}
              className={`flex justify-between gap-2 rounded-xl border px-3 py-2 ${p.voided ? 'border-red-500/30 opacity-60' : 'border-white/10'}`}
            >
              <span className='text-zinc-300'>{p.label}</span>
              <span className='font-mono text-white'>
                {p.amount} · {p.status}
              </span>
            </li>
          ))}
        </ul>
        {canManagePayments ? (
          <div className='mt-4 grid gap-2 sm:grid-cols-2'>
            <RecordPaymentForm jobId={jobId} isFallback={isFallback} method='cash' label='Record cash' recordCashAction={recordCashAction} />
            <RecordPaymentForm jobId={jobId} isFallback={isFallback} method='zelle' label='Record Zelle' recordCashAction={recordCashAction} />
            <RecordPaymentForm jobId={jobId} isFallback={isFallback} method='venmo' label='Record Venmo' recordCashAction={recordCashAction} />
            <RecordPaymentForm jobId={jobId} isFallback={isFallback} method='check' label='Record check' recordCashAction={recordCashAction} />
          </div>
        ) : null}

        {canManagePayments && customerId ? (
          <div className="mt-6 border-t border-white/5 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase text-gold-soft">Customer Store Credits</h4>
                <p className="text-[10px] text-zinc-500">Apply customer's existing credits to reduce the balance due.</p>
              </div>
              <CustomerCreditsManager
                customerId={customerId}
                credits={credits || []}
                redemptions={redemptions || []}
                showCompactButtonOnly
              />
            </div>

            {credits && credits.filter(c => c.status === 'active' || c.status === 'partially_used').length > 0 ? (
              <div className="space-y-2">
                {credits
                  .filter(c => c.status === 'active' || c.status === 'partially_used')
                  .map((c) => {
                    const maxToApply = Math.min(c.remaining_cents, balanceDueCents);
                    return (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/40">
                        <div className="text-xs">
                          <p className="font-semibold text-white">{c.reason}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Remaining: <strong className="text-gold-soft">{displayMoney(c.remaining_cents)}</strong> (Original: {displayMoney(c.amount_cents)})
                          </p>
                        </div>
                        {maxToApply > 0 ? (
                          <div className="shrink-0 w-full sm:w-auto">
                            <ApplyCreditForm
                              customerId={customerId}
                              creditId={c.id}
                              workOrderId={jobId}
                              source={source}
                              maxAmountCents={maxToApply}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-500 italic shrink-0">Balance due is zero</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">No available store credits for this customer.</p>
            )}
          </div>
        ) : null}

        <div id='wo-invoice' className='mt-4'>
          <WorkOrderInvoiceBuilder
            jobId={jobId}
            customerName={customerName}
            vehicleBreakdownLines={vehicleBreakdownLines.map((l) => ({ label: l.label, amount: l.amount }))}
            receiptPreviewLines={breakdownLines.map((l) => ({ label: l.label, amount: l.amount, tone: l.tone }))}
            appointmentId={isFallback ? undefined : jobId}
            fallbackBookingId={isFallback ? jobId : undefined}
            source={source}
            isFallback={isFallback}
            savedItems={customLineItems}
            pricing={pricingSnapshot}
            balanceDue={balanceDue}
            balanceDueCents={balanceDueCents}
            finalTotal={finalTotal}
            depositPaid={depositPaid}
            totalPaid={totalPaid}
            paymentComplete={paymentComplete}
            receiptPdfHref={receiptPdfHref}
            hideReceiptSection
          />
        </div>
        </WorkOrderCollapsible>
      </WorkOrderCollapsible>

      <WorkOrderCollapsible title='D. Totals (ledger)' defaultOpen>
        <dl className='grid gap-2 text-sm sm:grid-cols-2'>
          {[
            ['Service subtotal', totals.serviceSubtotal],
            ['Add-ons subtotal', totals.addOnSubtotal],
            ['Gross subtotal', totals.grossSubtotal],
            ['Total discounts', `−${totals.totalDiscounts.replace(/^−/, '')}`],
            ['Final total', totals.finalTotal],
            ['Total paid', totals.totalPaid],
            ['Balance due', totals.balanceDue],
          ].map(([label, value]) => (
            <div key={label} className='flex justify-between rounded-xl border border-white/10 px-3 py-2'>
              <dt className='text-zinc-500'>{label}</dt>
              <dd className='font-mono font-bold text-white'>{value}</dd>
            </div>
          ))}
        </dl>
      </WorkOrderCollapsible>

      {canManagePayments ? (
        <WorkOrderCollapsible title='E. Receipt' defaultOpen>
          <p className='mb-3 text-sm text-amber-100/90'>
            This is exactly what the customer will receive. Preview and approve before sending.
          </p>
          <WorkOrderReceiptSendFlow
            appointmentId={isFallback ? undefined : jobId}
            fallbackBookingId={isFallback ? jobId : undefined}
            isFallback={isFallback}
            receiptPdfHref={receiptPdfHref}
          />
          <WorkOrderReceiptPanel
            appointmentId={isFallback ? undefined : jobId}
            fallbackBookingId={isFallback ? jobId : undefined}
            receiptPdfHref={receiptPdfHref}
            pricing={pricing}
            breakdownLines={breakdownLines}
            payments={payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              amountCents: p.amountCents ?? 0,
              status: p.status,
              method: p.label,
              at: '',
              voided: p.voided,
            }))}
            promoCode={promoCode}
            canManagePayments={false}
            workOrderPath={workOrderPath ?? `/tech/work-orders/${jobId}`}
          />
        </WorkOrderCollapsible>
      ) : null}

      {canAdvancedRepair ? (
        <WorkOrderCollapsible title='F. Advanced repair' defaultOpen={false}>
          <p className='mb-4 text-xs text-zinc-500'>
            Diagnostic and self-healing tools for repairing database and Stripe inconsistencies. Use with caution.
          </p>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            <SyncStripeCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
              source={source}
            />
            <LinkStripeSessionCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
              source={source}
              defaultSessionId={stripeSessionId}
            />
            <RebuildLedgerCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
              source={source}
            />
            <RebuildDraftReceiptCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
            />
            <ResetPaymentsCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
            />
            <DetachUnrelatedPaymentsCard
              appointmentId={appointmentId}
              fallbackBookingId={fallbackBookingId}
              workOrderPath={workOrderPath}
            />
            <div className='col-span-1 md:col-span-2 lg:col-span-3'>
              <CorrectPaymentTruthPanel
                appointmentId={appointmentId}
                fallbackBookingId={fallbackBookingId}
                workOrderPath={workOrderPath ?? `/tech/work-orders/${jobId}`}
                defaultFinalDollars={totals.finalTotal.replace(/[^0-9.]/g, '')}
                defaultPaidDollars={totals.totalPaid.replace(/[^0-9.]/g, '')}
              />
            </div>
            <div className='col-span-1 md:col-span-2 lg:col-span-3 rounded-2xl border border-white/10 bg-black/35 p-4'>
              <h4 className='text-xs font-black uppercase tracking-wider text-gold-soft'>Payment link diagnostic</h4>
              <p className='mt-1 text-xs text-zinc-500'>
                These rows are related to the customer but are not counted in this work order because they are not linked to this exact appointment/fallback id.
              </p>
              <div className='mt-3 overflow-x-auto'>
                <table className='w-full min-w-[780px] text-left text-[11px] text-zinc-300'>
                  <thead className='text-[9px] uppercase tracking-wider text-zinc-500'>
                    <tr>
                      <th className='py-2'>Payment id</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Source</th>
                      <th>Linked appointment</th>
                      <th>Linked fallback</th>
                      <th>Customer</th>
                      <th>Stripe refs</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-white/5'>
                    {(unassignedPaymentDiagnostics ?? []).length === 0 ? (
                      <tr><td colSpan={8} className='py-4 text-center text-zinc-500'>No unassigned customer payments found.</td></tr>
                    ) : (
                      (unassignedPaymentDiagnostics ?? []).map((p) => (
                        <tr key={p.id}>
                          <td className='py-2 font-mono'>{p.id.slice(0, 8)}...</td>
                          <td className='font-mono text-white'>{p.amount}</td>
                          <td>{p.method}</td>
                          <td>{p.source}</td>
                          <td className='font-mono'>{p.appointmentId ? `${p.appointmentId.slice(0, 8)}...` : '-'}</td>
                          <td className='font-mono'>{p.fallbackBookingId ? `${p.fallbackBookingId.slice(0, 8)}...` : '-'}</td>
                          <td className='font-mono'>{p.customerId ? `${p.customerId.slice(0, 8)}...` : '-'}</td>
                          <td className='font-mono'>{[p.stripeSession, p.stripeIntent].filter(Boolean).map((v) => `${v.slice(0, 10)}...`).join(' / ') || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </WorkOrderCollapsible>
      ) : null}
    </div>
  );
}

function SyncStripeCard({
  appointmentId,
  fallbackBookingId,
  source,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const handleSync = () => {
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('source', source);
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      
      const res = await syncStripePaymentsForWorkOrderAction(fd);
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Sync failed' });
        return;
      }
      setMsg({
        tone: 'ok',
        text: `Synced ${res.attachedIds.length} payment(s). Matched ${res.matchedBefore} → ${res.matchedAfter}.`,
      });
      router.refresh();
    });
  };

  return (
    <div className='gb-premium-card gb-glass flex flex-col justify-between rounded-2xl border border-violet-500/20 bg-black/40 p-4 text-xs'>
      <div>
        <h4 className='font-black uppercase tracking-wider text-violet-200'>1. Sync Stripe Payments</h4>
        <p className='mt-1 text-zinc-400 leading-relaxed'>
          Pulls checkout sessions/intents directly from Stripe API to match and attach missing payments to this work order.
        </p>
      </div>
      <div className='mt-4'>
        <button
          type='button'
          disabled={pending}
          onClick={handleSync}
          className='w-full rounded-xl bg-violet-600/80 hover:bg-violet-600 px-4 py-2.5 font-bold uppercase tracking-wider text-white disabled:opacity-50 transition'
        >
          {pending ? 'Syncing Stripe…' : 'Sync Stripe Payments'}
        </button>
        {msg ? (
          <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LinkStripeSessionCard({
  appointmentId,
  fallbackBookingId,
  source,
  defaultSessionId,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
  defaultSessionId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [refId, setRefId] = useState(defaultSessionId ?? '');
  const [reason, setReason] = useState('');

  const handleLink = () => {
    if (!amount || !refId || !reason) {
      setMsg({ tone: 'err', text: 'All fields are required.' });
      return;
    }
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('source', source);
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      fd.set('amountDollars', amount);
      fd.set('reference', refId);
      fd.set('reason', reason);

      const res = await recordManualStripePaymentAction(fd);
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Failed to link session' });
        return;
      }
      setMsg({
        tone: 'ok',
        text: `Linked! Payments count: ${res.matchedBefore} → ${res.matchedAfter}.`,
      });
      setAmount('');
      setReason('');
      router.refresh();
    });
  };

  return (
    <div className='gb-premium-card gb-glass flex flex-col justify-between rounded-2xl border border-violet-500/20 bg-black/40 p-4 text-xs'>
      <div>
        <h4 className='font-black uppercase tracking-wider text-violet-200'>2. Link Stripe Session Manually</h4>
        <p className='mt-1 text-zinc-400 leading-relaxed'>
          Manually associate a known Stripe Session ID or Payment Intent ID and record the payment amount.
        </p>
        <div className='mt-3 space-y-2'>
          <input
            type='number'
            step='0.01'
            placeholder='Amount ($)'
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className='gb-input w-full'
          />
          <input
            placeholder='Session / Intent ID'
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            className='gb-input w-full'
          />
          <input
            placeholder='Reason (e.g. Stripe checkout fallback)'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className='gb-input w-full'
          />
        </div>
      </div>
      <div className='mt-4'>
        <button
          type='button'
          disabled={pending}
          onClick={handleLink}
          className='w-full rounded-xl bg-violet-600/80 hover:bg-violet-600 px-4 py-2.5 font-bold uppercase tracking-wider text-white disabled:opacity-50 transition'
        >
          {pending ? 'Linking…' : 'Link Stripe Session'}
        </button>
        {msg ? (
          <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RebuildLedgerCard({
  appointmentId,
  fallbackBookingId,
  source,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const handleRebuild = () => {
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      fd.set('source', source);
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      
      const res = await recalculateWorkOrderPricingAction(fd);
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Rebuild failed' });
        return;
      }
      setMsg({ tone: 'ok', text: res.message ?? 'Ledger rebuilt successfully.' });
      router.refresh();
    });
  };

  return (
    <div className='gb-premium-card gb-glass flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-black/40 p-4 text-xs'>
      <div>
        <h4 className='font-black uppercase tracking-wider text-amber-200'>3. Rebuild Ledger from Catalog</h4>
        <p className='mt-1 text-zinc-400 leading-relaxed'>
          Recomputes base packages, custom items, and multi-vehicle discounts from the catalog parameters.
        </p>
      </div>
      <div className='mt-4'>
        <button
          type='button'
          disabled={pending}
          onClick={handleRebuild}
          className='w-full rounded-xl bg-amber-600/80 hover:bg-amber-600 px-4 py-2.5 font-bold uppercase tracking-wider text-white disabled:opacity-50 transition'
        >
          {pending ? 'Rebuilding Ledger…' : 'Rebuild Ledger'}
        </button>
        {msg ? (
          <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RebuildDraftReceiptCard({
  appointmentId,
  fallbackBookingId,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const handleRebuild = () => {
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      
      const res = await generateWorkOrderReceiptActionState(null, fd);
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Generation failed' });
        return;
      }
      setMsg({ tone: 'ok', text: res.message ?? 'Draft receipt regenerated.' });
      router.refresh();
    });
  };

  return (
    <div className='gb-premium-card gb-glass flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-black/40 p-4 text-xs'>
      <div>
        <h4 className='font-black uppercase tracking-wider text-amber-200'>4. Rebuild Draft Receipt</h4>
        <p className='mt-1 text-zinc-400 leading-relaxed'>
          Resets cached receipt configurations and forces the generation of a fresh draft receipt based on current ledger values.
        </p>
      </div>
      <div className='mt-4'>
        <button
          type='button'
          disabled={pending}
          onClick={handleRebuild}
          className='w-full rounded-xl bg-amber-600/80 hover:bg-amber-600 px-4 py-2.5 font-bold uppercase tracking-wider text-white disabled:opacity-50 transition'
        >
          {pending ? 'Rebuilding Receipt…' : 'Rebuild Draft Receipt'}
        </button>
        {msg ? (
          <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ResetPaymentsCard({
  appointmentId,
  fallbackBookingId,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const handleReset = () => {
    startTransition(async () => {
      setMsg(null);
      const fd = new FormData();
      if (appointmentId) fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      
      const res = await voidExtrasAndRebuildActionState(null, fd);
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Failed to reset payments' });
        return;
      }
      setMsg({ tone: 'ok', text: res.message ?? 'Extra payments voided successfully.' });
      router.refresh();
    });
  };

  return (
    <div className='gb-premium-card gb-glass flex flex-col justify-between rounded-2xl border border-red-500/20 bg-black/40 p-4 text-xs'>
      <div>
        <h4 className='font-black uppercase tracking-wider text-red-300'>5. Reset Payments (Void Extras)</h4>
        <p className='mt-1 text-zinc-400 leading-relaxed'>
          Detects duplicate payments that push the total paid over the final total, and voids the later ones.
        </p>
      </div>
      <div className='mt-4'>
        <button
          type='button'
          disabled={pending}
          onClick={handleReset}
          className='w-full rounded-xl bg-red-950/40 hover:bg-red-900 border border-red-500/40 px-4 py-2.5 font-bold uppercase tracking-wider text-red-200 disabled:opacity-50 transition'
        >
          {pending ? 'Voiding Extras…' : 'Reset Payments'}
        </button>
        {msg ? (
          <p className={`mt-2 font-mono text-[10px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
