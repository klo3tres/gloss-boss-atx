'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  overrideWorkOrderFinalTotalAction,
  recalculateWorkOrderPricingAction,
  setWorkOrderPromoAction,
  toggleWorkOrderDiscountAction,
  updateWorkOrderVehiclePriceAction,
} from '@/app/(dashboard)/tech/work-order-pricing-actions';

type VehicleRow = {
  index: number;
  label: string;
  service: string;
  priceCents: number | null;
  priceLabel: string;
};

export function WorkOrderPricingPanel({
  appointmentId,
  fallbackBookingId,
  source,
  vehicles,
  promoCode,
  pricing,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
  vehicles: VehicleRow[];
  promoCode: string;
  pricing: {
    finalTotalCents: number;
    onlineDiscountCents: number;
    multiCarDiscountCents: number;
    promoDiscountCents: number;
    overrideReason?: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const baseFd = () => {
    const fd = new FormData();
    fd.set('source', source);
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    return fd;
  };

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd?: FormData) => {
    startTransition(async () => {
      setMsg(null);
      const res = await fn(fd ?? baseFd());
      if (res.ok) {
        setMsg({ tone: 'ok', text: 'Pricing updated.' });
        router.refresh();
      } else {
        setMsg({ tone: 'err', text: res.error ?? 'Update failed' });
      }
    });
  };

  return (
    <div className='gb-glass space-y-4 rounded-2xl border border-gold/25 p-5'>
      <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Admin pricing controls</p>
      <p className='text-xs text-zinc-500'>Edits update work order, balance, receipts, and customer dashboard totals.</p>

      {vehicles.map((v) => (
        <form
          key={v.index}
          className='flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/40 p-3'
          onSubmit={(e) => {
            e.preventDefault();
            const fd = baseFd();
            fd.set('vehicleIndex', String(v.index));
            fd.set('priceDollars', (e.currentTarget.elements.namedItem('price') as HTMLInputElement).value);
            run((f) => updateWorkOrderVehiclePriceAction(f), fd);
          }}
        >
          <div className='min-w-[140px] flex-1'>
            <p className='text-sm font-bold text-white'>{v.label}</p>
            <p className='text-xs text-zinc-500'>{v.service}</p>
          </div>
          <label className='text-xs text-zinc-400'>
            Price $
            <input
              name='price'
              type='number'
              step='0.01'
              min={0}
              defaultValue={v.priceCents != null ? (v.priceCents / 100).toFixed(2) : ''}
              className='mt-1 block w-28 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <button
            type='submit'
            disabled={pending}
            className='rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50'
          >
            Save
          </button>
        </form>
      ))}

      <form
        className='flex flex-wrap items-end gap-2'
        onSubmit={(e) => {
          e.preventDefault();
          const fd = baseFd();
          const code = (e.currentTarget.elements.namedItem('promo') as HTMLInputElement).value.trim();
          if (!code) {
            fd.set('remove', 'true');
          } else {
            fd.set('promoCode', code);
          }
          run((f) => setWorkOrderPromoAction(f), fd);
        }}
      >
        <label className='flex-1 text-xs text-zinc-400'>
          Promo code {promoCode ? `(current: ${promoCode})` : ''}
          <input
            name='promo'
            defaultValue={promoCode}
            placeholder='SAVE15 or empty to remove'
            className='mt-1 block w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <button type='submit' disabled={pending} className='rounded-lg border border-gold/40 px-4 py-2 text-[10px] font-black uppercase text-gold-soft'>
          Apply promo
        </button>
      </form>

      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={pending}
          onClick={() => {
            const fd = baseFd();
            fd.set('discountKind', 'online');
            fd.set('enable', pricing.onlineDiscountCents > 0 ? 'false' : 'true');
            run((f) => toggleWorkOrderDiscountAction(f), fd);
          }}
          className='rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold uppercase text-zinc-300'
        >
          {pricing.onlineDiscountCents > 0 ? 'Remove online discount' : 'Apply online discount'}
        </button>
        <button
          type='button'
          disabled={pending}
          onClick={() => {
            const fd = baseFd();
            fd.set('discountKind', 'multi_car');
            fd.set('enable', pricing.multiCarDiscountCents > 0 ? 'false' : 'true');
            run((f) => toggleWorkOrderDiscountAction(f), fd);
          }}
          className='rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold uppercase text-zinc-300'
        >
          {pricing.multiCarDiscountCents > 0 ? 'Remove multi-car' : 'Apply multi-car'}
        </button>
        <button
          type='button'
          disabled={pending}
          onClick={() => run((f) => recalculateWorkOrderPricingAction(f))}
          className='rounded-lg border border-emerald-500/40 px-3 py-2 text-[10px] font-bold uppercase text-emerald-200'
        >
          Recalculate from catalog
        </button>
      </div>

      <form
        className='rounded-xl border border-amber-500/30 bg-amber-500/5 p-3'
        onSubmit={(e) => {
          e.preventDefault();
          const fd = baseFd();
          fd.set('finalTotalDollars', (e.currentTarget.elements.namedItem('overrideTotal') as HTMLInputElement).value);
          fd.set('reason', (e.currentTarget.elements.namedItem('overrideReason') as HTMLInputElement).value);
          run((f) => overrideWorkOrderFinalTotalAction(f), fd);
        }}
      >
        <p className='text-xs font-bold uppercase text-amber-200'>Override final total</p>
        <div className='mt-2 flex flex-wrap gap-2'>
          <input
            name='overrideTotal'
            type='number'
            step='0.01'
            min={0}
            placeholder={(pricing.finalTotalCents / 100).toFixed(2)}
            className='w-32 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
          <input
            name='overrideReason'
            placeholder='Reason (required)'
            defaultValue={pricing.overrideReason}
            className='min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
          <button type='submit' disabled={pending} className='rounded-lg bg-amber-600 px-4 py-2 text-[10px] font-black uppercase text-black'>
            Override total
          </button>
        </div>
      </form>

      {msg ? (
        <p className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
