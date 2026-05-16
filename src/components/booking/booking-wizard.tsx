'use client';

import clsx from 'clsx';
import { Car, Plus, Sparkles, Trash2, Truck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeBookingPricing, type BookingPricingBreakdown } from '@/lib/booking-pricing';
import { getLocalFallbackCatalog, mergeServicesWithPricesStable, servicesHaveQuotesForBooking } from '@/lib/catalog-fallback';
import { isOfferWithinSchedule, offerHasDiscount, type SiteDataOfferCard } from '@/lib/public-site-data';
import {
  bookingAvailabilityHint,
  DEFAULT_BOOKING_AVAILABILITY,
  isBookingSlotAllowed,
} from '@/lib/booking-availability';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { getBookableDateKeys, getTimeSlotsForDate, dateKeyLocal } from '@/lib/booking-schedule-slots';
import { digitsOnly, normalizeUsPhone10Digits } from '@/lib/us-phone';
import { defaultDealConfig, type DealConfig } from '@/lib/site-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safePriceCentsForDisplay, safePriceResolver } from '@/lib/safe-price-resolver';
import {
  UI_VEHICLE_CLASSES,
  UI_VEHICLE_LABELS,
  consolidatePriceRowsForUi,
  normalizeVehicleClass,
  type UiVehicleClass,
} from '@/lib/vehicle-pricing';

const BOOKING_SEED = getLocalFallbackCatalog();

const CATALOG_CACHE_KEY = 'gb_booking_catalog_v1';
const CATALOG_LS_KEY = 'gb_booking_catalog_v1_ls';
const CACHE_TTL_MS = 5 * 60 * 1000;
const LS_CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;

type ServiceRow = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };

type VehicleClass = UiVehicleClass;

type ExtraLine = { serviceSlug: string; vehicleClass: VehicleClass; vehicleDescription: string };

type AddonOption = { slug: string; label: string; price_cents: number };

function serviceIcon(slug: string) {
  if (slug.includes('ceramic')) return <Sparkles className='h-6 w-6 text-gold-soft' />;
  if (slug.includes('interior')) return <Car className='h-6 w-6 text-gold-soft' />;
  if (slug.includes('exterior')) return <Truck className='h-6 w-6 text-gold-soft' />;
  return <Sparkles className='h-6 w-6 text-gold-soft' />;
}

function classLabel(c: VehicleClass) {
  return UI_VEHICLE_LABELS[c];
}

export function BookingWizard() {
  const searchParams = useSearchParams();
  const offerFromUrl = String(searchParams?.get('offer') ?? '').trim();
  const liveCatalogAppliedRef = useRef(false);
  const [services, setServices] = useState<ServiceRow[]>(() => [...BOOKING_SEED.services]);
  const [prices, setPrices] = useState<PriceRow[]>(() => consolidatePriceRowsForUi([...BOOKING_SEED.prices]));
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canBookOnline, setCanBookOnline] = useState(false);

  const [serviceSlug, setServiceSlug] = useState(() => BOOKING_SEED.services[0]?.slug ?? '');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('sedan');
  const [bookingDateKey, setBookingDateKey] = useState('');
  const [bookingTimeValue, setBookingTimeValue] = useState('');
  const [bookingRules, setBookingRules] = useState<BookingAvailabilityConfig>(() => ({
    ...DEFAULT_BOOKING_AVAILABILITY,
    blackoutDates: [],
  }));
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [serviceCity, setServiceCity] = useState('');
  const [serviceState, setServiceState] = useState('TX');
  const [serviceZip, setServiceZip] = useState('');
  const [serviceAddressNotes, setServiceAddressNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [extraVehicles, setExtraVehicles] = useState<ExtraLine[]>([]);
  const [selectedAddOnSlugs, setSelectedAddOnSlugs] = useState<string[]>([]);
  const [addonOptions, setAddonOptions] = useState<AddonOption[]>([]);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [deals, setDeals] = useState<DealConfig>(defaultDealConfig);
  const freePromoRequested = promoCode.trim().toUpperCase() === 'FREE';

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
        setPrices(consolidatePriceRowsForUi(fb.prices));
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
        setPrices(consolidatePriceRowsForUi(fb.prices));
        setError(data.message ?? 'Showing default packages.');
        if (fb.services[0]) setServiceSlug(fb.services[0].slug);
        return;
      }

      const { services: mergedSvc, prices: mergedPrices } = mergeServicesWithPricesStable(svcList, priceList);
      liveCatalogAppliedRef.current = true;
      const quotesOk = servicesHaveQuotesForBooking(mergedSvc, mergedPrices);
      setCanBookOnline(quotesOk || (mergedSvc.length > 0 && mergedPrices.length > 0));
      setServices(mergedSvc);
      setPrices(consolidatePriceRowsForUi(mergedPrices));

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
      setPrices((prev) => (prev.length ? prev : consolidatePriceRowsForUi([...BOOKING_SEED.prices])));
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
        r.ok
          ? ((await r.json()) as {
              addons?: { slug?: string | null; label?: string | null; price_cents?: number | null }[];
            })
          : null,
      ),
    ])
      .then(([data, addonsJson]) => {
        if (!alive) return;
        clearTimeout(failsafe);
        const rawAddons = addonsJson?.addons ?? [];
        const opts: AddonOption[] = [];
        for (const a of rawAddons) {
          const label = String(a.label ?? '').trim();
          const slug = String(a.slug ?? '').trim().toLowerCase() || label.toLowerCase().replace(/\s+/g, '-');
          const cents = typeof a.price_cents === 'number' && a.price_cents > 0 ? a.price_cents : 0;
          if (!label) continue;
          opts.push({ slug: slug || label, label, price_cents: cents });
        }
        if (opts.length > 0) setAddonOptions(opts);

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
    void fetchWithTimeout('/api/public/site-data', { cache: 'no-store', timeoutMs: 8000 })
      .then((r) => r.json())
      .then((data: { deals?: DealConfig; offers?: SiteDataOfferCard[] }) => {
        if (cancelled) return;
        if (data?.deals) setDeals(data.deals);
        if (Array.isArray(data?.offers)) setOffers(data.offers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/public/site-settings', { cache: 'no-store', timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as { bookingAvailability?: BookingAvailabilityConfig };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data?.bookingAvailability) return;
        const b = data.bookingAvailability;
        setBookingRules({
          ...DEFAULT_BOOKING_AVAILABILITY,
          ...b,
          blackoutDates: Array.isArray(b.blackoutDates) ? b.blackoutDates : [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const bookableDateKeys = useMemo(
    () => getBookableDateKeys(bookingRules, { limit: 56, maxScanDays: 180 }),
    [bookingRules],
  );

  useEffect(() => {
    if (bookableDateKeys.length === 0) return;
    setBookingDateKey((prev) => (prev && bookableDateKeys.includes(prev) ? prev : bookableDateKeys[0]!));
  }, [bookableDateKeys]);

  const slotOpts = useMemo(
    () => (bookingDateKey ? getTimeSlotsForDate(bookingDateKey, bookingRules) : []),
    [bookingDateKey, bookingRules],
  );

  const filteredSlotOpts = useMemo(() => {
    if (!bookingDateKey) return [];
    const now = new Date();
    const todayKey = dateKeyLocal(now);
    return slotOpts.filter((s) => {
      const d = new Date(`${bookingDateKey}T${s.value}:00`);
      if (Number.isNaN(d.getTime())) return false;
      if (bookingDateKey === todayKey && d.getTime() < now.getTime() - 60_000) return false;
      return isBookingSlotAllowed(d, bookingRules);
    });
  }, [bookingDateKey, slotOpts, bookingRules]);

  useEffect(() => {
    if (!bookingDateKey || filteredSlotOpts.length === 0) {
      setBookingTimeValue('');
      return;
    }
    const now = Date.now();
    const pickFirst = () => {
      const hit = filteredSlotOpts.find((s) => {
        const d = new Date(`${bookingDateKey}T${s.value}:00`);
        return !Number.isNaN(d.getTime()) && d.getTime() >= now - 60_000 && isBookingSlotAllowed(d, bookingRules);
      });
      return hit?.value ?? '';
    };
    setBookingTimeValue((prev) => {
      if (prev) {
        const d = new Date(`${bookingDateKey}T${prev}:00`);
        if (!Number.isNaN(d.getTime()) && isBookingSlotAllowed(d, bookingRules) && d.getTime() >= now - 60_000) {
          return prev;
        }
      }
      return pickFirst();
    });
  }, [bookingDateKey, bookingRules, filteredSlotOpts]);

  const claimedOfferSnap = useMemo(() => {
    if (!offerFromUrl) return null;
    const o = offers.find(
      (x) =>
        x.active &&
        !x.archived &&
        offerHasDiscount(x) &&
        isOfferWithinSchedule(x) &&
        (x.id === offerFromUrl || (Boolean(x.slug) && x.slug === offerFromUrl)),
    );
    if (!o) return null;
    return {
      id: o.id,
      percent: o.discountKind === 'percent' ? o.discountPercent : 0,
      fixedCents: o.discountKind === 'fixed' ? (o.discountFixedCents ?? 0) : 0,
      stackableWithSitePromo: o.stackable !== false,
    };
  }, [offerFromUrl, offers]);

  const bookingLines = useMemo(
    () => [{ serviceSlug, vehicleClass, vehicleDescription }, ...extraVehicles],
    [serviceSlug, vehicleClass, vehicleDescription, extraVehicles],
  );

  const priceSummary = useMemo(() => {
    const vehicleLineCents: number[] = [];
    const lines: { label: string; cents: number }[] = [];
    for (const line of bookingLines) {
      const svc = services.find((s) => s.slug === line.serviceSlug);
      if (!svc) continue;
      const resolved = safePriceResolver({ slug: svc.slug, serviceId: svc.id }, line.vehicleClass, prices);
      if (resolved.isQuote) return { kind: 'quote' as const };
      const cents = safePriceCentsForDisplay({ slug: svc.slug, serviceId: svc.id }, line.vehicleClass, prices);
      if (cents == null) return { kind: 'quote' as const };
      vehicleLineCents.push(cents);
      lines.push({ label: `${svc.title} (${classLabel(line.vehicleClass)})`, cents });
    }
    if (lines.length === 0) return null;

    let addOnCentsSum = 0;
    const addOnLines: { label: string; cents: number }[] = [];
    for (const slug of selectedAddOnSlugs) {
      const opt = addonOptions.find(
        (a) => a.slug === slug || a.label.toLowerCase() === slug.toLowerCase() || a.slug.toLowerCase() === slug.toLowerCase(),
      );
      if (opt && opt.price_cents > 0) {
        addOnCentsSum += opt.price_cents;
        addOnLines.push({ label: opt.label, cents: opt.price_cents });
      }
    }

    const bd = computeBookingPricing({
      vehicleLineCents,
      addOnCentsSum,
      deals,
      claimedOffer: claimedOfferSnap
        ? {
            percent: claimedOfferSnap.percent,
            fixedCents: claimedOfferSnap.fixedCents,
            stackableWithSitePromo: claimedOfferSnap.stackableWithSitePromo,
          }
        : null,
      depositPercent: 30,
    });
    if ('kind' in bd) return null;

    return { kind: 'ok' as const, lines, addOnLines, breakdown: bd as BookingPricingBreakdown };
  }, [bookingLines, prices, services, deals, claimedOfferSnap, selectedAddOnSlugs, addonOptions]);

  const pricePreviewText =
    priceSummary?.kind === 'quote'
      ? 'Quote required for one or more vehicle lines'
      : priceSummary?.kind === 'ok'
        ? `$${(priceSummary.breakdown.finalTotalCents / 100).toFixed(2)} total · $${(priceSummary.breakdown.depositCents / 100).toFixed(2)} deposit`
        : null;

  const toggleAddOn = (slug: string) => {
    setSelectedAddOnSlugs((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
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
    setPhoneError(null);
    try {
      const p10 = normalizeUsPhone10Digits(guestPhone);
      if (!p10.ok) {
        setPhoneError(p10.error);
        setSubmitting(false);
        return;
      }
      const vehicles = bookingLines
        .filter((l) => l.serviceSlug && l.vehicleClass && l.vehicleDescription.trim())
        .slice(0, 3)
        .map((l) => ({
          serviceSlug: l.serviceSlug.trim(),
          vehicleClass: normalizeVehicleClass(l.vehicleClass),
          vehicleDescription: l.vehicleDescription.trim(),
        }));

      if (vehicles.length === 0) {
        setError('Add at least one vehicle with year / make / model.');
        setSubmitting(false);
        return;
      }

      if (!bookingDateKey || !bookingTimeValue) {
        setScheduleError('Please choose a valid appointment date and time.');
        setSubmitting(false);
        return;
      }

      const scheduled = new Date(`${bookingDateKey}T${bookingTimeValue}:00`);
      if (Number.isNaN(scheduled.getTime()) || !isBookingSlotAllowed(scheduled, bookingRules)) {
        setScheduleError(
          'Selected time is outside online booking hours. ' + bookingAvailabilityHint(bookingRules),
        );
        setSubmitting(false);
        return;
      }
      setScheduleError(null);

      if (!serviceAddress.trim() || !serviceCity.trim() || serviceState.trim().length < 2 || serviceZip.replace(/\D/g, '').length !== 5) {
        setError('Enter the service address before continuing to the Stripe deposit.');
        document.getElementById('service-address')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSubmitting(false);
        return;
      }

      const startIso = scheduled.toISOString();
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicles,
          addOns: selectedAddOnSlugs,
          offerId: claimedOfferSnap?.id,
          scheduledStart: startIso,
          guestName,
          guestEmail,
          guestPhone: p10.digits10,
          serviceAddress: serviceAddress.trim(),
          serviceCity: serviceCity.trim(),
          serviceState: serviceState.trim().toUpperCase(),
          serviceZip: serviceZip.replace(/\D/g, '').slice(0, 5),
          serviceAddressNotes: serviceAddressNotes.trim() || undefined,
          promoCode: promoCode.trim() || undefined,
          notes: notes || undefined,
        }),
      });
      const bookingJson = (await bookingRes.json()) as {
        appointmentId?: string;
        accessToken?: string;
        depositAmountCents?: number;
        usedFallback?: boolean;
        fallbackBookingId?: string;
        skipPayment?: boolean;
      };

      if (!bookingRes.ok) {
        setError((bookingJson as { error?: string }).error ?? 'Booking failed');
        setSubmitting(false);
        return;
      }

      if (bookingJson.skipPayment && bookingJson.appointmentId) {
        const q = new URLSearchParams({
          appointment_id: bookingJson.appointmentId,
          token: bookingJson.accessToken ?? '',
        });
        window.location.href = `/book/complete?${q.toString()}`;
        return;
      }

      const checkoutBody = bookingJson.usedFallback
        ? { fallbackBookingId: bookingJson.fallbackBookingId, accessToken: bookingJson.accessToken }
        : { appointmentId: bookingJson.appointmentId, accessToken: bookingJson.accessToken };

      const checkoutRes = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutBody),
      });
      const checkoutJson = (await checkoutRes.json()) as {
        url?: string;
        skipPayment?: boolean;
        appointmentId?: string;
        fallbackBookingId?: string;
        accessToken?: string;
        code?: string;
        error?: string;
        message?: string;
      };

      if (checkoutJson.skipPayment && (checkoutJson.appointmentId || checkoutJson.fallbackBookingId)) {
        const q = new URLSearchParams({
          token: checkoutJson.accessToken ?? bookingJson.accessToken ?? '',
        });
        if (checkoutJson.fallbackBookingId || bookingJson.fallbackBookingId) {
          q.set('fallback_booking_id', checkoutJson.fallbackBookingId ?? bookingJson.fallbackBookingId ?? '');
        }
        if (checkoutJson.appointmentId ?? bookingJson.appointmentId) {
          q.set('appointment_id', checkoutJson.appointmentId ?? bookingJson.appointmentId ?? '');
        }
        window.location.href = `/book/pending?${q.toString()}`;
        return;
      }

      if (!checkoutJson.url) {
        const hint =
          checkoutRes.status >= 500
            ? 'Payments are temporarily unavailable. Your booking is saved — call Gloss Boss ATX to complete your deposit, or try again shortly.'
            : checkoutJson.message ?? checkoutJson.error ?? 'Checkout could not start.';
        setError(hint);
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
      {claimedOfferSnap ? (
        <p className='rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          Offer applied:{' '}
          {claimedOfferSnap.fixedCents > 0
            ? `$${(claimedOfferSnap.fixedCents / 100).toFixed(2)} off`
            : `${claimedOfferSnap.percent}% off`}{' '}
          eligible services & add-ons after any multi-car discount
          {claimedOfferSnap.stackableWithSitePromo ? ' (stacks with sitewide promo when configured).' : '.'}
        </p>
      ) : offerFromUrl ? (
        <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100'>
          That offer link is not active — continue without it or ask your detailer for a current code.
        </p>
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
              {UI_VEHICLE_CLASSES.map((c) => (
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
              <div className='mt-3 grid grid-cols-2 gap-2'>
                {UI_VEHICLE_CLASSES.map((c) => (
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
              {addonOptions.length === 0 ? (
                <span className='text-xs text-zinc-500'>Loading add-ons…</span>
              ) : (
                addonOptions.map((opt) => {
                  const on = selectedAddOnSlugs.includes(opt.slug);
                  const priceLabel = opt.price_cents > 0 ? `+$${(opt.price_cents / 100).toFixed(0)}` : '';
                  return (
                    <button
                      key={opt.slug}
                      type='button'
                      onClick={() => toggleAddOn(opt.slug)}
                      className={clsx(
                        'rounded-full border px-3 py-2 text-xs font-semibold transition',
                        on ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/15 text-zinc-400 hover:border-gold/40',
                      )}
                    >
                      {opt.label} {priceLabel}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section id='service-address' className='grid gap-4 rounded-2xl border border-gold/20 bg-black/45 p-4 md:grid-cols-2'>
            <div className='md:col-span-2'>
              <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Service address</p>
              <p className='mt-1 text-xs text-zinc-500'>Required before payment so we can confirm drive distance and arrival details.</p>
            </div>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Street address</span>
              <input value={serviceAddress} onChange={(e) => setServiceAddress(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-base' placeholder='123 Main St' required />
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>City</span>
              <input value={serviceCity} onChange={(e) => setServiceCity(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-base' required />
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>State</span>
              <input value={serviceState} onChange={(e) => setServiceState(e.target.value.toUpperCase().slice(0, 2))} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-base' required />
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>ZIP</span>
              <input inputMode='numeric' value={serviceZip} onChange={(e) => setServiceZip(digitsOnly(e.target.value).slice(0, 5))} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-base' required />
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>Gate / apartment notes</span>
              <input value={serviceAddressNotes} onChange={(e) => setServiceAddressNotes(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-base' placeholder='Optional' />
            </label>
          </section>

          <section className='grid gap-4 md:grid-cols-2'>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Appointment date</span>
              <p className='mb-2 text-xs text-zinc-500'>{bookingAvailabilityHint(bookingRules)}</p>
              <select
                value={bookingDateKey}
                onChange={(e) => {
                  setBookingDateKey(e.target.value);
                  setScheduleError(null);
                }}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                required
              >
                {bookableDateKeys.length === 0 ? <option value="">No online dates available — call us</option> : null}
                {bookableDateKeys.map((k) => (
                  <option key={k} value={k}>
                    {new Date(`${k}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Start time (15-minute slots)</span>
              <select
                value={bookingTimeValue}
                onChange={(e) => {
                  setBookingTimeValue(e.target.value);
                  setScheduleError(null);
                }}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                required
              >
                <option value=''>Select a time</option>
                {filteredSlotOpts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {filteredSlotOpts.length > 0 && filteredSlotOpts.length <= 24 ? (
                <div className='mt-3 flex flex-wrap gap-2'>
                  {filteredSlotOpts.map((s) => (
                    <button
                      key={`btn-${s.value}`}
                      type='button'
                      onClick={() => {
                        setBookingTimeValue(s.value);
                        setScheduleError(null);
                      }}
                      className={clsx(
                        'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                        bookingTimeValue === s.value ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/15 text-zinc-400 hover:border-gold/40',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
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
              <span className='mb-2 block text-zinc-300'>Phone (10 digits)</span>
              <input
                type='tel'
                inputMode='numeric'
                autoComplete='tel-national'
                maxLength={10}
                value={guestPhone}
                onChange={(e) => {
                  setGuestPhone(digitsOnly(e.target.value).slice(0, 10));
                  setPhoneError(null);
                }}
                onBlur={() => {
                  if (!guestPhone) {
                    setPhoneError('Phone number is required.');
                    return;
                  }
                  const r = normalizeUsPhone10Digits(guestPhone);
                  setPhoneError(r.ok ? null : r.error);
                }}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                required
              />
              {phoneError ? <p className='mt-2 text-xs text-amber-300'>{phoneError}</p> : null}
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Notes (optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' rows={3} />
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Promo code (optional)</span>
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder='Enter code'
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 uppercase tracking-wider'
              />
              {promoCode.trim().toUpperCase() === 'FREE' ? (
                <p className='mt-2 text-xs text-amber-200'>
                  FREE is gated by admin settings and only applies to a Sedan Exterior Wash test. If enabled, total becomes $0 and Stripe is bypassed.
                </p>
              ) : null}
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

        <aside className='lg:sticky lg:top-28 h-fit space-y-4 rounded-2xl border border-gold/25 bg-gradient-to-b from-zinc-950/95 to-black/90 p-5 shadow-[0_0_36px_rgba(212,166,77,0.12)]'>
          <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Summary</p>
          <div className='space-y-2.5 text-sm text-zinc-300'>
            {bookingLines.map((line, i) => {
              const svc = services.find((s) => s.slug === line.serviceSlug);
              return (
                <div key={`${i}-${line.serviceSlug}`} className='border-b border-white/5 pb-2.5 last:border-0'>
                  <p>
                    <span className='text-zinc-500'>Vehicle {i + 1}:</span>{' '}
                    <span className='font-semibold text-white'>{svc?.title ?? line.serviceSlug}</span>
                  </p>
                  <p className='mt-0.5'>
                    <span className='text-zinc-500'>Class:</span> <span className='text-zinc-200'>{classLabel(line.vehicleClass)}</span>
                  </p>
                </div>
              );
            })}
            {priceSummary?.kind === 'ok' ? (
              <div className='mt-3 space-y-2 rounded-xl border border-white/10 bg-black/35 p-3 sm:p-4'>
                {freePromoRequested ? (
                  <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs font-bold text-amber-100'>
                    Test comp requested. The server will apply it only when enabled and valid.
                  </p>
                ) : null}
                <p className='flex justify-between border-b border-white/10 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
                  <span>Original — vehicle services</span>
                  <span className='text-zinc-300'>${(priceSummary.breakdown.vehicleSubtotalCents / 100).toFixed(2)}</span>
                </p>
                {priceSummary.lines.map((l, i) => (
                  <p key={i} className='flex justify-between gap-2 text-xs leading-snug text-zinc-400'>
                    <span className='min-w-0 flex-1 break-words'>{l.label}</span>
                    <span className='shrink-0 tabular-nums'>${(l.cents / 100).toFixed(2)}</span>
                  </p>
                ))}
                {priceSummary.breakdown.addOnSubtotalCents > 0 ? (
                  <p className='flex justify-between text-xs font-semibold text-zinc-300'>
                    <span>Add-ons</span>
                    <span className='tabular-nums'>${(priceSummary.breakdown.addOnSubtotalCents / 100).toFixed(2)}</span>
                  </p>
                ) : null}
                {priceSummary.addOnLines.map((l, i) => (
                  <p key={`a-${i}`} className='flex justify-between gap-2 text-[11px] leading-snug text-zinc-500'>
                    <span className='min-w-0 flex-1 break-words'>· {l.label}</span>
                    <span className='shrink-0 tabular-nums'>${(l.cents / 100).toFixed(2)}</span>
                  </p>
                ))}
                {priceSummary.breakdown.multiCarDiscountCents > 0 ? (
                  <p className='flex justify-between text-xs text-emerald-300'>
                    <span>Multi-car discount</span>
                    <span className='tabular-nums'>-${(priceSummary.breakdown.multiCarDiscountCents / 100).toFixed(2)}</span>
                  </p>
                ) : null}
                <p className='flex justify-between text-[11px] text-zinc-500'>
                  <span>Subtotal before offers & sitewide (after multi-car)</span>
                  <span className='tabular-nums'>${(priceSummary.breakdown.prePromoCents / 100).toFixed(2)}</span>
                </p>
                {priceSummary.breakdown.offerDiscountCents > 0 ? (
                  <p className='flex justify-between text-xs text-emerald-300'>
                    <span>Offer discount</span>
                    <span className='tabular-nums'>-${(priceSummary.breakdown.offerDiscountCents / 100).toFixed(2)}</span>
                  </p>
                ) : null}
                {priceSummary.breakdown.websitePromoDiscountCents > 0 ? (
                  <p className='flex justify-between text-xs text-emerald-300'>
                    <span>Sitewide promo</span>
                    <span className='tabular-nums'>-${(priceSummary.breakdown.websitePromoDiscountCents / 100).toFixed(2)}</span>
                  </p>
                ) : null}
                <div className='border-t border-white/10 pt-3'>
                  <p className='flex flex-wrap items-end justify-between gap-x-3 gap-y-1'>
                    <span className='text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500'>Final total</span>
                    <span className='text-xl font-black tabular-nums tracking-tight text-white sm:text-2xl'>
                      ${(priceSummary.breakdown.finalTotalCents / 100).toFixed(2)}
                    </span>
                  </p>
                  <p className='mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/45 bg-gold/10 px-3 py-2.5 text-sm font-bold text-gold-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'>
                    <span className='max-w-[62%] text-[11px] font-black uppercase leading-tight tracking-wide text-gold-soft'>
                      Deposit ({priceSummary.breakdown.depositPercent}%)
                    </span>
                    <span className='tabular-nums text-base font-black tracking-tight'>${(priceSummary.breakdown.depositCents / 100).toFixed(2)}</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className='text-gold-soft'>{pricePreviewText}</p>
            )}
            {selectedAddOnSlugs.length > 0 ? (
              <p className='text-xs text-zinc-500'>
                Add-ons:{' '}
                {selectedAddOnSlugs
                  .map((s) => addonOptions.find((a) => a.slug === s)?.label ?? s)
                  .join(', ')}
              </p>
            ) : null}
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
