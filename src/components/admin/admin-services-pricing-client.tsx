'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyCanonicalPriceSheetAction,
  updateServiceActiveAction,
  updateServicePriceCentsAction,
  type SavedPriceRow,
} from '@/app/(dashboard)/admin/service-pricing-actions';
import { adminDisplayTitleForSlug, CERAMIC_COATING_SLUG } from '@/lib/admin/canonical-services';

type ServiceMeta = { id: string; slug: string; title: string; active: boolean };
type PriceRow = SavedPriceRow;

export function AdminServicesPricingClient({
  initialRows,
  servicesMeta,
  hasServiceRole,
}: {
  initialRows: PriceRow[];
  servicesMeta: ServiceMeta[];
  hasServiceRole: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; detail?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) {
        setMsg({ tone: 'err', text: res.error ?? 'Action failed', detail: JSON.stringify((res as { debug?: unknown }).debug ?? null) });
        return;
      }
      setMsg({
        tone: 'ok',
        text: 'Saved — verified in database.',
        detail: res.data ? JSON.stringify(res.data, null, 2) : undefined,
      });
      router.refresh();
    });
  };

  return (
    <div className='space-y-4'>
      {!hasServiceRole ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100'>
          SUPABASE_SERVICE_ROLE_KEY missing. Cannot save admin pricing.
        </p>
      ) : null}

      {msg ? (
        <div
          className={`rounded-lg border p-4 text-sm ${msg.tone === 'ok' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' : 'border-red-500/35 bg-red-500/10 text-red-100'}`}
        >
          <p>{msg.text}</p>
          {msg.detail ? (
            <pre className='mt-2 max-h-40 overflow-auto text-[10px] text-zinc-400'>{msg.detail}</pre>
          ) : null}
        </div>
      ) : null}

      <button
        type='button'
        disabled={pending || !hasServiceRole}
        onClick={() =>
          run(async () => {
            const res = await applyCanonicalPriceSheetAction();
            if (res.ok && res.data?.rows) {
              setRows(res.data.rows);
            }
            return res;
          })
        }
        className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft disabled:opacity-50'
      >
        Apply default price sheet
      </button>

      {servicesMeta.length > 0 ? (
        <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Service visibility</p>
          <ul className='mt-3 space-y-2'>
            {servicesMeta.map((s) => (
              <li key={s.id} className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2'>
                <span className='text-sm font-semibold text-white'>
                  {s.title} <span className='text-zinc-500'>({s.slug})</span>
                </span>
                <button
                  type='button'
                  disabled={pending || !hasServiceRole}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set('serviceId', s.id);
                    fd.set('active', s.active ? 'false' : 'true');
                    run(() => updateServiceActiveAction(fd));
                  }}
                  className='text-xs font-bold uppercase text-gold-soft'
                >
                  {s.active ? 'Deactivate' : 'Activate'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className='space-y-4'>
        {rows.map((row) => {
          const title = adminDisplayTitleForSlug(row.slug);
          const isCeramic = row.slug === CERAMIC_COATING_SLUG;
          const showQuote = isCeramic && row.price_cents <= 0;
          const live = rows.find((r) => r.id === row.id) ?? row;
          return (
            <article key={row.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-4 sm:p-5'>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <p className='text-xs uppercase tracking-widest text-gold-soft'>{row.slug}</p>
                  <p className='text-lg font-bold text-white'>{title}</p>
                  <p className='text-sm text-zinc-400'>
                    {row.vehicle_class === 'truck' ? 'Truck' : row.vehicle_class === 'suv' ? 'SUV' : 'Sedan'}
                  </p>
                  <p className='mt-1 font-mono text-xs text-emerald-300/90'>
                    DB: ${(live.price_cents / 100).toFixed(2)} · id {row.id.slice(0, 8)}…
                  </p>
                </div>
                <PriceSaveForm
                  row={row}
                  showQuote={showQuote}
                  disabled={pending || !hasServiceRole}
                  onSave={(dollars) => {
                    const fd = new FormData();
                    fd.set('priceId', row.id);
                    fd.set('priceDollars', dollars);
                    return updateServicePriceCentsAction(fd).then((res) => {
                      if (res.ok) {
                        setRows((prev) =>
                          prev.map((r) =>
                            res.data.syncedRowIds.includes(r.id) || r.id === row.id
                              ? { ...r, price_cents: res.data.savedCents }
                              : r,
                          ),
                        );
                      }
                      return res;
                    });
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PriceSaveForm({
  row,
  showQuote,
  disabled,
  onSave,
}: {
  row: PriceRow;
  showQuote: boolean;
  disabled: boolean;
  onSave: (dollars: string) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
}) {
  const [value, setValue] = useState(row.price_cents > 0 ? (row.price_cents / 100).toFixed(2) : '');

  return (
    <div className='flex flex-wrap items-end gap-2'>
      <label className='text-xs text-zinc-400'>
        Price (USD){showQuote ? ' (optional)' : ''}
        <input
          type='number'
          step='0.01'
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={showQuote ? 'Quote' : ''}
          className='mt-1 block w-32 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <button
        type='button'
        disabled={disabled}
        onClick={() => onSave(value)}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50'
      >
        Save
      </button>
    </div>
  );
}
