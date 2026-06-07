'use client';

import clsx from 'clsx';
import { Car, Plus, Sparkles, Trash2, Truck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { addonPriceCentsForVehicle, sumPerVehicleAddOnCents } from '@/lib/addon-vehicle-pricing';
import { clearBookingDraft, loadBookingDraftForWizard, writeBookingDraft } from '@/lib/booking-draft';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { slotConflictsWithBlocks, type BookedBlock } from '@/lib/booking-slot-blocking';
import { digitsOnly, normalizeUsPhone10Digits } from '@/lib/us-phone';
import { defaultDealConfig, type DealConfig } from '@/lib/site-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { safePriceCentsForDisplay, safePriceResolver } from '@/lib/safe-price-resolver';
import { SMS_CONSENT_COPY } from '@/lib/sms-consent';
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

type ExtraLine = {
  serviceSlug: string;
  vehicleClass: VehicleClass;
  vehicleDescription: string;
  vehicleColor: string;
  addOnSlugs: string[];
};

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
  const [smsConsent, setSmsConsent] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [serviceCity, setServiceCity] = useState('');
  const [serviceState, setServiceState] = useState('TX');
  const [serviceZip, setServiceZip] = useState('');
  const [serviceAddressNotes, setServiceAddressNotes] = useState('');
  const [serviceLocationType, setServiceLocationType] = useState<'house' | 'apartment' | 'business' | 'other' | ''>('');
  const [waterAccess, setWaterAccess] = useState<'yes' | 'no' | 'unsure' | ''>('');
  const [powerAccess, setPowerAccess] = useState<'yes' | 'no' | 'unsure' | ''>('');
  const [parkingAccess, setParkingAccess] = useState<'yes' | 'no' | 'unsure' | ''>('');
  const [bookedBlocks, setBookedBlocks] = useState<BookedBlock[]>([]);
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  /** From /api/public/site-settings — mirrors FREE row enabled (admin reads promo_codes). */
  const [freePromoEnabledOnServer, setFreePromoEnabledOnServer] = useState(false);
  const [promoComped, setPromoComped] = useState(false);
  const [promoQuoteFinalCents, setPromoQuoteFinalCents] = useState<number | null>(null);
  const [draftExpiredNotice, setDraftExpiredNotice] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'deposit' | 'full'>('deposit');
  type SavedBookingRef = {
    appointmentId?: string;
    fallbackBookingId?: string;
    accessToken?: string;
    usedFallback?: boolean;
  };
  const [checkoutPhase, setCheckoutPhase] = useState<
    'idle' | 'saving_booking' | 'creating_checkout' | 'redirecting' | 'checkout_failed' | 'pay_later_saving'
  >('idle');
  const [savedBooking, setSavedBooking] = useState<SavedBookingRef | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTimedOut, setCheckoutTimedOut] = useState(false);
  const CHECKOUT_TIMEOUT_MS = 10000;
  const CHECKOUT_FAIL_COPY =
    "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.";
  const [extraVehicles, setExtraVehicles] = useState<ExtraLine[]>([]);
  const [primaryAddOnSlugs, setPrimaryAddOnSlugs] = useState<string[]>([]);
  const [addonOptions, setAddonOptions] = useState<AddonOption[]>([]);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [deals, setDeals] = useState<DealConfig>(defaultDealConfig);
  const freePromoRequested = appliedPromoCode === 'FREE';

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
          return (await r.json()) as { bookingAvailability?: BookingAvailabilityConfig; allowFreeTestPromo?: boolean };
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data?.bookingAvailability) return;
        setFreePromoEnabledOnServer(data.allowFreeTestPromo === true);
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

  useEffect(() => {
    let cancelled = false;
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
    void fetchWithTimeout(`/api/public/booked-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      cache: 'no-store',
      timeoutMs: 8000,
    })
      .then((r) => r.json())
      .then((data: { blocks?: BookedBlock[] }) => {
        if (!cancelled) setBookedBlocks(Array.isArray(data.blocks) ? data.blocks : []);
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
    () => [
      { serviceSlug, vehicleClass, vehicleDescription, vehicleColor, addOnSlugs: primaryAddOnSlugs },
      ...extraVehicles,
    ],
    [serviceSlug, vehicleClass, vehicleDescription, vehicleColor, primaryAddOnSlugs, extraVehicles],
  );

  const allAddOnSlugs = useMemo(
    () => [...new Set(bookingLines.flatMap((l) => l.addOnSlugs ?? []))],
    [bookingLines],
  );

  const bookingDurationMinutes = useMemo(
    () =>
      totalBookingDurationMinutes(
        bookingLines.map((l) => ({
          serviceSlug: l.serviceSlug,
          vehicleClass: normalizeVehicleClass(l.vehicleClass),
          addOnSlugs: l.addOnSlugs ?? [],
        })),
      ),
    [bookingLines],
  );

  const filteredSlotOpts = useMemo(() => {
    if (!bookingDateKey) return [];
    const now = new Date();
    const todayKey = dateKeyLocal(now);
    return slotOpts.filter((s) => {
      const d = new Date(`${bookingDateKey}T${s.value}:00`);
      if (Number.isNaN(d.getTime())) return false;
      if (bookingDateKey === todayKey && d.getTime() < now.getTime() - 60_000) return false;
      if (!isBookingSlotAllowed(d, bookingRules)) return false;
      if (slotConflictsWithBlocks(d.toISOString(), bookingDurationMinutes, bookedBlocks)) return false;
      return true;
    });
  }, [bookingDateKey, slotOpts, bookingRules, bookedBlocks, bookingDurationMinutes]);

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
        if (
          !Number.isNaN(d.getTime()) &&
          isBookingSlotAllowed(d, bookingRules) &&
          d.getTime() >= now - 60_000 &&
          !slotConflictsWithBlocks(d.toISOString(), bookingDurationMinutes, bookedBlocks)
        ) {
          return prev;
        }
      }
      return pickFirst();
    });
  }, [bookingDateKey, bookingRules, filteredSlotOpts, bookedBlocks, bookingDurationMinutes]);

  const freePromoEligible = freePromoRequested && promoComped;

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

    const pricedAddons = sumPerVehicleAddOnCents(
      bookingLines.map((l) => ({ vehicleClass: l.vehicleClass, addOnSlugs: l.addOnSlugs ?? [] })),
      addonOptions,
    );
    const addOnCentsSum = pricedAddons.totalCents;
    const addOnLines = pricedAddons.lines.map((l) => {
      const veh = bookingLines[l.vehicleIndex];
      const vehLabel = veh ? classLabel(veh.vehicleClass) : 'Vehicle';
      return { label: `${l.label} (${vehLabel})`, cents: l.cents };
    });

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

    const promoFinal = promoQuoteFinalCents ?? (freePromoEligible ? 0 : null);
    const finalBreakdown =
      promoFinal != null
        ? ({
            ...bd,
            finalTotalCents: promoFinal,
            depositCents: promoFinal === 0 ? 0 : bd.depositCents,
            promoDiscountCents: Math.max(0, bd.prePromoCents - promoFinal),
          } as BookingPricingBreakdown)
        : (bd as BookingPricingBreakdown);

    return { kind: 'ok' as const, lines, addOnLines, breakdown: finalBreakdown };
  }, [bookingLines, prices, services, deals, claimedOfferSnap, addonOptions, freePromoEligible, promoQuoteFinalCents]);

  const pricePreviewText =
    priceSummary?.kind === 'quote'
      ? 'Quote required for one or more vehicle lines'
      : priceSummary?.kind === 'ok'
        ? `$${(priceSummary.breakdown.finalTotalCents / 100).toFixed(2)} total · $${(priceSummary.breakdown.depositCents / 100).toFixed(2)} deposit`
        : null;

  const toggleAddOn = (vehicleIndex: number, slug: string) => {
    if (vehicleIndex === 0) {
      setPrimaryAddOnSlugs((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
      return;
    }
    const extraIdx = vehicleIndex - 1;
    setExtraVehicles((prev) =>
      prev.map((row, i) => {
        if (i !== extraIdx) return row;
        const slugs = row.addOnSlugs ?? [];
        return {
          ...row,
          addOnSlugs: slugs.includes(slug) ? slugs.filter((x) => x !== slug) : [...slugs, slug],
        };
      }),
    );
  };

  const addVehicleLine = () => {
    if (bookingLines.length >= 3) return;
    setExtraVehicles((prev) => [
      ...prev,
      {
        serviceSlug: serviceSlug || services[0]?.slug || '',
        vehicleClass: 'sedan',
        vehicleDescription: '',
        vehicleColor: '',
        addOnSlugs: [],
      },
    ]);
  };

  const updateExtra = (index: number, patch: Partial<ExtraLine>) => {
    setExtraVehicles((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeExtra = (index: number) => {
    setExtraVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const renderVehicleAddOns = (vehicleIndex: number, slugs: string[]) => (
    <div className='mt-3'>
      <p className='text-[10px] font-bold uppercase tracking-widest text-gold-soft'>Add-ons for this vehicle</p>
      <div className='mt-2 flex flex-wrap gap-2'>
        {addonOptions.length === 0 ? (
          <span className='text-xs text-zinc-500'>Loading add-ons…</span>
        ) : (
          addonOptions.map((opt) => {
            const on = slugs.includes(opt.slug);
            const cents = addonPriceCentsForVehicle(
              opt.slug,
              bookingLines[vehicleIndex]?.vehicleClass ?? 'sedan',
              opt.price_cents,
            );
            const priceLabel = cents > 0 ? `+$${(cents / 100).toFixed(0)}` : '';
            return (
              <button
                key={`${vehicleIndex}-${opt.slug}`}
                type='button'
                onClick={() => toggleAddOn(vehicleIndex, opt.slug)}
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
    </div>
  );

  useEffect(() => {
    const loaded = loadBookingDraftForWizard();
    if (loaded.kind === 'expired') {
      setDraftExpiredNotice(true);
      if (loaded.guestName) setGuestName(loaded.guestName);
      if (loaded.guestEmail) setGuestEmail(loaded.guestEmail);
      if (loaded.guestPhone) setGuestPhone(loaded.guestPhone);
      return;
    }
    if (loaded.kind !== 'fresh') return;
    const draft = loaded.draft;
    if (draft.serviceSlug) setServiceSlug(draft.serviceSlug);
    if (draft.vehicleClass) setVehicleClass(draft.vehicleClass as VehicleClass);
    if (draft.vehicleDescription) setVehicleDescription(draft.vehicleDescription);
    if (draft.vehicleColor) setVehicleColor(draft.vehicleColor);
    if (draft.extraVehicles?.length) {
      setExtraVehicles(
        draft.extraVehicles.map((v) => ({
          serviceSlug: v.serviceSlug,
          vehicleClass: normalizeVehicleClass(v.vehicleClass) as VehicleClass,
          vehicleDescription: v.vehicleDescription,
          vehicleColor: v.vehicleColor,
          addOnSlugs: v.addOnSlugs ?? [],
        })),
      );
    }
    if (draft.primaryAddOnSlugs?.length) setPrimaryAddOnSlugs(draft.primaryAddOnSlugs);
    if (draft.paymentChoice) setPaymentChoice(draft.paymentChoice);
    if (draft.promoCode) setPromoCode(draft.promoCode);
    if (draft.guestName) setGuestName(draft.guestName);
    if (draft.guestEmail) setGuestEmail(draft.guestEmail);
    if (draft.guestPhone) setGuestPhone(draft.guestPhone);
    if (draft.serviceAddress) setServiceAddress(draft.serviceAddress);
    if (draft.serviceCity) setServiceCity(draft.serviceCity);
    if (draft.serviceState) setServiceState(draft.serviceState);
    if (draft.serviceZip) setServiceZip(draft.serviceZip);
    if (draft.scheduledStart) {
      const d = new Date(draft.scheduledStart);
      if (!Number.isNaN(d.getTime())) {
        setBookingDateKey(dateKeyLocal(d));
        setBookingTimeValue(
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (checkoutPhase === 'redirecting') return;
      writeBookingDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        serviceSlug,
        vehicleClass,
        vehicleDescription,
        vehicleColor,
        primaryAddOnSlugs,
        extraVehicles,
        paymentChoice,
        promoCode,
        guestName,
        guestEmail,
        guestPhone,
        serviceAddress,
        serviceCity,
        serviceState,
        serviceZip,
        scheduledStart:
          bookingDateKey && bookingTimeValue
            ? new Date(`${bookingDateKey}T${bookingTimeValue}:00`).toISOString()
            : '',
        accessNotes: serviceAddressNotes,
        hasWater: waterAccess === 'yes' ? true : waterAccess === 'no' ? false : null,
        hasPower: powerAccess === 'yes' ? true : powerAccess === 'no' ? false : null,
        step: 0,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [
    serviceSlug,
    vehicleClass,
    vehicleDescription,
    vehicleColor,
    extraVehicles,
    primaryAddOnSlugs,
    paymentChoice,
    promoCode,
    guestName,
    guestEmail,
    guestPhone,
    serviceAddress,
    serviceCity,
    serviceState,
    serviceZip,
    bookingDateKey,
    bookingTimeValue,
    serviceAddressNotes,
    waterAccess,
    powerAccess,
    checkoutPhase,
  ]);

  const applyPromo = useCallback(async () => {
    const code = promoCode.trim().toUpperCase();
    setPromoMessage(null);
    if (!code) {
      setAppliedPromoCode('');
      setPromoComped(false);
      setPromoQuoteFinalCents(null);
      setPromoMessage('Enter a promo code first.');
      return;
    }
    if (bookingLines.length === 0) {
      setAppliedPromoCode('');
      setPromoMessage('Add at least one vehicle before applying a promo.');
      return;
    }
    setPromoMessage('Checking promo…');
    try {
      const res = await fetch('/api/bookings/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoCode: code,
          paymentChoice,
          offerId: claimedOfferSnap?.id,
          lines: bookingLines.map((l) => ({
            serviceSlug: l.serviceSlug,
            vehicleClass: l.vehicleClass,
            vehicleDescription: l.vehicleDescription,
            vehicleColor: l.vehicleColor,
            addOnSlugs: l.addOnSlugs ?? [],
          })),
          addOns: allAddOnSlugs,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        comped?: boolean;
        testOneDollar?: boolean;
        finalTotalCents?: number;
      };
      if (!res.ok || !json.ok) {
        setAppliedPromoCode('');
        setPromoComped(false);
        setPromoQuoteFinalCents(null);
        setPromoMessage(json.error ?? 'Promo could not be applied.');
        return;
      }
      setAppliedPromoCode(code);
      setPromoComped(Boolean(json.comped));
      setPromoQuoteFinalCents(typeof json.finalTotalCents === 'number' ? json.finalTotalCents : null);
      if (json.comped || code === 'FREE') setPaymentChoice('full');
      if (json.testOneDollar || code === 'TEST1') setPaymentChoice('full');
      setPromoMessage(json.message ?? `${code} applied.`);
    } catch {
      setAppliedPromoCode('');
      setPromoMessage('Could not reach promo service. Try again.');
    }
  }, [
    promoCode,
    bookingLines,
    paymentChoice,
    claimedOfferSnap?.id,
    allAddOnSlugs,
  ]);

  useEffect(() => {
    if (!freePromoEnabledOnServer) return;
    const code = promoCode.trim().toUpperCase();
    if (code !== 'FREE') return;
    if (appliedPromoCode === 'FREE' && promoComped) return;
    if (bookingLines.length === 0) return;
    const t = window.setTimeout(() => {
      void applyPromo();
    }, 350);
    return () => window.clearTimeout(t);
  }, [freePromoEnabledOnServer, promoCode, bookingLines.length, appliedPromoCode, promoComped, applyPromo]);

  const startStripeCheckout = async (bookingJson: SavedBookingRef & { accessToken: string }) => {
    setCheckoutPhase('creating_checkout');
    setCheckoutError(null);
    setCheckoutTimedOut(false);

    const checkoutBody = bookingJson.usedFallback
      ? {
          fallbackBookingId: bookingJson.fallbackBookingId,
          accessToken: bookingJson.accessToken,
          paymentChoice: freePromoEligible ? 'full' : paymentChoice,
        }
      : {
          appointmentId: bookingJson.appointmentId,
          accessToken: bookingJson.accessToken,
          paymentChoice: freePromoEligible ? 'full' : paymentChoice,
        };

    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setCheckoutTimedOut(true);
      setCheckoutPhase('checkout_failed');
      setCheckoutError(CHECKOUT_FAIL_COPY);
      setSubmitting(false);
    }, CHECKOUT_TIMEOUT_MS);

    try {
      const checkoutRes = await fetchWithTimeout('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutBody),
        timeoutMs: CHECKOUT_TIMEOUT_MS,
      });
      window.clearTimeout(timeoutId);
      if (timedOut) return;

      const checkoutJson = (await checkoutRes.json()) as {
        url?: string;
        skipPayment?: boolean;
        appointmentId?: string;
        fallbackBookingId?: string;
        accessToken?: string;
        code?: string;
        error?: string;
        message?: string;
        customerMessage?: string;
        payLaterEligible?: boolean;
        ok?: boolean;
      };

      if (checkoutJson.skipPayment) {
        console.warn('[booking-wizard] unexpected skipPayment from checkout API', checkoutJson.code);
        setCheckoutPhase('checkout_failed');
        setCheckoutError(
          checkoutJson.customerMessage ??
            checkoutJson.message ??
            checkoutJson.error ??
            'Card checkout is unavailable. Your booking is saved — try Pay later or call (512) 481-2319.',
        );
        setSubmitting(false);
        return;
      }

      if (!checkoutRes.ok || !checkoutJson.url) {
        setCheckoutPhase('checkout_failed');
        const stripeMsg =
          checkoutJson.code === 'STRIPE_NOT_CONFIGURED'
            ? 'Stripe is not configured on the server. Add STRIPE_SECRET_KEY in production env, or use Pay later.'
            : checkoutJson.customerMessage ?? checkoutJson.message ?? checkoutJson.error ?? CHECKOUT_FAIL_COPY;
        console.error('[booking-wizard] checkout failed', checkoutJson.code, stripeMsg);
        setCheckoutError(stripeMsg);
        setSubmitting(false);
        return;
      }

      setCheckoutPhase('redirecting');
      clearBookingDraft();
      window.location.href = checkoutJson.url;
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (timedOut) return;
      const aborted = err instanceof Error && err.name === 'AbortError';
      setCheckoutPhase('checkout_failed');
      setCheckoutError(aborted ? CHECKOUT_FAIL_COPY : 'Network error while opening checkout. Your booking is saved.');
      setSubmitting(false);
    }
  };

  const handlePayLater = async () => {
    if (!savedBooking?.accessToken) return;
    setCheckoutPhase('pay_later_saving');
    setCheckoutError(null);
    try {
      const res = await fetchWithTimeout('/api/bookings/mark-pay-later', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: savedBooking.appointmentId,
          fallbackBookingId: savedBooking.fallbackBookingId,
          accessToken: savedBooking.accessToken,
          paymentChoice,
        }),
        timeoutMs: 12000,
      });
      const json = (await res.json()) as { ok?: boolean; redirectUrl?: string; error?: string };
      if (!res.ok || !json.ok || !json.redirectUrl) {
        setCheckoutError(json.error ?? 'Could not save pay-later status. Please call Gloss Boss ATX.');
        setCheckoutPhase('checkout_failed');
        setSubmitting(false);
        return;
      }
      window.location.href = json.redirectUrl;
    } catch {
      setCheckoutError('Network error. Your booking is saved — we will contact you for payment.');
      setCheckoutPhase('checkout_failed');
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBookOnline) {
      setError((prev) => prev ?? 'Online booking is disabled for this catalog. Call us to schedule.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setCheckoutError(null);
    setCheckoutPhase('saving_booking');
    setSavedBooking(null);
    setCheckoutTimedOut(false);
    setPhoneError(null);
    try {
      const p10 = normalizeUsPhone10Digits(guestPhone);
      if (!p10.ok) {
        setPhoneError(p10.error);
        setSubmitting(false);
        return;
      }
      const vehicles = bookingLines
        .filter((l) => l.serviceSlug && l.vehicleClass && l.vehicleDescription.trim() && l.vehicleColor.trim())
        .slice(0, 3)
        .map((l) => ({
          serviceSlug: l.serviceSlug.trim(),
          vehicleClass: normalizeVehicleClass(l.vehicleClass),
          vehicleDescription: l.vehicleDescription.trim(),
          vehicleColor: l.vehicleColor.trim(),
          addOnSlugs: l.addOnSlugs ?? [],
        }));

      if (vehicles.length === 0) {
        setError('Add at least one vehicle with year / make / model and color.');
        setSubmitting(false);
        return;
      }
      if (vehicles.length !== bookingLines.length) {
        setError('Vehicle color is required for every vehicle.');
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

      if (!serviceLocationType || !waterAccess || !powerAccess || !parkingAccess) {
        setError('Answer service location type and water, power, and parking access before checkout.');
        document.getElementById('service-address')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSubmitting(false);
        return;
      }

      const startIso = scheduled.toISOString();
      const bookingRes = await fetchWithTimeout('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 20000,
        body: JSON.stringify({
          vehicles,
          addOns: allAddOnSlugs,
          offerId: claimedOfferSnap?.id,
          scheduledStart: startIso,
          guestName,
          guestEmail,
          guestPhone: p10.digits10,
          smsConsent,
          smsConsentSource: 'online_booking',
          serviceAddress: serviceAddress.trim(),
          serviceCity: serviceCity.trim(),
          serviceState: serviceState.trim().toUpperCase(),
          serviceZip: serviceZip.replace(/\D/g, '').slice(0, 5),
          serviceAddressNotes: serviceAddressNotes.trim() || undefined,
          gateAccessNotes: serviceAddressNotes.trim() || undefined,
          serviceLocationType,
          waterAccess,
          powerAccess,
          parkingAccess,
          promoCode: appliedPromoCode || promoCode.trim() || undefined,
          paymentChoice: freePromoEligible ? 'full' : paymentChoice,
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
        setCheckoutPhase('idle');
        const errText = (bookingJson as { error?: string }).error ?? 'Booking failed';
        if (bookingRes.status === 409) {
          setScheduleError(errText);
          setError('That time slot was just taken. Please pick another time.');
        } else {
          setError(errText);
        }
        setSubmitting(false);
        return;
      }

      if (bookingJson.skipPayment && bookingJson.appointmentId) {
        clearBookingDraft();
        const q = new URLSearchParams({
          appointment_id: bookingJson.appointmentId,
          token: bookingJson.accessToken ?? '',
        });
        window.location.href = `/book/confirmation?${q.toString()}`;
        return;
      }

      const ref: SavedBookingRef = {
        appointmentId: bookingJson.appointmentId,
        fallbackBookingId: bookingJson.fallbackBookingId,
        accessToken: bookingJson.accessToken,
        usedFallback: bookingJson.usedFallback,
      };
      if (!ref.accessToken) {
        setError('Booking saved but access token missing — please call Gloss Boss ATX.');
        setCheckoutPhase('idle');
        setSubmitting(false);
        return;
      }
      setSavedBooking(ref);
      await startStripeCheckout({ ...ref, accessToken: ref.accessToken });
    } catch {
      setCheckoutPhase('idle');
      setError('Network error while saving your booking. Please try again.');
      setSubmitting(false);
    }
  };

  const submitButtonLabel = () => {
    if (checkoutPhase === 'saving_booking') return 'Saving your booking…';
    if (checkoutPhase === 'creating_checkout') return 'Creating secure checkout…';
    if (checkoutPhase === 'redirecting') return 'Opening Stripe…';
    if (checkoutPhase === 'pay_later_saving') return 'Saving pay-later…';
    if (freePromoEligible) return 'Continue with FREE comp';
    return paymentChoice === 'full' ? 'Pay full amount (Stripe)' : 'Continue to deposit (Stripe)';
  };

  return (
    <form onSubmit={handleSubmit} className='gb-booking-form space-y-8 overflow-x-hidden pb-28 lg:pb-8'>
      {draftExpiredNotice ? (
        <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100' role='status'>
          Your old booking draft expired. Start fresh — we kept your name and email.
        </p>
      ) : null}
      {catalogRefreshing ? (
        <div className='flex items-center gap-2 text-xs text-zinc-500' aria-live='polite'>
          <span className='inline-block h-3 w-3 animate-spin rounded-full border border-gold/30 border-t-gold-soft' aria-hidden />
          Updating prices…
        </div>
      ) : null}
      <div className='rounded-2xl border border-gold/25 bg-gradient-to-r from-gold/10 via-black/50 to-black p-4 text-sm text-zinc-200'>
        <p className='font-black uppercase tracking-wider text-gold-soft'>Member pricing</p>
        <p className='mt-1 text-xs leading-relaxed text-zinc-300'>
          Sign in to use member pricing and earn loyalty stamps. Already a member? Sign in before booking. Guest booking still works without an account.
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          <a href='/login?next=/book' className='rounded-lg border border-gold/35 px-3 py-2 text-xs font-black uppercase text-gold-soft'>Sign in</a>
          <a href='/memberships' className='rounded-lg border border-white/15 px-3 py-2 text-xs font-black uppercase text-zinc-200'>View memberships</a>
        </div>
      </div>
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
      {checkoutPhase === 'creating_checkout' || checkoutPhase === 'saving_booking' || checkoutPhase === 'redirecting' ? (
        <div className='rounded-xl border border-gold/35 bg-gold/10 p-4 text-sm text-gold-soft' role='status' aria-live='polite'>
          <p className='font-black uppercase tracking-wider'>{submitButtonLabel()}</p>
          <p className='mt-2 text-xs text-zinc-300'>Please keep this page open. Secure payment opens in a new step.</p>
          {checkoutTimedOut ? (
            <p className='mt-2 text-xs text-amber-200'>This is taking longer than expected (10s)…</p>
          ) : null}
        </div>
      ) : null}
      {checkoutPhase === 'checkout_failed' && savedBooking ? (
        <div className='rounded-xl border border-amber-500/45 bg-amber-500/10 p-4 text-sm' role='alert'>
          <p className='font-bold text-amber-100'>{checkoutError ?? CHECKOUT_FAIL_COPY}</p>
          <p className='mt-2 text-xs text-zinc-300'>Your appointment is saved. Choose an option below — you will not lose your booking.</p>
          <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
            <button
              type='button'
              onClick={() => void startStripeCheckout({ ...savedBooking, accessToken: savedBooking.accessToken! })}
              className='rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black'
            >
              Try checkout again
            </button>
            <button
              type='button'
              onClick={() => void handlePayLater()}
              className='rounded-xl border border-white/25 px-4 py-3 text-xs font-black uppercase text-white'
            >
              Continue booking and pay later
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100' role='alert'>
          {error}
        </p>
      ) : null}

      <div className='grid min-w-0 max-w-full gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,280px)]'>
        <div className='order-2 min-w-0 space-y-8 lg:order-1'>
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
              <label className='mt-3 block text-sm'>
                <span className='mb-2 block text-zinc-300'>Color</span>
                <input
                  value={line.vehicleColor}
                  onChange={(e) => updateExtra(idx, { vehicleColor: e.target.value })}
                  className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                  placeholder='Black'
                  required
                />
              </label>
              {renderVehicleAddOns(idx + 1, line.addOnSlugs ?? [])}
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

          <section id='service-address' className='grid gap-4 rounded-2xl border border-gold/20 bg-black/45 p-4 md:grid-cols-2'>
            <div className='md:col-span-2'>
              <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Service address & access</p>
              <p className='mt-1 text-xs text-zinc-500'>Required before payment so we can confirm drive distance and arrival details.</p>
              <p className='mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100'>
                Gloss Boss ATX is a mobile detailing service. At this time, service requires safe access to the vehicle, water access, and power access. Apartment, condo, and shared parking locations may not be serviceable unless water, power, and working space are available. If access is limited, we may contact you to adjust or reschedule your appointment.
              </p>
            </div>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Service location type</span>
              <select
                value={serviceLocationType}
                onChange={(e) => setServiceLocationType(e.target.value as typeof serviceLocationType)}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                required
              >
                <option value=''>Select…</option>
                <option value='house'>House</option>
                <option value='apartment'>Apartment / condo</option>
                <option value='business'>Business / office</option>
                <option value='other'>Other</option>
              </select>
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>Water access available?</span>
              <select value={waterAccess} onChange={(e) => setWaterAccess(e.target.value as typeof waterAccess)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required>
                <option value=''>Select…</option>
                <option value='yes'>Yes</option>
                <option value='no'>No</option>
                <option value='unsure'>Unsure</option>
              </select>
            </label>
            <label className='text-sm'>
              <span className='mb-2 block text-zinc-300'>Power outlet access?</span>
              <select value={powerAccess} onChange={(e) => setPowerAccess(e.target.value as typeof powerAccess)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required>
                <option value=''>Select…</option>
                <option value='yes'>Yes</option>
                <option value='no'>No</option>
                <option value='unsure'>Unsure</option>
              </select>
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Parking / service space available?</span>
              <select value={parkingAccess} onChange={(e) => setParkingAccess(e.target.value as typeof parkingAccess)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' required>
                <option value=''>Select…</option>
                <option value='yes'>Yes</option>
                <option value='no'>No</option>
                <option value='unsure'>Unsure</option>
              </select>
            </label>
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
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Vehicle 1 color</span>
              <input
                value={vehicleColor}
                onChange={(e) => setVehicleColor(e.target.value)}
                className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3'
                placeholder='Black'
                required
              />
            </label>
            {renderVehicleAddOns(0, primaryAddOnSlugs)}
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
            <fieldset className='rounded-xl border border-white/10 bg-black/35 p-4 text-sm md:col-span-2'>
              <legend className='px-1 text-xs font-black uppercase tracking-wider text-gold-soft'>Optional SMS updates</legend>
              <p className='text-xs leading-relaxed text-zinc-400'>
                {SMS_CONSENT_COPY}{' '}
                <a href='/privacy' className='text-gold-soft underline' target='_blank' rel='noreferrer'>
                  Privacy
                </a>{' '}
                and{' '}
                <a href='/terms' className='text-gold-soft underline' target='_blank' rel='noreferrer'>
                  Terms
                </a>
                .
              </p>
              <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                <label className={clsx('rounded-lg border px-3 py-3 text-xs font-semibold transition', smsConsent ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-300')}>
                  <input
                    type='radio'
                    name='smsConsent'
                    value='yes'
                    checked={smsConsent === true}
                    onChange={() => setSmsConsent(true)}
                    className='mr-2 accent-[var(--gold)]'
                  />
                  Yes, I agree to receive SMS updates.
                </label>
                <label className={clsx('rounded-lg border px-3 py-3 text-xs font-semibold transition', !smsConsent ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-300')}>
                  <input
                    type='radio'
                    name='smsConsent'
                    value='no'
                    checked={smsConsent === false}
                    onChange={() => setSmsConsent(false)}
                    className='mr-2 accent-[var(--gold)]'
                  />
                  No, do not send me SMS updates.
                </label>
              </div>
              <p className='mt-2 text-xs text-zinc-500'>No is selected by default. You can still book and pay without SMS consent.</p>
            </fieldset>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Notes (optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className='w-full rounded-lg border border-zinc-700 bg-black px-4 py-3' rows={3} />
            </label>
            <label className='text-sm md:col-span-2'>
              <span className='mb-2 block text-zinc-300'>Promo code (optional)</span>
              <div className='flex gap-2'>
                <input
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setAppliedPromoCode('');
                    setPromoMessage(null);
                  }}
                  placeholder='Enter code'
                  className='min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-4 py-3 uppercase tracking-wider'
                />
                <button type='button' onClick={applyPromo} className='rounded-lg border border-gold/40 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft'>
                  Apply
                </button>
              </div>
              {promoMessage ? (
                <p className={clsx('mt-2 rounded-lg border p-2 text-xs font-semibold', appliedPromoCode === 'FREE' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100')}>
                  {promoMessage}
                </p>
              ) : promoCode.trim().toUpperCase() === 'FREE' && !freePromoEnabledOnServer ? (
                <p className='mt-2 text-xs text-amber-200'>
                  FREE promo is off. In Admin → Promotions, enable the FREE row and save, then refresh this page.
                </p>
              ) : promoCode.trim().toUpperCase() === 'FREE' && freePromoEnabledOnServer && !freePromoEligible ? (
                <p className='mt-2 text-xs text-emerald-200'>FREE is on — applying… total will be $0.00.</p>
              ) : null}
            </label>
          </section>

          <section className='rounded-xl border border-gold/20 bg-black/60 p-4 text-sm text-zinc-300'>
            <div className='mb-4 grid gap-2 sm:grid-cols-2'>
              <button
                type='button'
                onClick={() => setPaymentChoice('deposit')}
                disabled={freePromoEligible}
                className={clsx(
                  'rounded-xl border px-4 py-3 text-left transition',
                  paymentChoice === 'deposit' && !freePromoEligible ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/15 text-zinc-300',
                  freePromoEligible && 'opacity-50',
                )}
              >
                <span className='block text-xs font-black uppercase tracking-wider'>Pay deposit</span>
                <span className='mt-1 block text-xs text-zinc-400'>Reserve now, pay balance later.</span>
              </button>
              <button
                type='button'
                onClick={() => setPaymentChoice('full')}
                className={clsx(
                  'rounded-xl border px-4 py-3 text-left transition',
                  paymentChoice === 'full' || freePromoEligible ? 'border-gold bg-gold/10 text-gold-soft' : 'border-white/15 text-zinc-300',
                )}
              >
                <span className='block text-xs font-black uppercase tracking-wider'>{freePromoEligible ? 'Comped / Pay full' : 'Pay full amount now'}</span>
                <span className='mt-1 block text-xs text-zinc-400'>{freePromoEligible ? 'FREE test comp bypasses Stripe.' : 'No remaining balance after checkout.'}</span>
              </button>
            </div>
            <p>
              {freePromoEligible ? 'FREE test comp is applied. Stripe will be bypassed and you will continue to agreement signing.' : 'After checkout, you will continue to sign the liability agreement. Your booking is confirmed only after the agreement is signed. If Stripe is disabled, you will continue without card checkout.'}
            </p>
          </section>

          <button
            type='submit'
            disabled={submitting || services.length === 0 || !canBookOnline}
            className='w-full rounded-xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_25px_rgba(212,166,77,0.35)] transition hover:brightness-110 disabled:opacity-50 lg:hidden'
          >
            {submitButtonLabel()}
          </button>
        </div>

        <aside className='order-1 h-fit space-y-4 rounded-2xl border border-gold/25 bg-gradient-to-b from-zinc-950/95 to-black/90 p-5 shadow-[0_0_36px_rgba(212,166,77,0.12)] lg:order-2 lg:sticky lg:top-28'>
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
                {freePromoEligible ? (
                  <p className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs font-bold text-emerald-100'>
                    Promo FREE applied — $0.00 total. Stripe skipped; you will continue to agreement signing.
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
                {freePromoEligible ? (
                  <p className='flex justify-between text-xs text-emerald-300'>
                    <span>FREE test comp</span>
                    <span className='tabular-nums'>-${(priceSummary.breakdown.prePromoCents / 100).toFixed(2)}</span>
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
            {allAddOnSlugs.length > 0 ? (
              <p className='text-xs text-zinc-500'>
                Add-ons:{' '}
                {bookingLines
                  .map((line, i) => {
                    const labels = (line.addOnSlugs ?? []).map((s) => addonOptions.find((a) => a.slug === s)?.label ?? s);
                    return labels.length ? `V${i + 1}: ${labels.join(', ')}` : '';
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
          <button
            type='submit'
            disabled={submitting || services.length === 0 || !canBookOnline}
            className='hidden w-full rounded-xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_25px_rgba(212,166,77,0.35)] transition hover:brightness-110 disabled:opacity-50 lg:block'
          >
            {submitButtonLabel()}
          </button>
        </aside>
      </div>

      {priceSummary?.kind === 'ok' ? (
        <div
          className='fixed inset-x-0 bottom-0 z-50 border-t border-gold/35 bg-black/95 px-4 py-3 backdrop-blur-md lg:hidden'
          role='status'
          aria-live='polite'
        >
          <div className='mx-auto flex max-w-5xl items-center justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Total</p>
              <p className='text-lg font-black tabular-nums text-white'>
                ${(priceSummary.breakdown.finalTotalCents / 100).toFixed(2)}
              </p>
              <p className='text-[10px] text-zinc-400'>
                Deposit ${(priceSummary.breakdown.depositCents / 100).toFixed(2)} ·{' '}
                {paymentChoice === 'full' || freePromoEligible ? 'Pay full' : 'Pay deposit'}
              </p>
            </div>
            {freePromoEligible ? (
              <span className='shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase text-emerald-200'>
                FREE
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
