'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

type VehicleRow = {
  year: string;
  make: string;
  model: string;
  description: string;
  color: string;
  service: string;
  vehicleClass: string;
  priceCents: number | null;
};

const emptyRow = (defaults: { service: string; vehicleClass: string }): VehicleRow => ({
  year: '',
  make: '',
  model: '',
  description: '',
  color: '',
  service: defaults.service,
  vehicleClass: defaults.vehicleClass,
  priceCents: null,
});

type ServiceOption = { slug: string; name: string; prices: Record<string, number> };

export function WorkOrderVehiclesForm({
  id,
  source,
  initialVehicles,
  defaultService,
  defaultClass,
  saveAction,
}: {
  id: string;
  source: string;
  initialVehicles: VehicleRow[];
  defaultService: string;
  defaultClass: string;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const defaults = { service: defaultService, vehicleClass: defaultClass };
  const [rows, setRows] = useState<VehicleRow[]>(
    initialVehicles.length ? initialVehicles : [emptyRow(defaults)],
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<ServiceOption[]>([]);

  useEffect(() => {
    if (initialVehicles.length > 0) {
      setRows(initialVehicles);
    }
  }, [initialVehicles]);

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then((j) => {
        const services = Array.isArray(j.services) ? j.services : [];
        const prices = Array.isArray(j.prices) ? j.prices : [];
        const bySlug: ServiceOption[] = services.map((s: { slug: string; name: string }) => {
          const slug = String(s.slug);
          const map: Record<string, number> = {};
          for (const p of prices) {
            if (String((p as { service_slug?: string }).service_slug) === slug) {
              const cls = String((p as { vehicle_class?: string }).vehicle_class ?? 'sedan');
              map[cls] = Number((p as { price_cents?: number }).price_cents) || 0;
            }
          }
          return { slug, name: String(s.name ?? slug), prices: map };
        });
        setCatalog(bySlug);
      })
      .catch(() => {});
  }, []);

  const estimatedTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.priceCents ?? 0), 0),
    [rows],
  );

  function quoteForRow(row: VehicleRow): number | null {
    const opt = catalog.find((c) => c.slug === row.service);
    if (!opt) return row.priceCents;
    const cents = opt.prices[row.vehicleClass] ?? opt.prices.sedan ?? Object.values(opt.prices)[0];
    return typeof cents === 'number' && cents > 0 ? cents : row.priceCents;
  }

  function applyServicePrice(index: number, service: string, vehicleClass: string) {
    const opt = catalog.find((c) => c.slug === service);
    const cents = opt ? opt.prices[vehicleClass] ?? opt.prices.sedan ?? Object.values(opt.prices)[0] : null;
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              service,
              vehicleClass,
              priceCents: typeof cents === 'number' && cents > 0 ? cents : r.priceCents,
            }
          : r,
      ),
    );
  }

  return (
    <form action={saveAction} className='space-y-4'>
      <input type='hidden' name='id' value={id} />
      <input type='hidden' name='source' value={source} />

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Vehicles</p>
        <p className='font-mono text-sm text-gold-soft'>
          Est. total {estimatedTotal > 0 ? `$${(estimatedTotal / 100).toFixed(2)}` : '—'}
        </p>
      </div>

      <div className='space-y-3'>
        {rows.map((v, i) => {
          const livePrice = quoteForRow(v);
          const isEditing = editing === i;
          return (
            <article key={i} className='rounded-2xl border border-white/10 bg-zinc-950/80 p-4'>
              {!isEditing ? (
                <>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div>
                      <p className='text-lg font-bold text-white'>
                        {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.description || `Vehicle ${i + 1}`}
                      </p>
                      <p className='text-sm text-zinc-400'>{v.color || 'Color —'}</p>
                      <p className='mt-1 text-sm text-gold-soft/90'>
                        {v.service.replace(/-/g, ' ')} · {v.vehicleClass}
                      </p>
                      <p className='mt-1 font-mono text-sm text-white'>
                        {livePrice != null && livePrice > 0 ? `$${(livePrice / 100).toFixed(2)}` : 'Price —'}
                      </p>
                    </div>
                    <div className='flex gap-2'>
                      <button
                        type='button'
                        onClick={() => setEditing(i)}
                        className='inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-zinc-200'
                      >
                        <Pencil className='h-3 w-3' /> Edit
                      </button>
                      <button
                        type='button'
                        onClick={() => setRows((r) => (r.length <= 1 ? r : r.filter((_, idx) => idx !== i)))}
                        className='inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 text-[10px] font-black uppercase text-red-200'
                      >
                        <Trash2 className='h-3 w-3' /> Delete
                      </button>
                    </div>
                  </div>
                  <input type='hidden' name='vehicleYear' value={v.year} />
                  <input type='hidden' name='vehicleMake' value={v.make} />
                  <input type='hidden' name='vehicleModel' value={v.model} />
                  <input type='hidden' name='vehicleDescription' value={v.description || [v.year, v.make, v.model].filter(Boolean).join(' ')} />
                  <input type='hidden' name='vehicleColor' value={v.color} />
                  <input type='hidden' name='vehicleService' value={v.service} />
                  <input type='hidden' name='vehicleClass' value={v.vehicleClass} />
                  <input type='hidden' name='vehiclePriceCents' value={String(livePrice ?? 0)} />
                </>
              ) : (
                <div className='grid gap-2 sm:grid-cols-3'>
                  <input
                    value={v.year}
                    onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, year: e.target.value } : x)))}
                    placeholder='Year'
                    className='gb-input'
                  />
                  <input
                    value={v.make}
                    onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, make: e.target.value } : x)))}
                    placeholder='Make'
                    className='gb-input'
                  />
                  <input
                    value={v.model}
                    onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, model: e.target.value } : x)))}
                    placeholder='Model'
                    className='gb-input'
                  />
                  <input
                    value={v.color}
                    onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, color: e.target.value } : x)))}
                    placeholder='Color'
                    className='gb-input'
                  />
                  <select
                    value={v.service}
                    onChange={(e) => applyServicePrice(i, e.target.value, v.vehicleClass)}
                    className='gb-input'
                  >
                    {catalog.length === 0 ? <option value={v.service}>{v.service}</option> : null}
                    {catalog.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={v.vehicleClass}
                    onChange={(e) => applyServicePrice(i, v.service, e.target.value)}
                    className='gb-input'
                  >
                    {['sedan', 'suv', 'truck'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <p className='sm:col-span-3 font-mono text-sm text-gold-soft'>
                    Live price: {livePrice != null && livePrice > 0 ? `$${(livePrice / 100).toFixed(2)}` : '—'}
                  </p>
                  <button type='button' onClick={() => setEditing(null)} className='text-xs font-bold uppercase text-gold-soft'>
                    Done editing
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <button
        type='button'
        onClick={() => setRows((r) => [...r, emptyRow(defaults)])}
        className='w-full rounded-2xl border border-dashed border-gold/35 py-3 text-xs font-black uppercase text-gold-soft'
      >
        + Add vehicle
      </button>
      <button type='submit' className='w-full rounded-2xl bg-gold py-3 text-xs font-black uppercase text-black'>
        Save vehicles & update total
      </button>
    </form>
  );
}
