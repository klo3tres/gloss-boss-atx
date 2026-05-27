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
import { PremiumBadge } from '@/components/ui/premium';
import { recalculateWorkOrderPricingAction } from '@/app/(dashboard)/tech/work-order-pricing-actions';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';

export type LedgerDiscountRow = { id: string; label: string; amount: string; source: string };
export type LedgerPaymentRow = {
  id: string;
  label: string;
  amount: string;
  status: string;
  bucket: string;
  voided?: boolean;
};

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
  recentPaymentsForRepair: Array<{
    id: string;
    amount: string;
    method: string;
    kind?: string;
    status: string;
    stripeSession?: string;
    stripeIntent?: string;
  }>;
}) {
  const vehicleBreakdownLines = (breakdownLines ?? []).filter(
    (l) =>
      l.label !== 'Customer' &&
      !['Final total', 'Balance due', 'Payments', 'Discounts & Offers'].includes(l.label) &&
      !l.label.startsWith('Stripe ') &&
      l.tone !== 'paid' &&
      l.tone !== 'discount' &&
      l.tone !== 'total',
  );

  return (
    <div className='space-y-4'>
      {isTest ? (
        <div className='flex flex-wrap gap-2'>
          <PremiumBadge tone='amber'>Test / sandbox</PremiumBadge>
        </div>
      ) : null}

      <WorkOrderCollapsible title='A. Order summary' defaultOpen>
        <p className='text-xs text-zinc-500'>
          Source: <span className='text-zinc-300'>{orderSourceLabel}</span>
          {orderSourceLabel.includes('locked') ? '' : ' · Live catalog'}
        </p>
        <ul className='mt-3 space-y-2 text-sm'>
          {vehicles.map((v) => (
            <li key={v.index} className='flex justify-between gap-2 rounded-xl border border-white/10 px-3 py-2'>
              <span className='text-zinc-300'>
                {v.label} — {v.service.replace(/-/g, ' ')}
              </span>
              <span className='font-mono text-white'>{v.priceLabel}</span>
            </li>
          ))}
        </ul>
        {canEditPricing ? (
          <div className='mt-4'>
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
          </div>
        ) : null}
      </WorkOrderCollapsible>

      <WorkOrderCollapsible title='B. Discounts & offers' defaultOpen>
        {discounts.length === 0 ? (
          <p className='text-sm text-zinc-500'>No discounts applied. Eligible online / multi-car / promo discounts apply automatically at booking.</p>
        ) : (
          <ul className='space-y-2 text-sm'>
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
      </WorkOrderCollapsible>

      <WorkOrderCollapsible title='C. Payments' defaultOpen>
        <div className='mb-3 grid gap-2 sm:grid-cols-3'>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Total paid</p>
            <p className='font-mono text-lg text-emerald-300'>{totalPaid ?? displayMoney(pricing.totalPaidCents)}</p>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Balance</p>
            <p className='font-mono text-lg text-white'>{balanceDue}</p>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <p className='text-[9px] font-black uppercase text-zinc-500'>Final</p>
            <p className='font-mono text-lg text-gold-soft'>{finalTotal ?? displayMoney(pricing.finalTotalCents)}</p>
          </div>
        </div>
        <ul className='space-y-2 text-sm'>
          {payments.length === 0 ? <li className='text-zinc-500'>No payments yet — Stripe checkout creates rows automatically.</li> : null}
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
        <WorkOrderCollapsible title='Record cash / Zelle / check' defaultOpen={false}>
          <form action={recordCashAction} className='grid max-w-md gap-2'>
            {!isFallback ? <input type='hidden' name='appointmentId' value={jobId} /> : null}
            {isFallback ? <input type='hidden' name='fallbackBookingId' value={jobId} /> : null}
            <input name='amountReceived' placeholder='Amount received ($)' className='gb-input' />
            <input name='paymentMethod' placeholder='cash / zelle / venmo / check' className='gb-input' defaultValue='cash' />
            <button type='submit' className='rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black uppercase text-black'>
              Record payment
            </button>
          </form>
        </WorkOrderCollapsible>
        <div id='wo-invoice' className='mt-4'>
          <WorkOrderInvoiceBuilder
            jobId={jobId}
            customerName={customerName}
            vehicleBreakdownLines={vehicleBreakdownLines.map((l) => ({ label: l.label, amount: l.amount }))}
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

      {canManagePayments ? (
        <WorkOrderCollapsible title='D. Receipt' defaultOpen>
          <WorkOrderReceiptSendFlow
            appointmentId={isFallback ? undefined : jobId}
            fallbackBookingId={isFallback ? jobId : undefined}
            isFallback={isFallback}
            receiptPdfHref={receiptPdfHref}
          />
          <div className='mt-4'>
            <WorkOrderReceiptPanel
              appointmentId={isFallback ? undefined : jobId}
              fallbackBookingId={isFallback ? jobId : undefined}
              receiptPdfHref={receiptPdfHref}
              pricing={pricing}
              breakdownLines={breakdownLines}
              payments={payments.map((p) => ({
                id: p.id,
                amount: p.amount,
                amountCents: 0,
                status: p.status,
                method: p.label,
                at: '',
                voided: p.voided,
              }))}
              promoCode={promoCode}
              canManagePayments
              workOrderPath={workOrderPath ?? `/tech/work-orders/${jobId}`}
            />
          </div>
        </WorkOrderCollapsible>
      ) : null}

      {canAdvancedRepair ? (
        <WorkOrderCollapsible title='E. Advanced repair' defaultOpen={false}>
          <p className='mb-3 text-xs text-zinc-500'>
            Only for legacy broken jobs. Normal Stripe bookings do not need sync.
          </p>
          <RebuildLedgerButton
            appointmentId={appointmentId}
            fallbackBookingId={fallbackBookingId}
            source={source}
          />
          <WorkOrderStripeDebugPanel
            appointmentId={appointmentId}
            fallbackBookingId={fallbackBookingId}
            source={source}
            stripeSessionId={stripeSessionId ?? ''}
            stripePaymentIntent={stripePaymentIntent ?? ''}
            paymentRows={recentPaymentsForRepair}
          />
        </WorkOrderCollapsible>
      ) : null}
    </div>
  );
}
