'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PromotionAdminRow } from '@/lib/promotion-admin';

async function postOffer(body: Record<string, unknown>) {
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

export function PromotionsAdminClient({
  initialRows,
  heading = 'Promotions & offers',
}: {
  initialRows: PromotionAdminRow[];
  heading?: string;
}) {
  const router = useRouter();
  const deduped = useMemo(() => {
    const m = new Map<string, PromotionAdminRow>();
    for (const r of initialRows) {
      const key = (r.slug?.trim() || r.title.trim() || r.id).toLowerCase();
      if (!m.has(key)) m.set(key, r);
    }
    return [...m.values()];
  }, [initialRows]);

  const archivedRows = deduped.filter((r) => r.archived);
  const nonArchived = deduped.filter((r) => !r.archived);
  const activeMarketingRows = nonArchived.filter((r) => r.active);
  const inactiveRows = nonArchived.filter((r) => !r.active);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newKind, setNewKind] = useState<'percent' | 'fixed'>('percent');
  const [newPct, setNewPct] = useState(15);
  const [newFixedDollars, setNewFixedDollars] = useState(25);
  const [newActive, setNewActive] = useState(true);
  const [newStackable, setNewStackable] = useState(true);
  const [newSort, setNewSort] = useState(100);
  const [newHome, setNewHome] = useState(true);
  const [newServices, setNewServices] = useState(true);
  const [newBooking, setNewBooking] = useState(true);
  const [newStarts, setNewStarts] = useState('');
  const [newEnds, setNewEnds] = useState('');

  return (
    <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
      <h2 className='text-lg font-bold uppercase'>{heading}</h2>
      <p className='mt-2 text-sm text-zinc-400'>
        Live promotions sync to the homepage, services page, and booking. Customers claim with{' '}
        <code className='text-gold-soft'>/book?offer=&#123;slug-or-id&#125;</code>
        . Archiving removes them from the public site (soft delete). Restore brings an archived offer back without duplicating on the
        site (same slug/title key).
      </p>

      <div className='mt-4 grid gap-3 rounded-xl border border-gold/15 bg-black/40 p-4 md:grid-cols-2 lg:grid-cols-3'>
        <label className='block text-xs text-zinc-400 md:col-span-2'>
          Title
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400 md:col-span-3'>
          Description
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Slug (optional, lowercase)
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder='spring-detail'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Discount type
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as 'percent' | 'fixed')}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          >
            <option value='percent'>Percent off</option>
            <option value='fixed'>Fixed amount off</option>
          </select>
        </label>
        <label className='block text-xs text-zinc-400'>
          Sort order
          <input
            type='number'
            value={newSort}
            onChange={(e) => setNewSort(Number(e.target.value))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        {newKind === 'percent' ? (
          <label className='block text-xs text-zinc-400'>
            % off (subtotal after multi-car)
            <input
              type='number'
              min={0}
              max={100}
              value={newPct}
              onChange={(e) => setNewPct(Number(e.target.value))}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
        ) : (
          <label className='block text-xs text-zinc-400'>
            $ off (whole dollars)
            <input
              type='number'
              min={1}
              value={newFixedDollars}
              onChange={(e) => setNewFixedDollars(Number(e.target.value))}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
        )}
        <label className='block text-xs text-zinc-400'>
          Start (optional, local)
          <input
            type='datetime-local'
            value={newStarts}
            onChange={(e) => setNewStarts(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          End (optional, local)
          <input
            type='datetime-local'
            value={newEnds}
            onChange={(e) => setNewEnds(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={newActive} onChange={(e) => setNewActive(e.target.checked)} /> Active
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400 md:col-span-2'>
          <input type='checkbox' checked={newStackable} onChange={(e) => setNewStackable(e.target.checked)} />
          Stack with sitewide promo (sitewide % applies after this offer)
        </label>
        <p className='text-[10px] font-bold uppercase tracking-wider text-zinc-500 md:col-span-3'>Show on</p>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={newHome} onChange={(e) => setNewHome(e.target.checked)} /> Homepage
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={newServices} onChange={(e) => setNewServices(e.target.checked)} /> Services
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={newBooking} onChange={(e) => setNewBooking(e.target.checked)} /> Booking promos
        </label>
        <button
          type='button'
          disabled={creating || !newTitle.trim()}
          onClick={() => {
            void (async () => {
              setCreating(true);
              setMsg(null);
              const discount_fixed_cents = newKind === 'fixed' ? Math.round(Math.max(1, newFixedDollars) * 100) : null;
              const percent_off = newKind === 'percent' ? newPct : 0;
              const r = await postOffer({
                title: newTitle.trim(),
                description: newDescription.trim(),
                slug: newSlug.trim(),
                percent_off,
                discount_fixed_cents,
                active: newActive,
                stackable: newStackable,
                sort_order: newSort,
                show_on_homepage: newHome,
                show_on_services: newServices,
                show_on_booking: newBooking,
                starts_at: newStarts ? new Date(newStarts).toISOString() : null,
                ends_at: newEnds ? new Date(newEnds).toISOString() : null,
              });
              setCreating(false);
              if (!r.ok) {
                setMsg({ type: 'err', text: r.error });
                return;
              }
              setMsg({ type: 'ok', text: 'Promotion created.' });
              setNewTitle('');
              setNewDescription('');
              setNewSlug('');
              router.refresh();
            })();
          }}
          className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 md:col-span-3 lg:justify-self-start'
        >
          {creating ? 'Saving…' : 'Create promotion'}
        </button>
      </div>

      <ul className='mt-6 space-y-3 text-sm'>
        <li className='text-[10px] font-black uppercase tracking-widest text-gold-soft'>
          Active for marketing ({activeMarketingRows.length})
        </li>
        {activeMarketingRows.length === 0 ? (
          <li className='text-zinc-500'>No active promotions — toggle &quot;Active&quot; on a row below or create one.</li>
        ) : null}
        {activeMarketingRows.map((row) => (
          <PromotionRowEditor
            key={row.id}
            row={row}
            onSaved={() => router.refresh()}
            onError={(text) => setMsg({ type: 'err', text })}
            onOk={(text) => setMsg({ type: 'ok', text })}
          />
        ))}
      </ul>

      {inactiveRows.length > 0 ? (
        <details className='mt-6 rounded-xl border border-white/10 bg-black/25 p-3'>
          <summary className='cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-400'>
            Inactive (not archived) ({inactiveRows.length})
          </summary>
          <ul className='mt-4 space-y-3'>
            {inactiveRows.map((row) => (
              <PromotionRowEditor
                key={row.id}
                row={row}
                onSaved={() => router.refresh()}
                onError={(text) => setMsg({ type: 'err', text })}
                onOk={(text) => setMsg({ type: 'ok', text })}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {archivedRows.length > 0 ? (
        <details open={false} className='mt-6 rounded-xl border border-white/10 bg-black/25 p-3'>
          <summary className='cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-300'>
            Archived promotions ({archivedRows.length})
          </summary>
          <p className='mt-2 text-[11px] text-zinc-500'>Archived offers are hidden from the public site. Use Restore to reactivate.</p>
          <ul className='mt-4 space-y-3'>
            {archivedRows.map((row) => (
              <PromotionRowEditor
                key={row.id}
                row={row}
                onSaved={() => router.refresh()}
                onError={(text) => setMsg({ type: 'err', text })}
                onOk={(text) => setMsg({ type: 'ok', text })}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {msg ? (
        <p
          className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}
          role={msg.type === 'err' ? 'alert' : 'status'}
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}

function localFromIso(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromotionRowEditor({
  row,
  onSaved,
  onError,
  onOk,
}: {
  row: PromotionAdminRow;
  onSaved?: () => void;
  onError: (s: string) => void;
  onOk: (s: string) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description);
  const [slug, setSlug] = useState(row.slug);
  const [kind, setKind] = useState<'percent' | 'fixed'>(row.discountKind);
  const [pct, setPct] = useState(row.percentOff);
  const [fixedDollars, setFixedDollars] = useState(
    row.discountFixedCents != null ? Math.round(row.discountFixedCents / 100) : 25,
  );
  const [active, setActive] = useState(row.active);
  const [archived, setArchived] = useState(row.archived);
  const [stackable, setStackable] = useState(row.stackable);
  const [sortOrder, setSortOrder] = useState(row.sortOrder);
  const [showHome, setShowHome] = useState(row.showOnHomepage);
  const [showServices, setShowServices] = useState(row.showOnServices);
  const [showBooking, setShowBooking] = useState(row.showOnBooking);
  const [starts, setStarts] = useState(localFromIso(row.startsAt));
  const [ends, setEnds] = useState(localFromIso(row.endsAt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(row.title);
    setDescription(row.description);
    setSlug(row.slug);
    setKind(row.discountKind);
    setPct(row.percentOff);
    setFixedDollars(row.discountFixedCents != null ? Math.round(row.discountFixedCents / 100) : 25);
    setActive(row.active);
    setArchived(row.archived);
    setStackable(row.stackable);
    setSortOrder(row.sortOrder);
    setShowHome(row.showOnHomepage);
    setShowServices(row.showOnServices);
    setShowBooking(row.showOnBooking);
    setStarts(localFromIso(row.startsAt));
    setEnds(localFromIso(row.endsAt));
  }, [row]);

  const claimParam = slug.trim() || row.id;

  return (
    <li className='rounded-xl border border-white/10 bg-black/40 p-4'>
      <div className='mb-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500'>
        <span className='font-mono'>id: {row.id}</span>
        {archived ? <span className='rounded bg-zinc-800 px-2 py-0.5 text-amber-200'>Archived</span> : null}
        <Link
          href={`/book?offer=${encodeURIComponent(claimParam)}`}
          className='text-gold-soft underline'
          target='_blank'
          rel='noreferrer'
        >
          Open booking with offer →
        </Link>
      </div>
      <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3'>
        <label className='block text-xs text-zinc-400 md:col-span-2'>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400 md:col-span-3'>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Discount type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          >
            <option value='percent'>Percent</option>
            <option value='fixed'>Fixed $</option>
          </select>
        </label>
        <label className='block text-xs text-zinc-400'>
          Sort order
          <input
            type='number'
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        {kind === 'percent' ? (
          <label className='block text-xs text-zinc-400'>
            % off
            <input
              type='number'
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
            />
          </label>
        ) : (
          <label className='block text-xs text-zinc-400'>
            $ off
            <input
              type='number'
              min={1}
              value={fixedDollars}
              onChange={(e) => setFixedDollars(Number(e.target.value))}
              className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
            />
          </label>
        )}
        <label className='block text-xs text-zinc-400'>
          Start
          <input
            type='datetime-local'
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          End
          <input
            type='datetime-local'
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1.5 text-white'
          />
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400 md:col-span-2'>
          <input type='checkbox' checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> Stack w/ sitewide
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={showHome} onChange={(e) => setShowHome(e.target.checked)} /> Homepage
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={showServices} onChange={(e) => setShowServices(e.target.checked)} /> Services
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={showBooking} onChange={(e) => setShowBooking(e.target.checked)} /> Booking
        </label>
      </div>
      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={busy || archived}
          onClick={() => {
            void (async () => {
              setBusy(true);
              const discount_fixed_cents = kind === 'fixed' ? Math.round(Math.max(1, fixedDollars) * 100) : null;
              const percent_off = kind === 'percent' ? pct : 0;
              const r = await postOffer({
                id: row.id,
                title: title.trim() || row.title,
                description: description.trim(),
                slug: slug.trim(),
                percent_off,
                discount_fixed_cents,
                active,
                stackable,
                sort_order: sortOrder,
                show_on_homepage: showHome,
                show_on_services: showServices,
                show_on_booking: showBooking,
                starts_at: starts ? new Date(starts).toISOString() : null,
                ends_at: ends ? new Date(ends).toISOString() : null,
              });
              setBusy(false);
              if (!r.ok) {
                onError(r.error);
                return;
              }
              onSaved?.();
              onOk('Saved.');
            })();
          }}
          className='rounded border border-gold/40 px-3 py-1.5 text-xs font-bold uppercase text-gold-soft disabled:opacity-40'
        >
          Save
        </button>
        <button
          type='button'
          disabled={busy || archived}
          onClick={() => {
            void (async () => {
              if (!window.confirm('Archive this promotion? It will disappear from the public site.')) return;
              setBusy(true);
              const r = await postOffer({ id: row.id, archive: true });
              setBusy(false);
              if (!r.ok) {
                onError(r.error);
                return;
              }
              setArchived(true);
              setActive(false);
              onSaved?.();
              onOk('Archived.');
            })();
          }}
          className='rounded border border-rose-500/40 px-3 py-1.5 text-xs font-bold uppercase text-rose-300 disabled:opacity-40'
        >
          Archive
        </button>
        <button
          type='button'
          disabled={busy || !archived}
          onClick={() => {
            void (async () => {
              setBusy(true);
              const r = await postOffer({ id: row.id, restore: true });
              setBusy(false);
              if (!r.ok) {
                onError(r.error);
                return;
              }
              setArchived(false);
              setActive(true);
              onSaved?.();
              onOk('Restored.');
            })();
          }}
          className='rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-bold uppercase text-emerald-300 disabled:opacity-40'
        >
          Restore
        </button>
      </div>
    </li>
  );
}
