'use client';

import { LINE_ITEM_KIND_LABELS } from '@/lib/work-order-line-items';
import { addWorkOrderLineItemAction } from '@/app/(dashboard)/tech/work-order-line-item-actions';

const KINDS = Object.keys(LINE_ITEM_KIND_LABELS) as Array<keyof typeof LINE_ITEM_KIND_LABELS>;

export function WorkOrderCustomCharges({
  appointmentId,
  fallbackBookingId,
  source,
  items,
}: {
  appointmentId?: string;
  fallbackBookingId?: string;
  source: 'appointment' | 'fallback';
  items: Array<{ id: string; label: string; amountCents: number }>;
}) {
  return (
    <div className='mt-4 rounded-xl border border-white/10 bg-black/30 p-3'>
      <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Manual charges</p>
      {items.length > 0 ? (
        <ul className='mt-2 space-y-1 text-sm'>
          {items.map((item) => (
            <li key={item.id} className='flex justify-between gap-2 text-zinc-300'>
              <span>{item.label}</span>
              <span className={`font-mono ${item.amountCents < 0 ? 'text-emerald-300' : 'text-white'}`}>
                {item.amountCents < 0 ? '−' : ''}${Math.abs(item.amountCents / 100).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-2 text-xs text-zinc-500'>No manual line items yet.</p>
      )}
      <form action={addWorkOrderLineItemAction} className='mt-3 grid gap-2 sm:grid-cols-2'>
        {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
        {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
        <input type='hidden' name='source' value={source} />
        <select name='kind' className='gb-input text-xs' defaultValue='custom_addon'>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {LINE_ITEM_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input name='amountDollars' placeholder='Amount ($)' className='gb-input text-xs' required />
        <input name='label' placeholder='Title / description' className='gb-input text-xs sm:col-span-2' />
        <input name='notes' placeholder='Notes (optional)' className='gb-input text-xs sm:col-span-2' />
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' name='customerVisible' value='true' defaultChecked className='rounded' />
          Show on customer receipt
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' name='taxable' value='true' className='rounded' />
          Taxable
        </label>
        <button type='submit' className='sm:col-span-2 rounded-2xl bg-gold px-4 py-3 text-xs font-black uppercase text-black'>
          Add charge / discount
        </button>
      </form>
    </div>
  );
}
