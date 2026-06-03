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
import { ReceiptLedgerDebugPanel } from '@/components/admin/receipt-ledger-debug-panel';
import type { ReceiptParityDebug } from '@/lib/receipt-totals';

const MONEY_TABS = [
  { id: 'lines', label: 'Order lines' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'payments', label: 'Payments' },
  { id: 'receipt', label: 'Receipt preview' },
  { id: 'repair', label: 'Admin repair' },
] as const;

type MoneyTab = (typeof MONEY_TABS)[number]['id'];

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
  ledgerWarnings,
  ledgerTotals,
  receiptParityDebug,
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
  receiptParityDebug?: ReceiptParityDebug;
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
  const [tab, setTab] = useState<MoneyTab>('lines');
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
      <div className='rounded-2xl border border-gold/25 bg-black/40 p-4'>
        <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Money & receipt totals</p>
        <dl className='mt-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4'>
          {[
            ['Final', totals.finalTotal],
            ['Paid', totals.totalPaid],
            ['Balance', totals.balanceDue],
          ].map(([label, value]) => (
            <div key={label} className='flex justify-between rounded-lg border border-white/10 px-3 py-2'>
              <dt className='text-zinc-500'>{label}</dt>
              <dd className='font-mono font-bold text-white'>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className='flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {MONEY_TABS.map((t) => (
          <button
            key={t.id}
            type='button'
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
              tab === t.id ? 'border-gold/50 bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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

      {tab === 'lines' ? (
      <WorkOrderCollapsible title='Order lines' defaultOpen>
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
        <div id='wo-invoice' className='mt-4 border-t border-white/10 pt-4'>
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
      ) : null}

      {tab === 'discounts' ? (
      <WorkOrderCollapsible title='Discounts & offers' defaultOpen>
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
      ) : null}

      {tab === 'payments' ? (
      <WorkOrderCollapsible title='Payments' defaultOpen>
        <p className='mb-3 text-xs text-zinc-500'>Stripe deposits appear automatically for new online bookings. Deposits are payments, not discounts.</p>
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
      </WorkOrderCollapsible>
      ) : null}

      {canManagePayments && tab === 'receipt' ? (
        <WorkOrderCollapsible title='Receipt preview' defaultOpen>
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

      {canAdvancedRepair && tab === 'repair' ? (
        <WorkOrderCollapsible title='E. Admin repair' defaultOpen>
          <p className='mb-3 text-xs text-zinc-500'>Legacy corrections — void duplicates, sync Stripe, mark balanced. Requires reason.</p>
          {receiptParityDebug ? <ReceiptLedgerDebugPanel parity={receiptParityDebug} /> : null}
          <RebuildLedgerButton appointmentId={appointmentId} fallbackBookingId={fallbackBookingId} source={source} />
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
            canManagePayments
            workOrderPath={workOrderPath ?? `/tech/work-orders/${jobId}`}
            repairOnly
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
