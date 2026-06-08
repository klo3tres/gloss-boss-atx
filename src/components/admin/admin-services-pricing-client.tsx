'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyCanonicalPriceSheetAction,
  updateServiceMetaAction,
  updateServicePriceCentsAction,
  type SavedPriceRow,
} from '@/app/(dashboard)/admin/service-pricing-actions';
import { adminDisplayTitleForSlug, CERAMIC_COATING_SLUG } from '@/lib/admin/canonical-services';

type ServiceMeta = {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  estimated_min_minutes: number | null;
  estimated_max_minutes: number | null;
  coming_soon: boolean | null;
  quote_required: boolean | null;
  public_description: string | null;
  admin_notes: string | null;
  inclusions: string[] | null;
};
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
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Service setup</p>
          <p className='mt-1 text-xs text-zinc-400'>Controls booking visibility, duration blocking, public service copy, and package inclusions.</p>
          <div className='mt-4 grid gap-4'>
            {servicesMeta.map((s) => (
              <ServiceMetaForm key={s.id} service={s} disabled={pending || !hasServiceRole} onSave={(fd) => run(() => updateServiceMetaAction(fd))} />
            ))}
          </div>
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

function ServiceMetaForm({
  service,
  disabled,
  onSave,
}: {
  service: ServiceMeta;
  disabled: boolean;
  onSave: (formData: FormData) => void;
}) {
  const [active, setActive] = useState(Boolean(service.active));
  const [comingSoon, setComingSoon] = useState(Boolean(service.coming_soon));
  const [quoteRequired, setQuoteRequired] = useState(Boolean(service.quote_required));
  const [minMinutes, setMinMinutes] = useState(service.estimated_min_minutes ? String(service.estimated_min_minutes) : '');
  const [maxMinutes, setMaxMinutes] = useState(service.estimated_max_minutes ? String(service.estimated_max_minutes) : '');
  const [publicDescription, setPublicDescription] = useState(service.public_description ?? '');
  const [adminNotes, setAdminNotes] = useState(service.admin_notes ?? '');
  const [inclusions, setInclusions] = useState((service.inclusions ?? []).join('\n'));

  return (
    <article className='rounded-xl border border-white/10 bg-black/40 p-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <p className='text-sm font-semibold text-white'>
            {service.title} <span className='text-zinc-500'>({service.slug})</span>
          </p>
          <p className='mt-1 text-xs text-zinc-500'>Duration is used to block late booking times before checkout.</p>
        </div>
        <button
          type='button'
          disabled={disabled}
          onClick={() => setActive((value) => !value)}
          className='text-xs font-bold uppercase text-gold-soft'
        >
          {active ? 'Set inactive' : 'Set active'}
        </button>
      </div>

      <div className='mt-4 grid gap-3 md:grid-cols-4'>
        <label className='text-xs text-zinc-400'>
          Min minutes
          <input
            type='number'
            min={0}
            value={minMinutes}
            onChange={(e) => setMinMinutes(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='text-xs text-zinc-400'>
          Max minutes
          <input
            type='number'
            min={0}
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(e.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-bold uppercase text-zinc-200'>
          <input type='checkbox' checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <label className='flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-bold uppercase text-zinc-200'>
          <input type='checkbox' checked={comingSoon} onChange={(e) => setComingSoon(e.target.checked)} />
          Coming soon
        </label>
        <label className='flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-bold uppercase text-zinc-200 md:col-span-2'>
          <input type='checkbox' checked={quoteRequired} onChange={(e) => setQuoteRequired(e.target.checked)} />
          Quote required
        </label>
      </div>

      <div className='mt-3 grid gap-3 md:grid-cols-2'>
        <label className='text-xs text-zinc-400'>
          Public description
          <textarea
            value={publicDescription}
            onChange={(e) => setPublicDescription(e.target.value)}
            rows={3}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='text-xs text-zinc-400'>
          Included services (one per line)
          <textarea
            value={inclusions}
            onChange={(e) => setInclusions(e.target.value)}
            rows={3}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='text-xs text-zinc-400 md:col-span-2'>
          Admin notes
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
      </div>

      <button
        type='button'
        disabled={disabled}
        onClick={() => {
          const fd = new FormData();
          fd.set('serviceId', service.id);
          fd.set('active', active ? 'true' : 'false');
          fd.set('comingSoon', comingSoon ? 'true' : 'false');
          fd.set('quoteRequired', quoteRequired ? 'true' : 'false');
          fd.set('estimatedMinMinutes', minMinutes);
          fd.set('estimatedMaxMinutes', maxMinutes);
          fd.set('publicDescription', publicDescription);
          fd.set('adminNotes', adminNotes);
          fd.set('inclusions', inclusions);
          onSave(fd);
        }}
        className='mt-4 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50'
      >
        Save service setup
      </button>
    </article>
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
