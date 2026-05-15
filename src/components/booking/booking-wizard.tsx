'use client';

import clsx from 'clsx';
import { Car, Plus, Sparkles, Trash2, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getLocalFallbackCatalog, mergeServicesWithPricesStable, servicesHaveQuotesForBooking } from '@/lib/catalog-fallback';
import {
  bookingAvailabilityHint,
  DEFAULT_BOOKING_AVAILABILITY,
  isBookingSlotAllowed,
  type BookingAvailabilityRules,
} from '@/lib/booking-availability';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safePriceCentsForDisplay, safePriceResolver } from '@/lib/safe-price-resolver';

const BOOKING_SEED = getLocalFallbackCatalog();

const CATALOG_CACHE_KEY = 'gb_booking_catalog_v1';
const CATALOG_LS_KEY = 'gb_booking_catalog_v1_ls';
const CACHE_TTL_MS = 5 * 60 * 1000;
const LS_CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;
const DEFAULT_ADDON_LABELS = ['Engine bay detail', 'Pet hair removal', 'Odor treatment', 'Clay bar treatment'] as const;

type ServiceRow = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };

type VehicleClass = 'sedan' | 'suv' | 'truck' | 'suv_truck';

type ExtraLine = { serviceSlug: string; vehicleClass: VehicleClass; vehicleDescription: string };

function serviceIcon(slug: string) {
  if (slug.includes('ceramic')) return <Sparkles className='h-6 w-6 text-gold-soft' />;
  if (slug.includes('interior')) return <Car className='h-6 w-6 text-gold-soft' />;
  if (slug.includes('exterior')) return <Truck className='h-6 w-6 text-gold-soft' />;
  return <Sparkles className='h-6 w-6 text-gold-soft' />;
}

function classLabel(c: VehicleClass) {
  if (c === 'sedan') return 'Sedan';
  if (c === 'suv') return 'SUV';
  if (c === 'truck') return 'Truck';
  return 'SUV / Truck';
}

export function BookingWizard() {
  const liveCatalogAppliedRef = useRef(false);
  const [services, setServices] = useState<ServiceRow[]>(() => [...BOOKING_SEED.services]);
  const [prices, setPrices] = useState<PriceRow[]>(() => [...BOOKING_SEED.prices]);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canBookOnline, setCanBookOnline] = useState(false);

  const [serviceSlug, setServiceSlug] = useState(() => BOOKING_SEED.services[0]?.slug ?? '');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('sedan');
  const [scheduledStart, setScheduledStart] = useState('');
  const [bookingRules, setBookingRules] = useState<BookingAvailabilityRules>(DEFAULT_BOOKING_AVAILABILITY);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [extraVehicles, setExtraVehicles] = useState<ExtraLine[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [addonLabels, setAddonLabels] = useState<string[]>(() => [...DEFAULT_ADDON_LABELS]);

  useEffect(() => {
    type CatalogPayload = {
      services: ServiceRow[];
      prices: PriceRow[];
      canBookOnline?: boolean;
      catalogEmpty?: boolean;
      message?: string;
      fallbackCatalog?: boolean;
    };

    const readCache = (): { at: number; payload: CatalogPayload } | null => {
      const tryParse = (raw: string | null): { at: number; payload: CatalogPayload } | null => {
        if (!raw) return null;
        try {
          const p = JSON.parse(raw) as { at: number; payload: CatalogPayload };
          if (!p?.at || !p?.payload?.services?.length) return null;
          return p;
        } catch {
          return null;
        }
      };
      if (typeof sessionStorage !== 'undefined') {
        const s = tryParse(sessionStorage.getItem(CATALOG_CACHE_KEY));
        if (s && Date.now() - s.at <= CACHE_TTL_MS) return s;
      }
      if (typeof localStorage !== 'undefined') {
        const s = tryParse(localStorage.getItem(CATALOG_LS_KEY));
        if (s && Date.now() - s.at <= LS_CACHE_TTL_MS) return s;
      }
      return null;
    };

    const writeCache = (payload: CatalogPayload) => {
      const wrapped = JSON.stringify({ at: Date.now(), payload });
      try {
        sessionStorage.setItem(CATALOG_CACHE_KEY, wrapped);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(CATALOG_LS_KEY, wrapped);
      } catch {
        /* ignore */
      }
    };

    const applyPayload = (data: {
      services?: ServiceRow[];
      prices?: PriceRow[];
      code?: string;
      message?: string;
      live?: boolean;
      canBookOnline?: boolean;
      catalogEmpty?: boolean;
      fallbackCatalog?: boolean;
    }) => {
      const svcList = data.services ?? [];
      const priceList = data.prices ?? [];

      if (svcList.length === 0 || data.catalogEmpty) {
        const fb = getLocalFallbackCatalog();
        setCanBookOnline(servicesHaveQuotesForBooking(fb.services, fb.prices));
        setServices(fb.services);
        setPrices(fb.prices);
        setError(
          data.message ??
            'Showing default packages while the live catalog is unavailable. You can still book when prices are shown below.',
        );
        if (fb.services[0]) setServiceSlug(fb.services[0].slug);
        return;
      }

      if (data.fallbackCatalog) {
        const fb = getLocalFallbackCatalog();
        setCanBookOnline(servicesHaveQuotesForBooking(fb.services, fb.prices));
        setServices(fb.services);
        setPrices(fb.prices);
        setError(data.message ?? 'Showing default packages.');
        if (fb.services[0]) setServiceSlug(fb.services[0].slug);
        return;
      }

      const { services: mergedSvc, prices: mergedPrices } = mergeServicesWithPricesStable(svcList, priceList);
      liveCatalogAppliedRef.current = true;
      const quotesOk = servicesHaveQuotesForBooking(mergedSvc, mergedPrices);
      setCanBookOnline(quotesOk || (mergedSvc.length > 0 && mergedPrices.length > 0));
      setServices(mergedSvc);
      setPrices(mergedPrices);

      if (!quotesOk) {
        setError(data.message ?? 'Some vehicle lines may need a custom quote — check totals before checkout.');
      } else if (data.message && data.canBookOnline === false) {
        setError(data.message);
      } else {
        setError(null);
      }

      if (mergedSvc[0]) setServiceSlug((prev) => (mergedSvc.some((s) => s.slug === prev) ? prev : mergedSvc[0].slug));
    };

    const localFallbackPayload = (): CatalogPayload => {
      const fb = getLocalFallbackCatalog();
      return {
        services: fb.services,
        prices: fb.prices,
        canBookOnline: servicesHaveQuotesForBooking(fb.services, fb.prices),
        catalogEmpty: false,
        fallbackCatalog: true,
        message: 'Could not reach the server in time — showing default packages.',
      };
    };

    const cached = readCache();

    let alive = true;
    setCatalogRefreshing(true);
    const failsafe = window.setTimeout(() => {
      if (!alive) return;
      setCatalogRefreshing(false);
      if (liveCatalogAppliedRef.current) {
        return;
      }
      setServices((prev) => (prev.length ? prev : [...BOOKING_SEED.services]));
      setPrices((prev) => (prev.length ? prev : [...BOOKING_SEED.prices]));
      if (cached?.payload?.services?.length) {
        applyPayload(cached.payload);
        setError((prev) => prev ?? 'Catalog request took too long — showing cached packages.');
      } else {
        applyPayload(localFallbackPayload());
      }
    }, FETCH_TIMEOUT_MS + 1500);

    Promise.all([
      fetchWithTimeout('/api/services', { cache: 'no-store', timeoutMs: FETCH_TIMEOUT_MS }).then(async (r) => {
        try {
          return (await r.json()) as {
            services?: ServiceRow[];
            prices?: PriceRow[];
            code?: string;
            message?: string;
            live?: boolean;
            canBookOnline?: boolean;
            catalogEmpty?: boolean;
            fallbackCatalog?: boolean;
          };
        } catch {
          return {};
        }
      }),
      fetchWithTimeout('/api/public/addons', { cache: 'no-store', timeoutMs: FETCH_TIMEOUT_MS }).then(async (r) =>
        r.ok ? ((await r.json()) as { addons?: { label: string }[] }) : null,
      ),
    ])
      .then(([data, addonsJson]) => {
        if (!alive) return;
        clearTimeout(failsafe);
        const labels = (addonsJson?.addons ?? []).map((a) => a.label).filter(Boolean);
        if (labels.length > 0) setAddonLabels(labels);

        const rawSvc = data.services ?? [];
        const rawPrice = data.prices ?? [];
        if (rawSvc.length > 0 && !data.catalogEmpty && !data.fallbackCatalog) {
          const stable = mergeServicesWithPricesStable(rawSvc, rawPrice);
          const okOnline = servicesHaveQuotesForBooking(stable.services, stable.prices) || stable.prices.length > 0;
          if (okOnline) {
            writeCache({
              services: stable.services,
              prices: stable.prices,
              canBookOnline: true,
              catalogEmpty: data.catalogEmpty,
              message: data.message,
              fallbackCatalog: data.fallbackCatalog,
            });
          }
        }
        applyPayload(data);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        clearTimeout(failsafe);
        const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
        if (name === 'AbortError') {
          if (cached?.payload?.services?.length) {
            applyPayload(cached.payload);
            setError('Catalog is slow — showing cached packages. Try refreshing in a moment.');
            return;
          }
          applyPayload(localFallbackPayload());
          return;
        }
        console.warn('[CRM_DEBUG_UI]', 'services_fetch', e);
        if (cached?.payload?.services?.length) {
          applyPayload(cached.payload);
          setError('Using cached packages (network issue).');
        } else {
          applyPayload(localFallbackPayload());
        }
      })
      .finally(() => {
        if (!alive) return;
        clearTimeout(failsafe);
        setCatalogRefreshing(false);
      });

    return () => {
      alive = false;
      clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/public/site-settings', { cache: 'no-store', timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as { bookingAvailability?: BookingAvailabilityRules };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data?.bookingAvailability) return;
        setBookingRules(data.bookingAvailability);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedService = useMemo(() => services.find((s) => s.slug === serviceSlug), [services, serviceSlug]);

  const bookingLines = useMemo(
    () => [{ serviceSlug, vehicleClass, vehicleDescription }, ...extraVehicles],
    [serviceSlug, vehicleClass, vehicleDescription, extraVehicles],
  );

  const pricePreviewText = useMemo(() => {
    let total = 0;
    const parts: string[] = [];
    for (const line of bookingLines) {
      const svc = services.find((s) => s.slug === line.serviceSlug);
      if (!svc) continue;
      const resolved = safePriceResolver({ slug: svc.slug, serviceId: svc.id }, line.vehicleClass, prices);
      if (resolved.isQuote) return 'Quote required for one or more vehicle lines (e.g. ceramic coating)';
      const cents = safePriceCentsForDisplay({ slug: svc.slug, serviceId: svc.id }, line.vehicleClass, prices);
      if (cents == null) return 'Quote required for one or more vehicle lines';
      total += cents;
      parts.push(`${classLabel(line.vehicleClass)} · $${(cents / 100).toFixed(2)}`);
    }
    if (parts.length === 0) return null;
    const deposit = Math.round(total * 0.3);
    return `${parts.join(' + ')} = $${(total / 100).toFixed(2)} combined · $${(deposit / 100).toFixed(2)} deposit (30%)`;
  }, [bookingLines, prices, services]);

  const toggleAddOn = (label: string) => {
    setSelectedAddOns((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  };

  const addVehicleLine = () => {
    if (bookingLines.length >= 3) return;
    setExtraVehicles((prev) => [
      ...prev,
      { serviceSlug: serviceSlug || services[0]?.slug || '', vehicleClass: 'sedan', vehicleDescription: '' },
    ]);
  };

  const updateExtra = (index: number, patch: Partial<ExtraLine>) => {
    setExtraVehicles((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeExtra = (index: number) => {
    setExtraVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBookOnline) {
      setError((prev) => prev ?? 'Online booking is disabled for this catalog. Call us to schedule.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const vehicles = bookingLines
        .filter((l) => l.serviceSlug && l.vehicleClass && l.vehicleDescription.trim())
        .slice(0, 3)
        .map((l) => ({
          serviceSlug: l.serviceSlug.trim(),
          vehicleClass: l.vehicleClass,
          vehicleDescription: l.vehicleDescription.trim(),
        }));

      if (vehicles.length === 0) {
        setError('Add at least one vehicle with year / make / model.');
        setSubmitting(false);
        return;
      }

      const scheduled = new Date(scheduledStart);
      if (!isBookingSlotAllowed(scheduled, bookingRules)) {
        setScheduleError(
          'Selected time is outside online booking hours. ' + bookingAvailabilityHint(bookingRules),
        );
        setSubmitting(false);
        return;
      }
      setScheduleError(null);

      const startIso = scheduled.toISOString();
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicles,
          addOns: selectedAddOns,
          scheduledStart: startIso,
          guestName,
          guestEmail,
          guestPhone,
          notes: notes || undefined,
        }),
      });
      const bookingJson = await bookingRes.json();
      if (!bookingRes.ok) {
        setError(bookingJson.error ?? 'Booking failed');
        setSubmitting(false);
        return;
      }

      const checkoutRes = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: bookingJson.appointmentId,
          accessToken: bookingJson.accessToken,
        }),
      });
      const checkoutJson = (await checkoutRes.json()) as {
        url?: string;
        skipPayment?: boolean;
        appointmentId?: string;
        accessToken?: string;
        code?: string;
        error?: string;
        message?: string;
      };

      if (checkoutJson.skipPayment && checkoutJson.appointmentId) {
        const q = new URLSearchParams({
          appointment_id: checkoutJson.appointmentId,
          token: checkoutJson.accessToken ?? bookingJson.accessToken,
        });
        window.location.href = `/book/pending?${q.toString()}`;
        return;
      }

      if (!checkoutJson.url) {
        setError(checkoutJson.message ?? checkoutJson.error ?? 'Checkout could not start');
        setSubmitting(false);
        return;
      }
      window.location.href = checkoutJson.url as string;
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-8'>
      {catalogRefreshing ? (
        <div className='flex items-center gap-2 text-xs text-zinc-500' aria-live='polite'>
          <span className='inline-block h-3 w-3 animate-spin rounded-full border border-gold/30 border-t-gold-soft' aria-hidden />
          Updating prices…
        </div>
      ) : null}
      {error ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100' role='alert'>
          {error}
        </p>
      ) : null}

      <div className='grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]'>
        <div className='space-y-8'>
          <section>
            <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>1. Package (vehicle 1)</p>
            <h2 className='mt-2 text-lg font-black uppercase text-white'>Select your detail</h2>
            <div className='mt-4 grid gap-3 sm:grid-cols-2'>
              {services.map((s) => {
                const active = s.slug === serviceSlug;
                return (
                  <button
                    key={s.id}
                    type='button'
                    onClick={() => setServiceSlug(s.slug)}
                    className={clsx(
                      'rounded-2xl border p-4 text-left transition duration-300',
                      active
                        ? 'border-gold bg-black/80 shadow-[0_0_28px_rgba(212,166,77,0.35)] ring-2 ring-gold/50'
                        : 'border-gold/20 bg-zinc-950/80 hover:border-gold/45 hover:shadow-[0_0_18px_rgba(212,166,77,0.12)]',
                    )}
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div>
                        <p className='text-[10px] font-bold uppercase tracking-widest text-gold-soft'>{s.slug.replace(/-/g, ' ')}</p>
                        <p className='mt-1 text-base font-black uppercase text-white'>{s.title}</p>
                        <p className='mt-1 text-xs text-zinc-400'>{s.subtitle}</p>
                      </div>
                      {serviceIcon(s.slug)}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>2. Vehicle class (vehicle 1)</p>
            <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {(['sedan', 'suv', 'truck', 'suv_truck'] as const).map((c) => (
                <button
                  key={c}
                  type='button'
                  onClick={() => setVehicleClass(c)}
                  className={clsx(
                    'rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition sm:text-sm',
                    vehicleClass === c ? 'border-gold bg-gold/10 text-gold-soft shadow-[0_0_20px_rgba(212,166,77,0.25)]' : 'border-white/15 text-zinc-300 hover:border-gold/30',
                  )}
                >
                  {classLabel(c)}
                </button>
              ))}
            </div>
          </section>

          {extraVehicles.map((line, idx) => (
            <section key={idx} className='rounded-2xl border border-white/10 bg-black/30 p-4'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Vehicle {idx + 2}</p>
                <button type='button' onClick={() => removeExtra(idx)} className='rounded-lg border border-white/15 p-2 text-zinc-400 hover:text-white' aria-label='Remove vehicle'>
                  <Trash2 className='h-4 w-4' />
                </button>
              </div>
              <label className='mt-3 block text-sm'>
                <span className='mb-2 block text-zinc-300'>Package</span>
                <select
                  value={line.serviceSlug}
                  onChange={(e) => updateExtra(idx, { serviceSlug: e.target.value })}
                  className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                {(['sedan', 'suv', 'truck', 'suv_truck'] as const).map((c) => (
                  <button
                    key={c}
                    type='button'
                    onClick={() => updateExtra(idx, { vehicleClass: c })}
                    className={clsx(
                      'rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-wider sm:text-xs',
                      line.vehicleClass === c ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/15 text-zinc-400 hover:border-gold/30',
                    )}
                  >
                    {classLabel(c)}
                  </button>
                ))}
              </div>
              <label className='mt-3 block text-sm'>
                <span className='mb-2 block text-zinc-300'>Vehicle (year / make / model)</span>
                <input
                  value={line.vehicleDescription}
                  onChange={(e) => updateExtra(idx, { vehicleDescription: e.target.value })}
                  className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                  placeholder='2021 Ford F-150'
                  required
                />
              </label>
            </section>
          ))}

          {bookingLines.length < 3 ? (
            <button
              type='button'
              onClick={addVehicleLine}
              className='inline-flex items-center gap-2 rounded-xl border border-gold/30 px-4 py-3 text-xs font-bold uppercase tracking-widest text-gold-soft hover:border-gold/60'
            >
              <Plus className='h-4 w-4' />
              Add vehicle (max 3 total)
            </button>
          ) : null}

          <section>
            <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Add-ons (optional)</p>
            <div className='mt-3 flex flex-wrap gap-2'>
              {addonLabels.map((opt) => {
                const on = selectedAddOns.includes(opt);
                return (
                  <button
                    key={opt}
                    type='button'
                    onClick={() => toggleAddOn(opt)}
                    className={clsx(
                      'rounded-full border px-3 py-2 text-xs font-semibold transition',
                      on ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/15 text-zinc-400 hover:border-gold/40',
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </section>

          <section className='grid gap-4 md:grid-cols-2'>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Appointment date & time</span>
              <p className='mb-2 text-xs text-zinc-500'>{bookingAvailabilityHint(bookingRules)}</p>
              <input
                type='datetime-local'
                value={scheduledStart}
                onChange={(e) => {
                  setScheduledStart(e.target.value);
                  const d = new Date(e.target.value);
                  if (e.target.value && !Number.isNaN(d.getTime()) && !isBookingSlotAllowed(d, bookingRules)) {
                    setScheduleError(bookingAvailabilityHint(bookingRules));
                  } else {
                    setScheduleError(null);
                  }
                }}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                required
              />
              {scheduleError ? <p className='mt-2 text-xs text-amber-300'>{scheduleError}</p> : null}
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Vehicle 1 (year / make / model)</span>
              <input
                value={vehicleDescription}
                onChange={(e) => setVehicleDescription(e.target.value)}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                placeholder='2022 BMW M3 Competition'
                required
              />
            </label>
          </section>

          <section className='grid gap-4 md:grid-cols-2'>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>Full name</span>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>Email</span>
              <input type='email' value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Phone</span>
              <input type='tel' value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required />
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Notes (optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' rows={3} />
            </label>
          </section>

          <section className='rounded-xl border border-gold/20 bg-black/60 p-4 text-sm text-zinc-300'>
            <p>
              After you pay the <span className='font-bold text-gold-soft'>30% deposit</span> via Stripe, you will continue to sign the liability agreement. Your booking is confirmed only after the agreement is signed. If Stripe is disabled, you will continue without card checkout.
            </p>
          </section>

          <button
            type='submit'
            disabled={submitting || services.length === 0 || !canBookOnline}
            className='w-full rounded-xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_25px_rgba(212,166,77,0.35)] transition hover:brightness-110 disabled:opacity-50 lg:hidden'
          >
            {submitting ? 'Redirecting…' : 'Continue to deposit (Stripe)'}
          </button>
        </div>

        <aside className='lg:sticky lg:top-28 h-fit space-y-4 rounded-2xl border border-gold/25 bg-zinc-950/90 p-5 shadow-[0_0_30px_rgba(0,0,0,0.45)]'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Summary</p>
          <div className='space-y-2 text-sm text-zinc-300'>
            {bookingLines.map((line, i) => {
              const svc = services.find((s) => s.slug === line.serviceSlug);
              return (
                <div key={`${i}-${line.serviceSlug}`} className='border-b border-white/5 pb-2'>
                  <p>
                    <span className='text-zinc-500'>Vehicle {i + 1}:</span> <span className='font-semibold text-white'>{svc?.title ?? line.serviceSlug}</span>
                  </p>
                  <p>
                    <span className='text-zinc-500'>Class:</span> <span className='text-white'>{classLabel(line.vehicleClass)}</span>
                  </p>
                </div>
              );
            })}
            <p className='text-gold-soft'>{pricePreviewText}</p>
            {selectedAddOns.length > 0 ? <p className='text-xs text-zinc-500'>Add-ons: {selectedAddOns.join(', ')}</p> : null}
          </div>
          <button
            type='submit'
            disabled={submitting || services.length === 0 || !canBookOnline}
            className='hidden w-full rounded-xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_25px_rgba(212,166,77,0.35)] transition hover:brightness-110 disabled:opacity-50 lg:block'
          >
            {submitting ? 'Redirecting…' : 'Continue to deposit (Stripe)'}
          </button>
        </aside>
      </div>
    </form>
  );
}
