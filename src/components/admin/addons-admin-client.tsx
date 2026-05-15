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
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-sm font-bold uppercase text-gold-soft'>New add-on</h2>
        <div className='mt-3 flex flex-wrap gap-3'>
          <label className='text-xs text-zinc-400'>
            Label
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className='mt-1 block w-56 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='text-xs text-zinc-400'>
            Price (USD)
            <input
              type='number'
              min={0}
              step={1}
              value={newDollars}
              onChange={(e) => setNewDollars(Number(e.target.value))}
              className='mt-1 block w-24 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
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
            className='self-end rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40'
          >
            Add
          </button>
        </div>
      </section>

      <ul className='space-y-4'>
        {initialRows.map((row) => (
          <AddonEditorRow key={row.id} row={row} onUpdated={() => router.refresh()} onMessage={setMsg} />
        ))}
      </ul>

      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(row.label);
    setSlug(row.slug);
    setDollars(row.price_cents / 100);
    setActive(row.active);
    setSortOrder(row.sort_order);
  }, [row]);

  return (
    <li className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-6'>
        <label className='text-xs text-zinc-400 lg:col-span-2'>
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='text-xs text-zinc-400'>
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
          />
        </label>
        <label className='text-xs text-zinc-400'>
          $ (USD)
          <input
            type='number'
            min={0}
            step={1}
            value={dollars}
            onChange={(e) => setDollars(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='flex items-end gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <label className='text-xs text-zinc-400'>
          Sort
          <input
            type='number'
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
      </div>
      <div className='mt-3 flex flex-wrap gap-2'>
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
              });
              setBusy(false);
              if (!r.ok) {
                onMessage({ type: 'err', text: r.error });
                return;
              }
              onMessage({ type: 'ok', text: 'Saved.' });
              onUpdated();
            })();
          }}
          className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40'
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
          className='rounded-lg border border-red-500/40 px-4 py-2 text-xs font-bold uppercase text-red-300'
        >
          Delete
        </button>
      </div>
    </li>
  );
}
