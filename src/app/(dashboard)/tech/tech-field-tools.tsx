'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { computeBookingPricing } from '@/lib/booking-pricing';
import { safePriceCentsForDisplay } from '@/lib/safe-price-resolver';
import { UI_VEHICLE_CLASSES, UI_VEHICLE_LABELS, type UiVehicleClass } from '@/lib/vehicle-pricing';
import type { DealConfig } from '@/lib/site-config';
import { formatOfferDiscountLabel, offerHasDiscount, type SiteDataOfferCard, type PublicSiteDataPayload } from '@/lib/public-site-data';

type ServiceRow = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };
type AddonOpt = { slug: string; label: string; price_cents: number };

type VehicleLine = { serviceSlug: string; vehicleClass: UiVehicleClass; vehicleDescription: string };

const EMPTY_DEALS: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
  promoStacksWithMultiCar: true,
};

const DEFAULT_CHECKLIST_LINES = ['Walk-around inspection', 'Pre-wash photos', 'Interior protection', 'Final QC'];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TechFieldTools({ linkAppointmentId }: { linkAppointmentId?: string | null }) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deals, setDeals] = useState<DealConfig>(EMPTY_DEALS);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [offerId, setOfferId] = useState('');

  const [lines, setLines] = useState<VehicleLine[]>([
    { serviceSlug: '', vehicleClass: 'sedan', vehicleDescription: '' },
  ]);

  const [guestName, setGuestName] = useState('');
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
  const [internalNotes, setInternalNotes] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState(false);
  const [addonOptions, setAddonOptions] = useState<AddonOpt[]>([]);
  const [selectedAddonSlugs, setSelectedAddonSlugs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/public/site-data', { cache: 'no-store', timeoutMs: 12000 })
      .then(async (r) => {
        try {
          return (await r.json()) as PublicSiteDataPayload;
        } catch {
          return null;
        }
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        setDeals(payload.deals ?? EMPTY_DEALS);
        setOffers(Array.isArray(payload.offers) ? payload.offers : []);
      })
      .catch(() => {});

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
        const first = data.services[0]?.slug ?? '';
        setLines((prev) => {
          const head = prev[0] ?? { serviceSlug: '', vehicleClass: 'sedan' as UiVehicleClass, vehicleDescription: '' };
          return [{ ...head, serviceSlug: first || head.serviceSlug }];
        });
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

  const clientBreakdown = useMemo(() => {
    if (!services.length || !lines.length) return null;
    const vehicleLineCents: number[] = [];
    for (const ln of lines) {
      if (!ln.serviceSlug || !ln.vehicleDescription.trim()) return null;
      const svc = services.find((s) => s.slug === ln.serviceSlug);
      if (!svc) return null;
      const cents = safePriceCentsForDisplay({ slug: svc.slug, serviceId: svc.id }, ln.vehicleClass, prices);
      if (cents == null || cents < 1) return null;
      vehicleLineCents.push(cents);
    }
    let addonSum = 0;
    for (const slug of selectedAddonSlugs) {
      const o = addonOptions.find((x) => x.slug === slug);
      if (o?.price_cents) addonSum += o.price_cents;
    }
    const sel = offers.find((o) => o.id === offerId);
    const claimed =
      sel && sel.active && offerHasDiscount(sel)
        ? {
            percent: sel.discountKind === 'percent' ? sel.discountPercent : 0,
            fixedCents: sel.discountKind === 'fixed' ? (sel.discountFixedCents ?? 0) : 0,
            stackableWithSitePromo: sel.stackable,
          }
        : null;
    const bd = computeBookingPricing({
      vehicleLineCents,
      addOnCentsSum: addonSum,
      deals,
      claimedOffer: claimed,
      depositPercent: 30,
    });
    if ('kind' in bd) return null;
    const fieldTotal = bd.finalTotalCents;
    return { bd, fieldPayCents: fieldTotal, addonSum };
  }, [services, prices, lines, selectedAddonSlugs, addonOptions, deals, offers, offerId]);

  const updateLine = (idx: number, patch: Partial<VehicleLine>) => {
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addVehicleLine = () => {
    setLines((prev) => {
      if (prev.length >= 3) return prev;
      const slug = services[0]?.slug ?? prev[0]?.serviceSlug ?? '';
      return [...prev, { serviceSlug: slug, vehicleClass: 'sedan', vehicleDescription: '' }];
    });
  };

  const removeLine = (idx: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const createInvoice = useCallback(async () => {
    if (!clientBreakdown || clientBreakdown.fieldPayCents < 500) {
      setMsg('Complete every vehicle line (description required) and ensure the catalog price is valid (minimum $5 total).');
      return;
    }
    const name = guestName.trim();
    const email = customerEmail.trim().toLowerCase();
    if (!name || !email) {
      setMsg('Customer name and email are required for field invoicing.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const vehicles = lines
        .filter((l) => l.serviceSlug && l.vehicleDescription.trim())
        .map((l) => ({
          serviceSlug: l.serviceSlug.trim(),
          vehicleClass: l.vehicleClass,
          vehicleDescription: l.vehicleDescription.trim(),
        }));
      const res = await fetchWithTimeout('/api/tech/field-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicles,
          addOns: selectedAddonSlugs,
          offerId: offerId || undefined,
          guestName: name,
          guestEmail: email,
          guestPhone: customerPhone,
          notes: [beforeNotes, afterNotes, upsell].filter(Boolean).join('\n') || undefined,
        }),
        credentials: 'same-origin',
        timeoutMs: 60000,
      });
      const j = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        code?: string;
        breakdown?: { depositCents?: number; finalTotalCents?: number };
      };
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
  }, [
    clientBreakdown,
    lines,
    selectedAddonSlugs,
    offerId,
    guestName,
    customerEmail,
    customerPhone,
    beforeNotes,
    afterNotes,
    upsell,
  ]);

  const startTimer = useCallback(async () => {
    setTimerBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          label: services.find((s) => s.slug === lines[0]?.serviceSlug)?.title ?? 'Job',
          appointmentId: linkAppointmentId ?? undefined,
        }),
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
  }, [services, lines, linkAppointmentId]);

  const stopTimer = useCallback(async () => {
    if (!timerId) return;
    const frozenMs =
      timerStartedAt != null ? Math.max(0, Date.now() - new Date(timerStartedAt).getTime()) : elapsedTime;
    setTimerEndedAt(new Date().toISOString());
    setElapsedTime(frozenMs);
    setTimerBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          timerId,
          appointmentId: linkAppointmentId ?? undefined,
        }),
        credentials: 'same-origin',
        timeoutMs: 20000,
      });
      const j = (await res.json().catch(() => ({}))) as { durationSeconds?: number; error?: string };
      if (!res.ok) {
        setMsg(j.error ?? 'Timer stop failed.');
        setTimerEndedAt(null);
        return;
      }
      const finalMs = typeof j.durationSeconds === 'number' ? j.durationSeconds * 1000 : frozenMs;
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
  }, [timerId, timerStartedAt, elapsedTime, linkAppointmentId]);

  const saveNotes = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout('/api/tech/job-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: linkAppointmentId ?? undefined,
          checklist: checklistText.split('\n').map((s) => s.trim()).filter(Boolean),
          beforeNotes,
          afterNotes,
          upsellSuggestions: upsell,
          internalNotes,
          damageNotes,
          customerVisible: customerVisibleNotes,
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
  }, [checklistText, beforeNotes, afterNotes, upsell, internalNotes, damageNotes, customerVisibleNotes, linkAppointmentId]);

  if (!loaded) {
    return <p className='text-sm text-zinc-500'>Loading field tools…</p>;
  }

  if (!services.length) {
    return (
      <p className='text-sm text-amber-200'>Catalog unavailable — field invoice and pricing need services in Supabase.</p>
    );
  }

  const bd = clientBreakdown?.bd;

  return (
    <div className='space-y-6'>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Field invoice (Stripe)</p>
        <p className='mt-2 text-xs text-zinc-500'>
          Same pricing engine as online booking (multi-car, add-ons, sitewide + offer deals). Customer pays the full quoted total at
          checkout, then continues to intake.
        </p>
        {linkAppointmentId ? (
          <p className='mt-2 text-[10px] text-emerald-300/90'>
            Timer / notes below will link to your active assignment when supported by the database.
          </p>
        ) : (
          <p className='mt-2 text-[10px] text-zinc-600'>Start a job from assignments above to link timers and notes to that appointment.</p>
        )}

        <div className='mt-4 space-y-4'>
          {lines.map((line, idx) => (
            <div key={idx} className='rounded-xl border border-white/10 bg-black/30 p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-[10px] font-bold uppercase tracking-wider text-zinc-500'>Vehicle {idx + 1}</p>
                {lines.length > 1 ? (
                  <button type='button' onClick={() => removeLine(idx)} className='text-[10px] text-red-300 underline'>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className='mt-2 grid gap-3 sm:grid-cols-2'>
                <label className='block text-xs text-zinc-400'>
                  Service
                  <select
                    value={line.serviceSlug}
                    onChange={(e) => updateLine(idx, { serviceSlug: e.target.value })}
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
                    value={line.vehicleClass}
                    onChange={(e) => updateLine(idx, { vehicleClass: e.target.value as UiVehicleClass })}
                    className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                  >
                    {UI_VEHICLE_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {UI_VEHICLE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='block text-xs text-zinc-400 sm:col-span-2'>
                  Year / make / model / color (required)
                  <input
                    value={line.vehicleDescription}
                    onChange={(e) => updateLine(idx, { vehicleDescription: e.target.value })}
                    className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                    placeholder='e.g. 2021 Tesla Model 3 white'
                  />
                </label>
              </div>
            </div>
          ))}
          {lines.length < 3 ? (
            <button
              type='button'
              onClick={addVehicleLine}
              className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'
            >
              + Add vehicle (max 3)
            </button>
          ) : null}
        </div>

        <div className='mt-4 grid gap-3 sm:grid-cols-2'>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Active offer (optional)
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            >
              <option value=''>No offer</option>
              {offers
                .filter((o) => o.active && !o.archived && offerHasDiscount(o))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} ({formatOfferDiscountLabel(o) || '—'})
                  </option>
                ))}
            </select>
          </label>

          <div className='sm:col-span-2'>
            <p className='text-xs font-bold uppercase text-zinc-500'>Add-ons</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              {addonOptions.length === 0 ? (
                <span className='text-xs text-zinc-600'>No active add-ons in catalog.</span>
              ) : null}
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
                    {o.label} {o.price_cents > 0 ? `+${formatMoney(o.price_cents)}` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Customer full name *
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Customer email *
            <input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              type='email'
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Customer phone *
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
        </div>

        {bd ? (
          <div className='mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-300'>
            <p className='font-bold uppercase tracking-wider text-gold-soft'>Quote breakdown (matches booking engine)</p>
            <ul className='mt-2 space-y-1 font-mono text-[11px] text-zinc-400'>
              <li>Vehicle subtotal · {formatMoney(bd.vehicleSubtotalCents)}</li>
              {bd.multiCarDiscountCents > 0 ? <li>Multi-car discount · −{formatMoney(bd.multiCarDiscountCents)}</li> : null}
              <li>Add-ons · +{formatMoney(bd.addOnSubtotalCents)}</li>
              {bd.offerDiscountCents > 0 ? <li>Offer discount · −{formatMoney(bd.offerDiscountCents)}</li> : null}
              {bd.websitePromoDiscountCents > 0 ? (
                <li>Sitewide promo · −{formatMoney(bd.websitePromoDiscountCents)}</li>
              ) : null}
              <li className='text-gold-soft'>Quoted total · {formatMoney(bd.finalTotalCents)}</li>
              <li className='text-emerald-300/90'>Stripe field invoice (100%) · {formatMoney(bd.finalTotalCents)}</li>
            </ul>
          </div>
        ) : (
          <p className='mt-3 text-sm text-amber-200'>
            Enter vehicle descriptions and valid service/class rows to see the live breakdown.
          </p>
        )}

        <button
          type='button'
          disabled={busy || !clientBreakdown}
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
          <textarea
            value={beforeNotes}
            onChange={(e) => setBeforeNotes(e.target.value)}
            rows={3}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='mt-2 block text-xs text-zinc-400'>
          After notes
          <textarea
            value={afterNotes}
            onChange={(e) => setAfterNotes(e.target.value)}
            rows={3}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='mt-2 block text-xs text-zinc-400'>
          Upsell suggestions
          <textarea
            value={upsell}
            onChange={(e) => setUpsell(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='mt-2 block text-xs text-rose-300/90'>
          Damage notes (condition / paint)
          <textarea
            value={damageNotes}
            onChange={(e) => setDamageNotes(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded-lg border border-rose-900/40 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='mt-2 block text-xs text-amber-200/90'>
          Internal notes (shop only)
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className='mt-1 w-full rounded-lg border border-amber-900/40 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='mt-2 flex items-center gap-2 text-xs text-zinc-400'>
          <input type='checkbox' checked={customerVisibleNotes} onChange={(e) => setCustomerVisibleNotes(e.target.checked)} />
          Share before/after/upsell/damage summary with customer-facing views when supported
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
