'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { InventoryItem } from '@/lib/titan/inventory';

async function patchItem(body: object) {
  const res = await fetchWithTimeout('/api/admin/titan/inventory', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 20000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false as const, error: data.error ?? 'Save failed' };
  return { ok: true as const };
}

export function TitanInventoryClient({ initialItems, lowStockCount }: { initialItems: InventoryItem[]; lowStockCount: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className='space-y-6'>
      <div className='rounded-2xl border border-gold/20 bg-black/45 p-5'>
        <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Inventory Operator</p>
        <p className='mt-2 text-sm text-zinc-300'>
          Track chemicals, towels, and supplies. Titan flags reorder needs before jobs stall.
        </p>
        <p className='mt-3 text-2xl font-black text-white'>{lowStockCount}</p>
        <p className='text-xs text-zinc-500'>items at or below reorder threshold</p>
        <Link href='/admin/titan' className='mt-4 inline-block text-[10px] font-black uppercase text-gold-soft underline'>
          ← Titan home
        </Link>
      </div>

      <ul className='grid gap-4 md:grid-cols-2'>
        {initialItems.map((item) => (
          <InventoryRow key={item.id} item={item} onSaved={() => router.refresh()} onMessage={setMsg} />
        ))}
      </ul>

      {msg ? <p className='text-xs text-emerald-300'>{msg}</p> : null}
    </div>
  );
}

function InventoryRow({
  item,
  onSaved,
  onMessage,
}: {
  item: InventoryItem;
  onSaved: () => void;
  onMessage: (m: string | null) => void;
}) {
  const [qty, setQty] = useState(item.quantity_on_hand);
  const [threshold, setThreshold] = useState(item.reorder_threshold);
  const [busy, setBusy] = useState(false);
  const low = item.reorder_threshold > 0 && qty <= item.reorder_threshold;
  const avgUse = item.slug.includes('towel') ? 8 : item.slug.includes('glove') ? 0.15 : 0.25;
  const jobsLeft = qty > 0 && avgUse > 0 ? Math.floor(qty / avgUse) : 0;

  return (
    <li className='rounded-2xl border border-white/10 bg-black/40 p-5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-sm font-bold text-white'>{item.label}</p>
          <p className='text-[10px] uppercase text-zinc-500'>{item.category} · {item.unit}</p>
        </div>
        {low ? (
          <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200'>Reorder</span>
        ) : (
          <span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300'>OK</span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">~{jobsLeft} jobs remaining at typical use</p>
      <div className='mt-4 grid grid-cols-2 gap-3'>
        <label className='text-xs text-zinc-500'>
          On hand
          <input
            type='number'
            min={0}
            step={0.5}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='text-xs text-zinc-500'>
          Reorder at
          <input
            type='number'
            min={0}
            step={0.5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
      </div>
      <button
        type='button'
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            onMessage(null);
            const r = await patchItem({ id: item.id, quantity_on_hand: qty, reorder_threshold: threshold });
            setBusy(false);
            if (!r.ok) {
              onMessage(r.error);
              return;
            }
            onMessage('Saved');
            onSaved();
          })();
        }}
        className='mt-4 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-40'
      >
        Save
      </button>
    </li>
  );
}
