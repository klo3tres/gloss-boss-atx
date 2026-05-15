'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export type OfferEditorRow = {
  id: string;
  label: string;
  percent_off: number;
  active: boolean;
  stackable: boolean;
};

async function saveOffer(body: Record<string, unknown>) {
  const res = await fetchWithTimeout('/api/admin/offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 30000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false as const, error: data.error ?? `Request failed (${res.status})` };
  }
  return { ok: true as const };
}

export function CmsOffersSectionClient({ initialRows }: { initialRows: OfferEditorRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPct, setNewPct] = useState(15);
  const [newActive, setNewActive] = useState(true);
  const [newStackable, setNewStackable] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
      <h2 className='text-lg font-bold uppercase'>Offers</h2>
      <p className='mt-2 text-sm text-zinc-400'>
        Active offers appear on the homepage. Link visitors to booking with{' '}
        <code className='text-gold-soft'>/book?offer=&#123;id&#125;</code>.
      </p>
      <div className='mt-4 grid gap-3 rounded-xl border border-gold/15 bg-black/40 p-4 sm:grid-cols-2 lg:grid-cols-4'>
        <label className='block text-xs text-zinc-400 lg:col-span-2'>
          New offer title
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          % off (whole booking subtotal after multi-car discount)
          <input
            type='number'
            min={0}
            max={100}
            value={newPct}
            onChange={(e) => setNewPct(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='flex items-end gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={newActive} onChange={(e) => setNewActive(e.target.checked)} className='rounded' />
          Active
        </label>
        <label className='flex items-end gap-2 text-xs text-zinc-400 lg:col-span-2'>
          <input type='checkbox' checked={newStackable} onChange={(e) => setNewStackable(e.target.checked)} className='rounded' />
          Stack with sitewide promo (apply sitewide % after offer discount)
        </label>
        <button
          type='button'
          disabled={creating || !newTitle.trim()}
          onClick={() => {
            void (async () => {
              setCreating(true);
              setMsg(null);
              const r = await saveOffer({
                label: newTitle.trim(),
                percent_off: newPct,
                active: newActive,
                stackable: newStackable,
              });
              setCreating(false);
              if (!r.ok) {
                setMsg({ type: 'err', text: r.error });
                return;
              }
              setMsg({ type: 'ok', text: 'Offer created.' });
              setNewTitle('');
              router.refresh();
            })();
          }}
          className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 lg:col-span-4 lg:justify-self-start'
        >
          {creating ? 'Saving…' : 'Create offer'}
        </button>
      </div>
      <ul className='mt-4 space-y-3 text-sm'>
        {initialRows.map((row) => (
          <OfferRowEditor
            key={row.id}
            row={row}
            onSaved={() => {
              router.refresh();
            }}
            onError={(text) => setMsg({ type: 'err', text })}
            onOk={(text) => setMsg({ type: 'ok', text })}
          />
        ))}
      </ul>
      {msg ? (
        <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`} role={msg.type === 'err' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}

function OfferRowEditor({
  row,
  onSaved,
  onError,
  onOk,
}: {
  row: OfferEditorRow;
  onSaved?: () => void;
  onError: (s: string) => void;
  onOk: (s: string) => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [pct, setPct] = useState(row.percent_off);
  const [active, setActive] = useState(row.active);
  const [stackable, setStackable] = useState(row.stackable);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabel(row.label);
    setPct(row.percent_off);
    setActive(row.active);
    setStackable(row.stackable);
  }, [row]);

  return (
    <li className='rounded-lg border border-white/10 bg-black/40 p-3'>
      <div className='mb-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500'>
        <span className='font-mono'>id: {row.id}</span>
        <Link href={`/book?offer=${encodeURIComponent(row.id)}`} className='text-gold-soft underline' target='_blank' rel='noreferrer'>
          Open booking with offer →
        </Link>
      </div>
      <div className='grid gap-2 sm:grid-cols-[1fr_80px_auto_auto_auto] sm:items-end'>
        <label className='text-xs text-zinc-400'>
          Title
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white'
          />
        </label>
        <label className='text-xs text-zinc-400'>
          %
          <input
            type='number'
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white'
          />
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
          Stack
        </label>
        <button
          type='button'
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              const r = await saveOffer({
                id: row.id,
                label: label.trim() || row.label,
                percent_off: pct,
                active,
                stackable,
              });
              setBusy(false);
              if (!r.ok) {
                onError(r.error);
                return;
              }
              onSaved?.();
              onOk('Offer saved.');
            })();
          }}
          className='rounded border border-gold/40 px-2 py-1 text-xs font-bold uppercase text-gold-soft disabled:opacity-40'
        >
          Save
        </button>
      </div>
    </li>
  );
}
