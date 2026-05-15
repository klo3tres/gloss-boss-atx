'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safePriceCentsForDisplay } from '@/lib/safe-price-resolver';
import { UI_VEHICLE_CLASSES, UI_VEHICLE_LABELS, type UiVehicleClass } from '@/lib/vehicle-pricing';

type ServiceRow = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };
type AddonOpt = { slug: string; label: string; price_cents: number };
type VehicleClass = UiVehicleClass;

const DEFAULT_CHECKLIST_LINES = ['Walk-around inspection', 'Pre-wash photos', 'Interior protection', 'Final QC'];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function TechFieldTools() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [serviceSlug, setServiceSlug] = useState('');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('sedan');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [timerId, setTimerId] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerEndedAt, setTimerEndedAt] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerBusy, setTimerBusy] = useState(false);

  const [checklistText, setChecklistText] = useState(() => DEFAULT_CHECKLIST_LINES.join('\n'));
  const [beforeNotes, setBeforeNotes] = useState('');
  const [afterNotes, setAfterNotes] = useState('');
  const [upsell, setUpsell] = useState('');
  const [addonOptions, setAddonOptions] = useState<AddonOpt[]>([]);
  const [selectedAddonSlugs, setSelectedAddonSlugs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/services', { cache: 'no-store', timeoutMs: 12000 })
      .then(async (r) => {
        try {
          return (await r.json()) as { services?: ServiceRow[]; prices?: PriceRow[] };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data?.services?.length) return;
        setServices(data.services);
        setPrices(data.prices ?? []);
        setServiceSlug(data.services[0]?.slug ?? '');
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    void fetchWithTimeout('/api/public/addons', { cache: 'no-store', timeoutMs: 12000 })
      .then(async (r) => {
        try {
          return (await r.json()) as { addons?: { slug?: string; label?: string; price_cents?: number }[] };
        } catch {
          return null;
        }
      })
      .then((ad) => {
        if (cancelled || !ad?.addons) return;
        const opts: AddonOpt[] = [];
        for (const a of ad.addons) {
          const label = String(a.label ?? '').trim();
          const slug = String(a.slug ?? '').trim().toLowerCase() || label.toLowerCase().replace(/\s+/g, '-');
          const cents = typeof a.price_cents === 'number' && a.price_cents > 0 ? a.price_cents : 0;
          if (label) opts.push({ slug, label, price_cents: cents });
        }
        setAddonOptions(opts);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!timerStartedAt || timerEndedAt) return;
    const startMs = new Date(timerStartedAt).getTime();
    const tick = () => setElapsedTime(Math.max(0, Date.now() - startMs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerStartedAt, timerEndedAt]);

  const timerIsLive = Boolean(timerStartedAt && !timerEndedAt);
  const selected = useMemo(() => services.find((s) => s.slug === serviceSlug), [services, serviceSlug]);

  const priceCents = useMemo(() => {
    if (!selected) return null;
    return safePriceCentsForDisplay({ slug: selected.slug, serviceId: selected.id }, vehicleClass, prices);
  }, [selected, prices, vehicleClass]);

  const addonSumCents = useMemo(() => {
    let s = 0;
    for (const slug of selectedAddonSlugs) {
      const o = addonOptions.find((x) => x.slug === slug);
      if (o?.price_cents) s += o.price_cents;
    }
    return s;
  }, [selectedAddonSlugs, addonOptions]);

  const invoiceTotalCents = priceCents != null ? priceCents + addonSumCents : null;

  const createInvoice = useCallback(async () => {
    if (!selected || invoiceTotalCents == null || invoiceTotalCents < 500) {
      setMsg('Pick a service with a valid price (minimum $5 total).');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const addonBit =
        selectedAddonSlugs.length > 0
          ? ` — ${selectedAddonSlugs.map((s) => addonOptions.find((a) => a.slug === s)?.label ?? s).join(', ')}`
          : '';
      const res = await fetchWithTimeout('/api/tech/field-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: invoiceTotalCents,
          serviceTitle: `${selected.title}${addonBit}`.slice(0, 120),
          serviceSlug: selected.slug,
          vehicleClass,
          customerEmail,
          customerPhone,
        }),
        credentials: 'same-origin',
        timeoutMs: 60000,
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setMsg(j.error ?? 'Could not create payment link.');
        return;
      }
      window.location.href = j.url;
    } catch {
      setMsg('Network error creating checkout.');
    } finally {
      setBusy(false);
    }
  }, [selected, invoiceTotalCents, vehicleClass, customerEmail, customerPhone, selectedAddonSlugs, addonOptions]);

  const startTimer = useCallback(async () => {
    setTimerBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', label: selected?.title ?? 'Job' }),
        credentials: 'same-origin',
        timeoutMs: 20000,
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; startedAt?: string; error?: string };
      if (!res.ok || !j.id) {
        setMsg(j.error ?? 'Timer start failed.');
        return;
      }
      setTimerId(j.id);
      setTimerStartedAt(j.startedAt ?? new Date().toISOString());
      setTimerEndedAt(null);
      setElapsedTime(0);
      setMsg('Timer running on server.');
    } catch {
      setMsg('Timer start failed (network).');
    } finally {
      setTimerBusy(false);
    }
  }, [selected?.title]);

  const stopTimer = useCallback(async () => {
    if (!timerId) return;
    const frozenMs =
      timerStartedAt != null
        ? Math.max(0, Date.now() - new Date(timerStartedAt).getTime())
        : elapsedTime;
    setTimerEndedAt(new Date().toISOString());
    setElapsedTime(frozenMs);
    setTimerBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', timerId }),
        credentials: 'same-origin',
        timeoutMs: 20000,
      });
      const j = (await res.json().catch(() => ({}))) as { durationSeconds?: number; error?: string };
      if (!res.ok) {
        setMsg(j.error ?? 'Timer stop failed.');
        setTimerEndedAt(null);
        return;
      }
      const finalMs =
        typeof j.durationSeconds === 'number' ? j.durationSeconds * 1000 : frozenMs;
      setElapsedTime(finalMs);
      setTimerId(null);
      setMsg(
        typeof j.durationSeconds === 'number'
          ? `Timer saved: ${formatDuration(finalMs)} on job record.`
          : `Timer stopped: ${formatDuration(finalMs)}.`,
      );
    } catch {
      setMsg('Timer stop failed (network).');
      setTimerEndedAt(null);
    } finally {
      setTimerBusy(false);
    }
  }, [timerId, timerStartedAt, elapsedTime]);

  const saveNotes = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: checklistText.split('\n').map((s) => s.trim()).filter(Boolean),
          beforeNotes,
          afterNotes,
          upsellSuggestions: upsell,
        }),
        credentials: 'same-origin',
        timeoutMs: 20000,
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setMsg(j.error ?? 'Could not save notes.');
        return;
      }
      setMsg('Job notes saved.');
    } catch {
      setMsg('Notes save failed (network).');
    } finally {
      setBusy(false);
    }
  }, [checklistText, beforeNotes, afterNotes, upsell]);

  if (!loaded) {
    return <p className='text-sm text-zinc-500'>Loading field tools…</p>;
  }

  if (!services.length) {
    return <p className='text-sm text-amber-200'>Catalog unavailable — field invoice and pricing need services in Supabase.</p>;
  }

  return (
    <div className='space-y-6'>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Field invoice (Stripe)</p>
        <p className='mt-2 text-xs text-zinc-500'>Uses the same catalog as online booking. Sends a one-time Checkout link.</p>
        <div className='mt-4 grid gap-3 sm:grid-cols-2'>
          <label className='block text-xs text-zinc-400'>
            Service
            <select
              value={serviceSlug}
              onChange={(e) => setServiceSlug(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            >
              {services.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className='block text-xs text-zinc-400'>
            Vehicle class
            <select
              value={vehicleClass}
              onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            >
              {UI_VEHICLE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {UI_VEHICLE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <div className='sm:col-span-2'>
            <p className='text-xs font-bold uppercase text-zinc-500'>Add-ons</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              {addonOptions.length === 0 ? <span className='text-xs text-zinc-600'>No active add-ons in catalog.</span> : null}
              {addonOptions.map((o) => {
                const on = selectedAddonSlugs.includes(o.slug);
                return (
                  <button
                    key={o.slug}
                    type='button'
                    onClick={() =>
                      setSelectedAddonSlugs((prev) => (prev.includes(o.slug) ? prev.filter((x) => x !== o.slug) : [...prev, o.slug]))
                    }
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-[11px] font-semibold',
                      on ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/15 text-zinc-400',
                    )}
                  >
                    {o.label} {o.price_cents > 0 ? `+$${(o.price_cents / 100).toFixed(0)}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Customer email (optional)
            <input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              type='email'
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Customer phone
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
        </div>
        <p className='mt-3 text-sm text-gold-soft'>
          Quoted total:{' '}
          {invoiceTotalCents != null ? (
            <>
              ${(invoiceTotalCents / 100).toFixed(2)}
              {addonSumCents > 0 ? (
                <span className='ml-2 text-xs text-zinc-500'>
                  (service ${(priceCents! / 100).toFixed(2)} + add-ons ${(addonSumCents / 100).toFixed(2)})
                </span>
              ) : null}
            </>
          ) : (
            'No price row for this vehicle class — pick another class or add prices in Admin.'
          )}
        </p>
        <button
          type='button'
          disabled={busy || invoiceTotalCents == null}
          onClick={() => void createInvoice()}
          className='mt-4 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
        >
          {busy ? 'Working…' : 'Create Stripe payment link'}
        </button>
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Live job timer</p>
        {timerIsLive ? (
          <p className='mt-3 font-mono text-2xl font-bold tracking-widest text-emerald-300' aria-live='polite'>
            LIVE TIMER: {formatDuration(elapsedTime)}
          </p>
        ) : null}
        {timerStartedAt && timerEndedAt ? (
          <p className='mt-3 font-mono text-lg font-semibold tracking-wider text-zinc-300'>
            FINAL DURATION: {formatDuration(elapsedTime)}
          </p>
        ) : null}
        <div className='mt-3 flex flex-wrap gap-2'>
          <button
            type='button'
            disabled={timerBusy || !!timerId}
            onClick={() => void startTimer()}
            className='rounded-lg border border-emerald-500/40 px-4 py-2 text-xs font-bold uppercase text-emerald-300 disabled:opacity-40'
          >
            Start
          </button>
          <button
            type='button'
            disabled={timerBusy || !timerId}
            onClick={() => void stopTimer()}
            className='rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-40'
          >
            Stop & save
          </button>
        </div>
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Job notes</p>
        <label className='mt-3 block text-xs text-zinc-400'>
          Checklist (one item per line)
          <textarea
            value={checklistText}
            onChange={(e) => setChecklistText(e.target.value)}
            rows={5}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
          />
        </label>
        <label className='mt-4 block text-xs text-zinc-400'>
          Before notes
          <textarea value={beforeNotes} onChange={(e) => setBeforeNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
        </label>
        <label className='mt-2 block text-xs text-zinc-400'>
          After notes
          <textarea value={afterNotes} onChange={(e) => setAfterNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
        </label>
        <label className='mt-2 block text-xs text-zinc-400'>
          Upsell suggestions
          <textarea value={upsell} onChange={(e) => setUpsell(e.target.value)} rows={2} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
        </label>
        <button
          type='button'
          disabled={busy}
          onClick={() => void saveNotes()}
          className='mt-4 rounded-lg border border-gold/40 px-4 py-2 text-xs font-bold uppercase text-gold-soft disabled:opacity-40'
        >
          Save notes
        </button>
      </section>

      {msg ? <p className='text-xs text-amber-200'>{msg}</p> : null}
    </div>
  );
}
