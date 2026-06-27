'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export type AddonRow = {
  id: string;
  slug: string;
  label: string;
  price_cents: number;
  active: boolean;
  sort_order: number;
  estimated_min_minutes: number;
  estimated_max_minutes: number;
};

async function patchAddon(body: object) {
  const res = await fetchWithTimeout('/api/admin/addons', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 20000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) return { ok: false as const, error: data.error ?? `Failed (${res.status})` };
  return { ok: true as const };
}

export function AddonsAdminClient({ initialRows }: { initialRows: AddonRow[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDollars, setNewDollars] = useState(25);

  return (
    <div className='space-y-6'>
      {/* New Add-on Form Collapsed */}
      <details className='mb-6 rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
        <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
          <span>Create New Booking Add-on</span>
          <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Form</span>
        </summary>
        <div className="mt-5 pt-5 border-t border-white/5">
          <div className='flex flex-wrap gap-4 items-end'>
            <label className='block text-xs text-zinc-400'>
              Label / Display Name
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Engine Bay Detail"
                className='mt-1.5 w-60 rounded-xl border border-zinc-700 bg-black px-3.5 py-2 text-sm text-white focus:border-gold/50 outline-none transition'
              />
            </label>
            <label className='block text-xs text-zinc-400'>
              Price (USD)
              <input
                type='number'
                min={0}
                step={1}
                value={newDollars}
                onChange={(e) => setNewDollars(Number(e.target.value))}
                className='mt-1.5 w-28 rounded-xl border border-zinc-700 bg-black px-3.5 py-2 text-sm text-white focus:border-gold/50 outline-none transition'
              />
            </label>
            <button
              type='button'
              disabled={creating || !newLabel.trim()}
              onClick={() => {
                void (async () => {
                  setCreating(true);
                  setMsg(null);
                  const res = await fetchWithTimeout('/api/admin/addons', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label: newLabel.trim(), price_cents: Math.round(newDollars * 100), active: true }),
                    credentials: 'same-origin',
                    timeoutMs: 20000,
                  });
                  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                  setCreating(false);
                  if (!res.ok || !data.ok) {
                    setMsg({ type: 'err', text: data.error ?? 'Create failed' });
                    return;
                  }
                  setNewLabel('');
                  setMsg({ type: 'ok', text: 'Add-on created.' });
                  router.refresh();
                })();
              }}
              className='rounded-xl bg-gold px-6 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 hover:brightness-110 transition duration-200 shadow-md'
            >
              Add Add-on
            </button>
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-gold-soft">Active Add-on Catalog</span>
        <span className="text-[10px] text-zinc-500 font-bold">{initialRows.length} Items</span>
      </div>

      <ul className='grid gap-4 md:grid-cols-2'>
        {initialRows.map((row) => (
          <AddonEditorRow key={row.id} row={row} onUpdated={() => router.refresh()} onMessage={setMsg} />
        ))}
      </ul>

      {msg ? (
        <div className={`mt-4 rounded-xl border p-4 text-xs font-bold leading-relaxed ${msg.type === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}

function AddonEditorRow({
  row,
  onUpdated,
  onMessage,
}: {
  row: AddonRow;
  onUpdated: () => void;
  onMessage: (m: { type: 'ok' | 'err'; text: string } | null) => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [slug, setSlug] = useState(row.slug);
  const [dollars, setDollars] = useState(row.price_cents / 100);
  const [active, setActive] = useState(row.active);
  const [sortOrder, setSortOrder] = useState(row.sort_order);
  const [minMinutes, setMinMinutes] = useState(row.estimated_min_minutes);
  const [maxMinutes, setMaxMinutes] = useState(row.estimated_max_minutes);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(row.label);
    setSlug(row.slug);
    setDollars(row.price_cents / 100);
    setActive(row.active);
    setSortOrder(row.sort_order);
    setMinMinutes(row.estimated_min_minutes);
    setMaxMinutes(row.estimated_max_minutes);
  }, [row]);

  return (
    <li className='gb-premium-card rounded-2xl p-5 flex flex-col justify-between border border-gold/10'>
      <div className='space-y-4'>
        <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
          <span className="text-xs font-black uppercase text-white tracking-wider">{label || 'Unnamed Add-on'}</span>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500'}`}>
            {active ? 'Active' : 'Paused'}
          </span>
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='block text-xs text-zinc-500'>
            Display Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'
            />
          </label>
          <label className='block text-xs text-zinc-500'>
            Unique Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 font-mono text-[10px] text-zinc-400 focus:border-gold/50 outline-none transition'
            />
          </label>
          <label className='block text-xs text-zinc-500'>
            Price (USD)
            <input
              type='number'
              min={0}
              step={1}
              value={dollars}
              onChange={(e) => setDollars(Number(e.target.value))}
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'
            />
          </label>
          <label className='block text-xs text-zinc-500'>
            Sort Weight
            <input
              type='number'
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'
            />
          </label>
          <label className='block text-xs text-zinc-500'>
            Est. minutes (min)
            <input
              type='number'
              min={0}
              value={minMinutes}
            onChange={(e) => setMinMinutes(Number(e.target.value))}
            placeholder='Auto if 0'
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'
            />
          </label>
          <label className='block text-xs text-zinc-500'>
            Est. minutes (max)
            <input
              type='number'
              min={0}
              value={maxMinutes}
            onChange={(e) => setMaxMinutes(Number(e.target.value))}
            placeholder='Auto if 0'
              className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'
            />
          </label>
        </div>
        <p className='text-[10px] text-zinc-600'>Titan uses these for multi-car scheduling. Leave blank to use smart defaults by add-on type.</p>

        <div className='flex items-center gap-2 bg-black/40 border border-white/5 p-3 rounded-xl'>
          <input 
            type='checkbox' 
            id={`active-check-${row.id}`}
            checked={active} 
            onChange={(e) => setActive(e.target.checked)} 
            className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4 w-4"
          />
          <label htmlFor={`active-check-${row.id}`} className='text-xs font-semibold text-zinc-300 cursor-pointer select-none'>
            Publish and enable at checkout
          </label>
        </div>
      </div>

      <div className='mt-5 pt-4 border-t border-white/5 flex gap-2 justify-end'>
        <button
          type='button'
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              onMessage(null);
              const r = await patchAddon({
                id: row.id,
                label: label.trim(),
                slug: slug.trim(),
                price_cents: Math.round(dollars * 100),
                active,
                sort_order: sortOrder,
                estimated_min_minutes: minMinutes,
                estimated_max_minutes: maxMinutes,
              });
              setBusy(false);
              if (!r.ok) {
                onMessage({ type: 'err', text: r.error });
                return;
              }
              onMessage({ type: 'ok', text: 'Saved successfully.' });
              onUpdated();
            })();
          }}
          className='rounded-xl bg-gold px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 hover:brightness-110 transition duration-200'
        >
          Save
        </button>
        <button
          type='button'
          disabled={busy}
          onClick={() => {
            void (async () => {
              if (!window.confirm('Delete this add-on?')) return;
              setBusy(true);
              const res = await fetchWithTimeout(`/api/admin/addons?id=${encodeURIComponent(row.id)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                timeoutMs: 15000,
              });
              const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
              setBusy(false);
              if (!res.ok || !data.ok) {
                onMessage({ type: 'err', text: data.error ?? 'Delete failed' });
                return;
              }
              onUpdated();
            })();
          }}
          className='rounded-xl border border-red-500/40 hover:bg-red-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 transition duration-200'
        >
          Delete
        </button>
      </div>
    </li>
  );
}

