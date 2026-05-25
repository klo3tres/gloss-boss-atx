'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileText, Plus, Save } from 'lucide-react';
import { LINE_ITEM_KIND_LABELS, type WorkOrderLineItemKind } from '@/lib/work-order-line-items';
import { suggestInvoiceLine } from '@/lib/invoice-line-suggestions';
import type { UiVehicleClass } from '@/lib/vehicle-pricing';
import { addWorkOrderLineItemAction } from '@/app/(dashboard)/tech/work-order-line-item-actions';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  generateWorkOrderReceiptActionState,
  sendWorkOrderReceiptEmailAction,
} from '@/app/(dashboard)/tech/work-order-payment-actions';
import { ReceiptPdfDownloadButton } from '@/components/ui/receipt-pdf-download-button';

const CATEGORIES = Object.keys(LINE_ITEM_KIND_LABELS) as WorkOrderLineItemKind[];

export type InvoicePricingSnapshot = {
  vehicleSubtotalCents: number;
  addOnSubtotalCents: number;
  multiCarDiscountCents: number;
  onlineDiscountCents: number;
  promoDiscountCents: number;
  manualDiscountCents: number;
  customLineItemsCents: number;
  finalTotalCents: number;
  depositPaidCents: number;
  totalPaidCents: number;
  remainingBalanceCents: number;
};

export type SavedLineItem = {
  id: string;
  label: string;
  kind?: string;
  amountCents: number;
  quantity?: number;
  notes?: string;
};

type DraftLine = {
  id: string;
  label: string;
  kind: WorkOrderLineItemKind;
  unitCents: number;
  quantity: number;
  notes: string;
  customerVisible: boolean;
  taxable: boolean;
};

function money(cents: number) {
  const neg = cents < 0;
  return `${neg ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(Math.abs(n) * 100) * (cleaned.startsWith('-') || n < 0 ? -1 : 1);
}

const emptyForm = () => ({
  title: '',
  category: 'custom_addon' as WorkOrderLineItemKind,
  amountDollars: '',
  quantity: '1',
  notes: '',
  customerVisible: true,
  taxable: false,
});

export function WorkOrderInvoiceBuilder({
  jobId,
  appointmentId,
  fallbackBookingId,
  source,
  isFallback,
  savedItems,
  pricing,
  balanceDue,
  balanceDueCents,
  finalTotal,
  depositPaid,
  totalPaid,
  paymentComplete,
  receiptPdfHref,
  defaultVehicleClass = 'sedan',
}: {
  jobId: string;
  defaultVehicleClass?: UiVehicleClass;
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
  isFallback: boolean;
  savedItems: SavedLineItem[];
  pricing: InvoicePricingSnapshot;
  balanceDue: string;
  balanceDueCents: number;
  finalTotal?: string;
  depositPaid?: string;
  totalPaid?: string;
  paymentComplete: boolean;
  receiptPdfHref?: string;
}) {
  const router = useRouter();
  const [livePricing, setLivePricing] = useState(pricing);
  const [liveBalanceCents, setLiveBalanceCents] = useState(balanceDueCents);
  const [form, setForm] = useState(emptyForm);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setLivePricing(pricing);
    setLiveBalanceCents(balanceDueCents);
  }, [pricing, balanceDueCents]);

  const refreshPricing = useCallback(async () => {
    const q = appointmentId
      ? `appointmentId=${encodeURIComponent(appointmentId)}`
      : fallbackBookingId
        ? `fallbackBookingId=${encodeURIComponent(fallbackBookingId)}`
        : '';
    if (!q) return;
    const res = await fetch(`/api/tech/job-pricing?${q}`);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      pricing?: InvoicePricingSnapshot;
      balanceDueCents?: number;
    };
    if (data.ok && data.pricing) {
      setLivePricing(data.pricing);
      if (typeof data.balanceDueCents === 'number') setLiveBalanceCents(data.balanceDueCents);
    }
  }, [appointmentId, fallbackBookingId]);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<'open' | 'copy' | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);

  const canCheckout = liveBalanceCents > 0 && !isFallback && appointmentId;

  const draftTotalCents = useMemo(
    () => draftLines.reduce((s, d) => s + d.unitCents * d.quantity, 0),
    [draftLines],
  );

  const preview = useMemo(() => {
    const customTotal = livePricing.customLineItemsCents + draftTotalCents;
    const finalTotalCents = livePricing.finalTotalCents + draftTotalCents;
    const remainingBalanceCents = Math.max(0, finalTotalCents - livePricing.totalPaidCents);
    return { customTotal, finalTotalCents, remainingBalanceCents };
  }, [livePricing, draftTotalCents]);

  const addDraftFromForm = () => {
    const unitCents = parseDollars(form.amountDollars);
    if (unitCents == null) {
      setSaveMsg({ tone: 'err', text: 'Enter a valid amount before adding.' });
      return;
    }
    const qty = Math.max(1, parseInt(form.quantity, 10) || 1);
    let unit = unitCents;
    if (form.category === 'discount_adjustment' && unit > 0) unit = -unit;
    const label = form.title.trim() || LINE_ITEM_KIND_LABELS[form.category];
    setDraftLines((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        label,
        kind: form.category,
        unitCents: unit,
        quantity: qty,
        notes: form.notes.trim(),
        customerVisible: form.customerVisible,
        taxable: form.taxable,
      },
    ]);
    setForm(emptyForm());
    setSaveMsg({ tone: 'ok', text: 'Line added to preview — tap Save line item to persist.' });
  };

  const persistLine = async (line: {
    label: string;
    kind: string;
    amountDollars: string;
    quantity: string;
    notes: string;
    customerVisible: boolean;
    taxable: boolean;
  }) => {
    const fd = new FormData();
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    fd.set('source', source);
    fd.set('kind', line.kind);
    fd.set('category', line.kind);
    fd.set('label', line.label);
    fd.set('amountDollars', line.amountDollars);
    fd.set('quantity', line.quantity);
    fd.set('notes', line.notes);
    if (line.customerVisible) fd.set('customerVisible', 'true');
    if (line.taxable) fd.set('taxable', 'true');
    await addWorkOrderLineItemAction(fd);
  };

  const saveCurrentForm = async () => {
    const unitCents = parseDollars(form.amountDollars);
    if (unitCents == null) {
      setSaveMsg({ tone: 'err', text: 'Amount is required to save.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await persistLine({
        label: form.title.trim() || LINE_ITEM_KIND_LABELS[form.category],
        kind: form.category,
        amountDollars: form.amountDollars,
        quantity: form.quantity,
        notes: form.notes,
        customerVisible: form.customerVisible,
        taxable: form.taxable,
      });
      setForm(emptyForm());
      setSaveMsg({ tone: 'ok', text: 'Line item saved — totals updated.' });
      await refreshPricing();
      router.refresh();
    } catch {
      setSaveMsg({ tone: 'err', text: 'Could not save line item.' });
    } finally {
      setSaving(false);
    }
  };

  const saveAllDrafts = async () => {
    if (draftLines.length === 0) return saveCurrentForm();
    setSaving(true);
    setSaveMsg(null);
    try {
      for (const d of draftLines) {
        const unitDollars = Math.abs(d.unitCents) / 100;
        const signed = d.unitCents < 0 ? `-${unitDollars}` : String(unitDollars);
        await persistLine({
          label: d.label,
          kind: d.kind,
          amountDollars: signed,
          quantity: String(d.quantity),
          notes: d.notes,
          customerVisible: d.customerVisible,
          taxable: d.taxable,
        });
      }
      setDraftLines([]);
      setSaveMsg({ tone: 'ok', text: `${draftLines.length} line item(s) saved.` });
      await refreshPricing();
      router.refresh();
    } catch {
      setSaveMsg({ tone: 'err', text: 'Could not save all line items.' });
    } finally {
      setSaving(false);
    }
  };

  const createCheckout = async () => {
    if (!canCheckout || !appointmentId) throw new Error('No balance due or appointment required.');
    const res = await fetch('/api/tech/final-balance-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? 'Checkout failed.');
    return data.url;
  };

  const handleOpenCheckout = async () => {
    setCheckoutLoading('open');
    setCheckoutStatus(null);
    try {
      const url = await createCheckout();
      setCheckoutUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      setCheckoutStatus('Checkout opened — balance includes saved line items.');
    } catch (e) {
      setCheckoutStatus(e instanceof Error ? e.message : 'Checkout failed.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCopyLink = async () => {
    setCheckoutLoading('copy');
    setCheckoutStatus(null);
    try {
      const url = await createCheckout();
      setCheckoutUrl(url);
      await navigator.clipboard?.writeText(url);
      setCheckoutStatus('Balance link copied.');
    } catch (e) {
      setCheckoutStatus(e instanceof Error ? e.message : 'Could not copy link.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <section
      id='invoice-builder'
      className='gb-premium-card scroll-mt-24 rounded-2xl border-2 border-gold/45 bg-gradient-to-b from-gold/10 via-black/50 to-black/80 p-4 shadow-[0_0_40px_rgba(212,175,55,0.12)] sm:p-5'
    >
      <header className='border-b border-gold/25 pb-4'>
        <p className='text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft'>Payment</p>
        <h3 className='mt-1 text-xl font-black text-white'>Custom Charges / Invoice Builder</h3>
        <p className='mt-1 text-xs text-zinc-400'>
          Add fees, discounts, and manual invoice lines. Preview updates live; save to update balance checkout and receipts.
        </p>
      </header>

      {(savedItems.length > 0 || draftLines.length > 0) && (
        <div className='mt-4'>
          <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Saved & pending lines</p>
          <ul className='mt-2 space-y-2'>
            {savedItems.map((item) => (
              <li
                key={item.id}
                className='flex justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm'
              >
                <span className='text-zinc-200'>
                  {item.label}
                  {item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </span>
                <span className={`font-mono ${item.amountCents < 0 ? 'text-emerald-300' : 'text-white'}`}>
                  {money(item.amountCents)}
                </span>
              </li>
            ))}
            {draftLines.map((d) => (
              <li
                key={d.id}
                className='flex justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm'
              >
                <span className='text-amber-100'>
                  {d.label} <span className='text-[10px] uppercase text-amber-400/90'>draft</span>
                  {d.quantity > 1 ? ` × ${d.quantity}` : ''}
                </span>
                <span className='font-mono text-amber-50'>{money(d.unitCents * d.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        <label className='block sm:col-span-2'>
          <span className='text-[10px] font-bold uppercase text-zinc-500'>Title</span>
          <input
            className='gb-input mt-1 w-full'
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder='e.g. Upholstery extraction — rear seats'
          />
        </label>
        <label className='block'>
          <span className='text-[10px] font-bold uppercase text-zinc-500'>Category</span>
          <select
            className='gb-input mt-1 w-full'
            value={form.category}
            onChange={(e) => {
              const category = e.target.value as WorkOrderLineItemKind;
              const hint = suggestInvoiceLine(category, defaultVehicleClass);
              setForm((f) => ({
                ...f,
                category,
                title: hint.title,
                amountDollars: hint.amountCents > 0 ? (hint.amountCents / 100).toFixed(2) : f.amountDollars,
              }));
            }}
          >
            {CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {LINE_ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className='block'>
          <span className='text-[10px] font-bold uppercase text-zinc-500'>Amount ($)</span>
          <input
            className='gb-input mt-1 w-full font-mono'
            inputMode='decimal'
            value={form.amountDollars}
            onChange={(e) => setForm((f) => ({ ...f, amountDollars: e.target.value }))}
            placeholder='65.00'
          />
        </label>
        <label className='block'>
          <span className='text-[10px] font-bold uppercase text-zinc-500'>Quantity</span>
          <input
            className='gb-input mt-1 w-full font-mono'
            type='number'
            min={1}
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        </label>
        <label className='block sm:col-span-2'>
          <span className='text-[10px] font-bold uppercase text-zinc-500'>Notes</span>
          <textarea
            className='gb-input mt-1 w-full'
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder='Internal or customer-facing notes'
          />
        </label>
        <label className='flex items-center gap-2 text-sm text-zinc-300'>
          <input
            type='checkbox'
            checked={form.customerVisible}
            onChange={(e) => setForm((f) => ({ ...f, customerVisible: e.target.checked }))}
            className='h-4 w-4 rounded border-gold/40'
          />
          Customer visible on invoice
        </label>
        <label className='flex items-center gap-2 text-sm text-zinc-300'>
          <input
            type='checkbox'
            checked={form.taxable}
            onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))}
            className='h-4 w-4 rounded border-gold/40'
          />
          Taxable
        </label>
      </div>

      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          type='button'
          onClick={addDraftFromForm}
          className='inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-black/50 px-4 py-3 text-xs font-black uppercase text-zinc-200'
        >
          <Plus className='h-4 w-4' />
          Add line item
        </button>
        <button
          type='button'
          disabled={saving}
          onClick={() => void (draftLines.length > 0 ? saveAllDrafts() : saveCurrentForm())}
          className='inline-flex items-center gap-2 rounded-2xl bg-gold px-5 py-3 text-xs font-black uppercase text-black disabled:opacity-50'
        >
          <Save className='h-4 w-4' />
          {saving ? 'Saving…' : 'Save line item'}
        </button>
      </div>

      {saveMsg ? (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
            saveMsg.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-red-500/40 bg-red-500/10 text-red-100'
          }`}
        >
          {saveMsg.text}
        </p>
      ) : null}

      <div className='mt-5 rounded-xl border border-gold/30 bg-black/60 p-4'>
        <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Live invoice preview</p>
        <ul className='mt-3 space-y-2 text-sm'>
          {livePricing.vehicleSubtotalCents > 0 ? (
            <PreviewRow label='Base services subtotal' value={money(livePricing.vehicleSubtotalCents)} />
          ) : null}
          {livePricing.addOnSubtotalCents > 0 ? (
            <PreviewRow label='Add-ons subtotal' value={money(livePricing.addOnSubtotalCents)} />
          ) : null}
          {livePricing.multiCarDiscountCents > 0 ? (
            <PreviewRow label='Multi-car discount' value={`−${money(livePricing.multiCarDiscountCents)}`} discount />
          ) : null}
          {livePricing.onlineDiscountCents > 0 ? (
            <PreviewRow label='Online booking discount' value={`−${money(livePricing.onlineDiscountCents)}`} discount />
          ) : null}
          {livePricing.promoDiscountCents > 0 ? (
            <PreviewRow label='Promo discount' value={`−${money(livePricing.promoDiscountCents)}`} discount />
          ) : null}
          {livePricing.manualDiscountCents > 0 ? (
            <PreviewRow label='Manual discount' value={`−${money(livePricing.manualDiscountCents)}`} discount />
          ) : null}
          {preview.customTotal !== 0 ? (
            <PreviewRow
              label={draftTotalCents > 0 ? 'Manual charges (saved + draft)' : 'Manual charges'}
              value={money(preview.customTotal)}
            />
          ) : null}
          {draftLines.map((d) => (
            <PreviewRow
              key={d.id}
              label={`${d.label} (draft)`}
              value={money(d.unitCents * d.quantity)}
              muted
            />
          ))}
          <PreviewRow label='Final total' value={money(preview.finalTotalCents)} strong />
          {livePricing.depositPaidCents > 0 ? (
            <PreviewRow label='Deposit paid' value={money(livePricing.depositPaidCents)} />
          ) : null}
          {livePricing.totalPaidCents > 0 ? (
            <PreviewRow label='Total paid' value={money(livePricing.totalPaidCents)} />
          ) : null}
          <PreviewRow label='Balance due' value={money(preview.remainingBalanceCents)} strong gold />
        </ul>
        {draftTotalCents > 0 ? (
          <p className='mt-2 text-[10px] text-amber-200/90'>Draft lines are not in checkout until you save.</p>
        ) : null}
      </div>

      <div className='mt-5 grid gap-2 sm:grid-cols-2'>
        <button
          type='button'
          disabled={!canCheckout || checkoutLoading !== null}
          onClick={() => void handleOpenCheckout()}
          className='rounded-2xl bg-gold px-4 py-4 text-sm font-black uppercase text-black disabled:opacity-40'
        >
          {checkoutLoading === 'open' ? 'Creating…' : 'Open checkout'}
        </button>
        <button
          type='button'
          disabled={!canCheckout || checkoutLoading !== null}
          onClick={() => void handleCopyLink()}
          className='rounded-2xl border-2 border-gold/50 px-4 py-4 text-sm font-black uppercase text-gold-soft disabled:opacity-40'
        >
          {checkoutLoading === 'copy' ? 'Creating…' : 'Copy balance link'}
        </button>
        {appointmentId ? (
          <NotificationSendForm
            kind='payment_link'
            appointmentId={appointmentId}
            buttonClassName='rounded-2xl border border-white/20 px-4 py-4 text-sm font-black uppercase text-zinc-200 sm:col-span-2'
          >
            Send balance link
          </NotificationSendForm>
        ) : null}
        <ToastActionForm action={sendWorkOrderReceiptEmailAction} className='w-full'>
          {!isFallback && appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
          {isFallback && fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
          <SubmitStatusButton
            pendingText='Sending…'
            className='w-full rounded-2xl border border-gold/40 bg-gold/10 px-4 py-4 text-sm font-black uppercase text-gold-soft'
          >
            Send invoice
          </SubmitStatusButton>
        </ToastActionForm>
        {receiptPdfHref ? (
          <ReceiptPdfDownloadButton
            href={receiptPdfHref}
            label='Generate PDF'
            className='w-full rounded-2xl border border-white/20 px-4 py-4 text-sm font-black uppercase text-white'
          />
        ) : (
          <ToastActionForm action={generateWorkOrderReceiptActionState} className='w-full'>
            {!isFallback && appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
            {isFallback && fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
            <SubmitStatusButton
              pendingText='Generating…'
              className='w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-4 text-sm font-black uppercase text-white'
            >
              <FileText className='h-4 w-4' />
              Generate PDF
            </SubmitStatusButton>
          </ToastActionForm>
        )}
      </div>

      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='mt-3 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 text-xs font-black uppercase text-emerald-100'
        >
          <ExternalLink className='h-4 w-4' />
          Open secure checkout link
        </a>
      ) : null}

      {checkoutStatus ? <p className='mt-2 text-xs text-zinc-400'>{checkoutStatus}</p> : null}

      <div className='mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs sm:grid-cols-3'>
        <span>
          Final <strong className='font-mono text-white'>{finalTotal ?? money(preview.finalTotalCents)}</strong>
        </span>
        <span>
          Deposit <strong className='font-mono text-white'>{depositPaid ?? '—'}</strong>
        </span>
        <span>
          Balance <strong className='font-mono text-gold-soft'>{balanceDue}</strong>
          {paymentComplete ? ' · Paid' : ''}
        </span>
      </div>
    </section>
  );
}

function PreviewRow({
  label,
  value,
  discount,
  strong,
  gold,
  muted,
}: {
  label: string;
  value: string;
  discount?: boolean;
  strong?: boolean;
  gold?: boolean;
  muted?: boolean;
}) {
  return (
    <li
      className={`flex justify-between gap-3 ${strong ? 'border-t border-white/15 pt-2 font-bold' : ''} ${muted ? 'text-amber-200/80' : ''}`}
    >
      <span className={discount ? 'text-emerald-400' : 'text-zinc-400'}>{label}</span>
      <span className={`font-mono shrink-0 ${gold ? 'text-gold-soft' : discount ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </span>
    </li>
  );
}
