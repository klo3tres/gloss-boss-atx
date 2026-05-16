'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { techSearchCustomersAction } from '@/app/(dashboard)/tech/tech-customer-search-actions';
import { techCompleteJobAction, techStartJobAction } from '@/app/(dashboard)/tech/tech-actions';
import { techCreateWalkInJobAction, techSignWalkInAgreementAction } from '@/app/(dashboard)/tech/tech-workflow-actions';
import { normalizeVehicleClass, UI_VEHICLE_CLASSES, type UiVehicleClass } from '@/lib/vehicle-pricing';
import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';

type CatalogService = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };
type AddonOpt = { slug: string; label: string; price_cents: number };

const STEPS = 9;
const WALKIN_STORAGE_KEY = 'glossboss_tech_walkin_v1';
const PHOTO_CATEGORIES = [
  { value: 'front', label: 'Front' },
  { value: 'rear', label: 'Rear' },
  { value: 'driver_side', label: 'Driver side' },
  { value: 'passenger_side', label: 'Passenger side' },
  { value: 'interior', label: 'Interior' },
  { value: 'wheels', label: 'Wheels' },
  { value: 'damage', label: 'Damage' },
  { value: 'other', label: 'Other' },
] as const;
type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]['value'];
type PhotoPreview = { src: string; uploadedAt: string; savedTo?: string };

function pickLineCents(prices: PriceRow[], serviceId: string, vehicleClass: UiVehicleClass): number | null {
  const row = prices.find((p) => p.service_id === serviceId && p.vehicle_class === vehicleClass);
  if (!row || typeof row.price_cents !== 'number' || row.price_cents <= 0) return null;
  return row.price_cents;
}

function addonSumCents(addons: AddonOpt[], slugs: Set<string>): number {
  let s = 0;
  for (const a of addons) {
    if (slugs.has(a.slug)) s += a.price_cents;
  }
  return s;
}

export function TechWorkflowWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, startTransition] = useTransition();

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRows, setSearchRows] = useState<{ id: string; email: string; full_name: string | null; phone: string | null }[]>([]);

  const [vehicleClass, setVehicleClass] = useState<UiVehicleClass>('sedan');
  const [vehicleDescription, setVehicleDescription] = useState('');

  const [services, setServices] = useState<CatalogService[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);

  const [addons, setAddons] = useState<AddonOpt[]>([]);
  const [addonSlugs, setAddonSlugs] = useState<Set<string>>(new Set());

  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [fallbackBookingId, setFallbackBookingId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lockedTotalCents, setLockedTotalCents] = useState<number | null>(null);

  const [signerName, setSignerName] = useState('');
  const [agreementAck, setAgreementAck] = useState(false);
  const [beforePreviews, setBeforePreviews] = useState<PhotoPreview[]>([]);
  const [afterPreviews, setAfterPreviews] = useState<PhotoPreview[]>([]);
  const [beforePreviewByCategory, setBeforePreviewByCategory] = useState<Record<string, PhotoPreview[]>>({});
  const [afterPreviewByCategory, setAfterPreviewByCategory] = useState<Record<string, PhotoPreview[]>>({});
  const [beforeCount, setBeforeCount] = useState(0);
  const [afterCount, setAfterCount] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [timerId, setTimerId] = useState<string | null>(null);
  const [checklistText, setChecklistText] = useState('Walk-around inspection\nPre-wash photos\nInterior protection\nFinal QC');
  const [beforeNotes, setBeforeNotes] = useState('');
  const [afterNotes, setAfterNotes] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [upsellNotes, setUpsellNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WALKIN_STORAGE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as {
        appointmentId?: string | null;
        fallbackBookingId?: string | null;
        accessToken?: string | null;
        lockedTotalCents?: number;
        savedAt?: number;
      };
      if ((!o.appointmentId && !o.fallbackBookingId) || typeof o.savedAt !== 'number') return;
      if (Date.now() - o.savedAt > 36 * 3600000) {
        sessionStorage.removeItem(WALKIN_STORAGE_KEY);
        return;
      }
      setAppointmentId((prev) => prev ?? o.appointmentId ?? null);
      setFallbackBookingId((prev) => prev ?? o.fallbackBookingId ?? null);
      setAccessToken((prev) => prev ?? o.accessToken ?? null);
      if (typeof o.lockedTotalCents === 'number') {
        setLockedTotalCents((prev) => (prev != null ? prev : o.lockedTotalCents ?? null));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/services', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { services?: CatalogService[]; prices?: PriceRow[] }) => {
        if (cancelled) return;
        const sv = Array.isArray(j.services) ? j.services : [];
        const pr = Array.isArray(j.prices) ? j.prices : [];
        setServices(sv);
        setPrices(pr);
        setServiceId((prev) => {
          if (prev) return prev;
          const first = sv.find((s) => s.slug !== 'ceramic-coating') ?? sv[0];
          return first?.id ?? null;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/public/addons', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (j: {
          addons?: { slug?: string | null; label?: string | null; name?: string | null; price_cents?: number | null }[];
        }) => {
          if (cancelled) return;
          const raw = j.addons ?? [];
          setAddons(
            raw.map((a) => ({
              slug: String(a.slug ?? '').trim(),
              label: String(a.label ?? a.name ?? a.slug ?? '').trim() || String(a.slug),
              price_cents: typeof a.price_cents === 'number' ? a.price_cents : 0,
            })).filter((a) => a.slug),
          );
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);

  const estimatedLineCents = useMemo(() => {
    if (!serviceId) return null;
    return pickLineCents(prices, serviceId, vehicleClass);
  }, [prices, serviceId, vehicleClass]);

  const estimatedAddonCents = useMemo(() => addonSumCents(addons, addonSlugs), [addons, addonSlugs]);

  const estimatedTotalCents = useMemo(() => {
    if (estimatedLineCents == null) return null;
    return estimatedLineCents + estimatedAddonCents;
  }, [estimatedLineCents, estimatedAddonCents]);

  const walkInAgreementPreview = useMemo(() => {
    if (!selectedService) return '';
    const line = lockedTotalCents ?? estimatedTotalCents ?? estimatedLineCents ?? 0;
    const classLabel = vehicleClass === 'suv_truck' ? 'SUV / Truck' : 'Sedan';
    return buildNativeAgreementSnapshot({
      customerName: guestName.trim() || 'Customer',
      customerEmail: guestEmail.trim(),
      customerPhone: guestPhone.replace(/\D/g, ''),
      vehicleDescription: vehicleDescription.trim() || '—',
      serviceLabel: selectedService.title || selectedService.slug.replace(/-/g, ' '),
      vehicleClassLabel: classLabel,
      totalDollars: (line / 100).toFixed(2),
      depositNote: 'Walk-in field job — deposit $0 unless collected separately.',
      technicianName: null,
    });
  }, [
    selectedService,
    lockedTotalCents,
    estimatedTotalCents,
    estimatedLineCents,
    vehicleClass,
    guestName,
    guestEmail,
    guestPhone,
    vehicleDescription,
  ]);

  const runSearch = useCallback(() => {
    startTransition(() => {
      void techSearchCustomersAction(searchQ).then((r) => {
        if (r.ok) setSearchRows(r.rows);
      });
    });
  }, [searchQ]);

  const selectCustomer = (row: { id: string; email: string; full_name: string | null; phone: string | null }) => {
    setCustomerId(row.id);
    setGuestEmail(row.email);
    setGuestName(row.full_name ?? '');
    setGuestPhone(row.phone ?? '');
    setSearchRows([]);
    setSearchQ('');
  };

  const clearCustomer = () => {
    setCustomerId(null);
  };

  const toggleAddon = (slug: string) => {
    setAddonSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const goNext = () => setStep((s) => Math.min(STEPS, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const canProceed1 = guestName.trim().length > 1 && guestEmail.includes('@') && guestPhone.replace(/\D/g, '').length >= 10;

  const canProceed2 = vehicleDescription.trim().length > 3;

  const ceramicNeedsQuote = selectedService?.slug === 'ceramic-coating' && estimatedLineCents == null;
  const canProceed3 = Boolean(selectedService && !ceramicNeedsQuote && estimatedLineCents != null);

  const createJob = () => {
    if (!selectedService || estimatedLineCents == null) {
      setError(
        selectedService?.slug === 'ceramic-coating'
          ? 'Ceramic coating is set to Quote — add sedan/SUV prices in Admin → Services & pricing first, or choose another package.'
          : 'Choose a priced service.',
      );
      return;
    }
    setError(null);
    startTransition(() => {
      void techCreateWalkInJobAction({
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
        customerId,
        vehicles: [
          {
            serviceSlug: selectedService.slug,
            vehicleClass: normalizeVehicleClass(vehicleClass),
            vehicleDescription: vehicleDescription.trim(),
          },
        ],
        addOns: Array.from(addonSlugs),
        notes: 'Tech workflow walk-in',
      }).then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        try {
          sessionStorage.setItem(
            WALKIN_STORAGE_KEY,
            JSON.stringify({
              appointmentId: r.appointmentId,
              fallbackBookingId: r.fallbackBookingId ?? null,
              accessToken: r.accessToken,
              lockedTotalCents: r.totalCents,
              savedAt: Date.now(),
            }),
          );
        } catch {
          /* ignore */
        }
        setAppointmentId(r.appointmentId);
        setFallbackBookingId(r.fallbackBookingId ?? null);
        setAccessToken(r.accessToken);
        setLockedTotalCents(r.totalCents);
        setSignerName(guestName.trim());
        goNext();
      });
    });
  };

  const signAgreement = () => {
    if (!appointmentId && fallbackBookingId) {
      if (!agreementAck) {
        setError('Review the acknowledgement and check the box to continue.');
        return;
      }
      goNext();
      return;
    }
    if (!appointmentId) return;
    if (!agreementAck) {
      setError('Review the acknowledgement and check the box to continue.');
      return;
    }
    setError(null);
    startTransition(() => {
      void techSignWalkInAgreementAction({
        appointmentId,
        signerLegalName: signerName.trim(),
        signatureType: 'typed',
        signatureData: signerName.trim(),
      }).then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        goNext();
      });
    });
  };

  const uploadPhoto = (file: File | null, photoCat: PhotoCategory, phase: 'before' | 'after') => {
    if (!file || (!appointmentId && !fallbackBookingId)) return;
    const fd = new FormData();
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    if (accessToken) fd.set('accessToken', accessToken);
    if (appointmentId) fd.set('jobReference', appointmentId);
    else if (fallbackBookingId) fd.set('jobReference', fallbackBookingId);
    if (fallbackBookingId) fd.set('techWorkflowId', fallbackBookingId);
    fd.set('category', phase);
    fd.set('photoCategory', photoCat);
    fd.set('file', file);
    startTransition(() => {
      void fetch('/api/tech/job-media-upload', {
        method: 'POST',
        body: fd,
      }).then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          error?: string;
          category?: string;
          savedTo?: string;
          uploadedAt?: string;
        };
        if (!res.ok || !j.ok) {
          setError(j.error ?? 'Photo upload failed.');
          return;
        }
        const preview: PhotoPreview = {
          src: URL.createObjectURL(file),
          uploadedAt: j.uploadedAt ?? new Date().toISOString(),
          savedTo: j.savedTo,
        };
        if (phase === 'after') {
          setAfterCount((c) => c + 1);
          setAfterPreviews((p) => [preview, ...p].slice(0, 8));
          setAfterPreviewByCategory((prev) => ({ ...prev, [photoCat]: [preview, ...(prev[photoCat] ?? [])].slice(0, 4) }));
        } else {
          setBeforeCount((c) => c + 1);
          setBeforePreviews((p) => [preview, ...p].slice(0, 8));
          setBeforePreviewByCategory((prev) => ({ ...prev, [photoCat]: [preview, ...(prev[photoCat] ?? [])].slice(0, 4) }));
        }
        setError(null);
      });
    });
  };

  const startTimer = async () => {
    if (!appointmentId && !fallbackBookingId) return;
    setTimerError(null);
    try {
      const res = await fetch('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', appointmentId: appointmentId ?? undefined, fallbackBookingId: fallbackBookingId ?? undefined, label: 'Walk-in workflow' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTimerError(typeof j.error === 'string' ? j.error : 'Could not start timer');
        return;
      }
      setTimerStarted(true);
      if (typeof j.id === 'string') setTimerId(j.id);
      if (appointmentId) {
        const fd = new FormData();
        fd.set('appointmentId', appointmentId);
        const started = await techStartJobAction(null, fd);
        if (started?.error) setTimerError(started.error);
      }
    } catch {
      setTimerError('Network error starting timer');
    }
  };

  const saveWorkflowNotes = () => {
    if (!appointmentId && !fallbackBookingId) return;
    startTransition(() => {
      void fetch('/api/tech/job-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointmentId ?? undefined,
          fallbackBookingId: fallbackBookingId ?? undefined,
          checklist: checklistText.split('\n').map((s) => s.trim()).filter(Boolean),
          beforeNotes,
          afterNotes,
          damageNotes,
          internalNotes,
          upsellSuggestions: upsellNotes,
          customerVisible: customerVisibleNotes,
        }),
      }).then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setError(j.error ?? 'Could not save notes.');
          return;
        }
        setError(null);
      });
    });
  };

  const completeJob = () => {
    if (!appointmentId) {
      setError('Fallback workflow saved. Convert the fallback to an appointment from Dispatch before completing.');
      return;
    }
    startTransition(() => {
      saveWorkflowNotes();
      const fd = new FormData();
      fd.set('appointmentId', appointmentId);
      void techCompleteJobAction(null, fd).then((r) => {
        if (r?.error) {
          setError(r.error);
          return;
        }
        router.push('/tech');
      });
    });
  };

  return (
    <div className='mx-auto max-w-2xl space-y-8 pb-24'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft'>
          Step {step} / {STEPS}
        </p>
        <Link href='/tech' className='text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-gold-soft'>
          Exit to dashboard
        </Link>
      </div>

      <div className='h-1.5 overflow-hidden rounded-full bg-zinc-800'>
        <div
          className='h-full bg-gradient-to-r from-gold/80 to-amber-400 transition-all duration-500'
          style={{ width: `${(step / STEPS) * 100}%` }}
        />
      </div>

      {error ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200' role='alert'>
          {error}
        </p>
      ) : null}
      {timerError ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100' role='alert'>
          {timerError}
        </p>
      ) : null}

      {step === 1 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>1 · Customer</h2>
          <p className='text-sm text-zinc-400'>Search an existing customer or enter details for a new profile.</p>
          <div className='flex flex-wrap gap-2'>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder='Search name, email, phone'
              className='min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
            <button
              type='button'
              disabled={busy || searchQ.trim().length < 2}
              onClick={runSearch}
              className='rounded-lg border border-gold/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold-soft disabled:opacity-40'
            >
              Search
            </button>
          </div>
          {customerId ? (
            <p className='text-xs text-emerald-300'>
              Linked customer record ·{' '}
              <button type='button' onClick={clearCustomer} className='underline'>
                clear
              </button>
            </p>
          ) : null}
          {searchRows.length > 0 ? (
            <ul className='max-h-48 space-y-1 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-sm'>
              {searchRows.map((r) => (
                <li key={r.id}>
                  <button
                    type='button'
                    onClick={() => selectCustomer(r)}
                    className='w-full rounded px-2 py-1.5 text-left hover:bg-white/5'
                  >
                    <span className='font-semibold text-white'>{r.full_name ?? r.email}</span>
                    <span className='block text-xs text-zinc-500'>{r.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className='block text-xs text-zinc-400'>
            Full name
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Email
            <input
              type='email'
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Phone
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <div className='flex justify-end'>
            <button
              type='button'
              disabled={!canProceed1}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>2 · Vehicle</h2>
          <label className='block text-xs text-zinc-400'>
            Vehicle class
            <select
              value={vehicleClass}
              onChange={(e) => setVehicleClass(e.target.value as UiVehicleClass)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            >
              {UI_VEHICLE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c === 'sedan' ? 'Sedan' : 'SUV / Truck'}
                </option>
              ))}
            </select>
          </label>
          <label className='block text-xs text-zinc-400'>
            Year, make, model &amp; color (or VIN notes)
            <textarea
              value={vehicleDescription}
              onChange={(e) => setVehicleDescription(e.target.value)}
              rows={3}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={!canProceed2}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>3 · Service</h2>
          {services.length === 0 ? (
            <p className='text-sm text-zinc-500'>Loading catalog…</p>
          ) : (
            <ul className='space-y-2'>
              {services.map((s) => {
                const cents = pickLineCents(prices, s.id, vehicleClass);
                const disabled = cents == null;
                return (
                  <li key={s.id}>
                    <button
                      type='button'
                      disabled={disabled}
                      onClick={() => setServiceId(s.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        serviceId === s.id ? 'border-gold bg-gold/10' : 'border-white/10 bg-black/40 hover:border-gold/30'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className='font-bold text-white'>{s.title}</span>
                      <span className='block text-xs text-zinc-500'>{s.subtitle}</span>
                      <span className='mt-1 block text-xs text-gold-soft'>
                        {disabled ? 'Quote — set price in Admin → Services' : `$${(cents / 100).toFixed(0)} (${vehicleClass.replace('_', ' ')})`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={!canProceed3}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>4 · Add-ons</h2>
          {addons.length === 0 ? (
            <p className='text-sm text-zinc-500'>No active add-ons in catalog.</p>
          ) : (
            <ul className='space-y-2'>
              {addons.map((a) => (
                <li key={a.slug}>
                  <label className='flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                    <input
                      type='checkbox'
                      checked={addonSlugs.has(a.slug)}
                      onChange={() => toggleAddon(a.slug)}
                      className='rounded border-zinc-600'
                    />
                    <span className='flex-1 text-sm text-zinc-200'>
                      {a.label}{' '}
                      <span className='text-gold-soft'>(+${(a.price_cents / 100).toFixed(0)})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>5 · Quote total</h2>
          <div className='rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-300'>
            <p>
              <span className='text-zinc-500'>Service:</span> {selectedService?.title ?? '—'}
            </p>
            <p>
              <span className='text-zinc-500'>Vehicle:</span> {vehicleDescription}
            </p>
            <p>
              <span className='text-zinc-500'>Line:</span>{' '}
              {estimatedLineCents != null ? `$${(estimatedLineCents / 100).toFixed(2)}` : '—'}
            </p>
            <p>
              <span className='text-zinc-500'>Add-ons:</span> ${(estimatedAddonCents / 100).toFixed(2)}
            </p>
            <p className='mt-3 text-lg font-black text-white'>
              Estimated total:{' '}
              {estimatedTotalCents != null ? `$${(estimatedTotalCents / 100).toFixed(2)}` : 'Unavailable'}
            </p>
            <p className='mt-2 text-xs text-zinc-500'>
              Creates a walk-in job assigned to you (not the public booking funnel). Final total is computed server-side with your live
              pricing rules.
            </p>
          </div>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={busy || estimatedTotalCents == null}
              onClick={createJob}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              {busy ? 'Creating…' : 'Create job & continue'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>6 · Acknowledgement</h2>
          <p className='text-sm text-zinc-400'>
            Review the Gloss Boss ATX acknowledgement below. The customer must provide their full legal name; a drawn signature is optional.
          </p>
          {!appointmentId && !fallbackBookingId ? (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
              No job is linked to this step. Go back to <strong>5 · Quote total</strong> and tap <strong>Create job & continue</strong>. If you
              already created the job this session, refresh the page — your job id is restored automatically when possible.
            </p>
          ) : fallbackBookingId && !appointmentId ? (
            <>
              <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
                Appointment insert fell back to a review row. This workflow will keep saving photos, timer, and notes against fallback{' '}
                <span className='font-mono'>{fallbackBookingId.slice(0, 8)}…</span> until Dispatch converts it.
              </p>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={agreementAck}
                  onChange={(e) => setAgreementAck(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>Customer reviewed the acknowledgement and authorized the fallback field workflow.</span>
              </label>
              <div className='flex justify-between gap-2'>
                <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
                  Back
                </button>
                <button
                  type='button'
                  disabled={busy || !agreementAck}
                  onClick={signAgreement}
                  className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
                >
                  Continue with fallback
                </button>
              </div>
            </>
          ) : (
            <>
              <article className='max-h-[min(60vh,32rem)] overflow-y-auto rounded-sm border border-zinc-200/90 bg-white p-5 text-zinc-900 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_12px_40px_rgba(0,0,0,0.35)] sm:p-8'>
                <header className='border-b border-amber-600/30 pb-4'>
                  <p className='text-[10px] font-black uppercase tracking-[0.28em] text-amber-700'>Gloss Boss ATX</p>
                  <h3 className='mt-2 font-serif text-lg font-bold text-black sm:text-xl'>{DEFAULT_AGREEMENT_TITLE}</h3>
                  {lockedTotalCents != null ? (
                    <p className='mt-2 text-sm text-zinc-600'>
                      Agreed job total: <span className='font-semibold text-black'>${(lockedTotalCents / 100).toFixed(2)}</span>
                      <span className='text-zinc-400'> · Ref. {appointmentId ? appointmentId.slice(0, 8) : 'fallback'}…</span>
                    </p>
                  ) : null}
                </header>
                <pre className='mt-5 whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-zinc-800 sm:text-[14px]'>
                  {walkInAgreementPreview}
                </pre>
              </article>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={agreementAck}
                  onChange={(e) => setAgreementAck(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>
                  Customer has read the acknowledgement and agrees to its terms. I confirm the information above matches this job.
                </span>
              </label>
              <label className='block text-xs text-zinc-400'>
                Signer legal name (must match ID)
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <div className='flex justify-between gap-2'>
                <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
                  Back
                </button>
                <button
                  type='button'
                  disabled={busy || signerName.trim().length < 2 || !agreementAck}
                  onClick={signAgreement}
                  className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
                >
                  {busy ? 'Saving…' : 'Accept & record signature'}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === 7 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>7 · Before photos</h2>
          <p className='text-sm text-zinc-400'>Upload photos from your phone or computer. JPEG, PNG, and WEBP are supported.</p>
          <p className='text-xs text-zinc-500'>Recorded this session: {beforeCount}</p>
          <div className='grid gap-3 sm:grid-cols-2'>
            {PHOTO_CATEGORIES.map((cat) => (
              <label
                key={cat.value}
                className='block rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300 transition hover:border-gold/35 hover:bg-gold/5'
              >
                <span className='font-black uppercase tracking-wider text-gold-soft'>{cat.label}</span>
                <span className='mt-1 block text-[10px] text-zinc-500'>Tap to take or upload photo.</span>
                <input
                  type='file'
                  accept='image/*'
                  capture='environment'
                  onChange={(e) => {
                    uploadPhoto(e.target.files?.[0] ?? null, cat.value, 'before');
                    e.currentTarget.value = '';
                  }}
                  className='mt-3 w-full text-[11px] text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-gold file:px-3 file:py-1 file:text-xs file:font-bold file:text-black'
                />
                {beforePreviewByCategory[cat.value]?.length ? (
                  <div className='mt-3 grid grid-cols-3 gap-2'>
                    {beforePreviewByCategory[cat.value].map((src) => (
                      <div key={src.src} className='space-y-1'>
                        <img src={src.src} alt={`${cat.label} before upload preview`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                        <p className='text-[9px] text-emerald-300'>Uploaded {new Date(src.uploadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                        {src.savedTo === 'fallback' ? <p className='text-[9px] text-amber-200'>Saved to fallback job record</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </label>
            ))}
          </div>
          {beforePreviews.length > 0 ? (
            <div className='grid grid-cols-3 gap-2'>
              {beforePreviews.map((src) => (
                <img key={src.src} src={src.src} alt='Uploaded job preview' className='aspect-square rounded-lg border border-white/10 object-cover' />
              ))}
            </div>
          ) : null}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={beforeCount < 1}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 8 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>8 · Start timer</h2>
          <p className='text-sm text-zinc-400'>Starts a tech_job_timers row linked to this appointment for reporting.</p>
          <div className='flex flex-wrap justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            {timerStarted ? (
              <button type='button' onClick={goNext} className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase text-black'>
                Continue
              </button>
            ) : (
              <button
                type='button'
                onClick={() => void startTimer()}
                className='rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white'
              >
                Start timer
              </button>
            )}
          </div>
        </section>
      ) : null}

      {step === 9 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>9 · Notes, after photos & complete</h2>
          <p className='text-sm text-zinc-400'>Save the checklist and notes, upload after photos, then complete the field job.</p>
          {!timerStarted ? (
            <p className='text-sm text-amber-200'>Start the timer on the previous step before marking this job in progress.</p>
          ) : null}
          {timerId ? <p className='text-xs text-emerald-300'>Timer running · {timerId.slice(0, 8)}…</p> : null}
          <label className='block text-xs text-zinc-400'>
            Checklist (one item per line)
            <textarea
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              rows={4}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
            />
          </label>
          <div className='grid gap-3 sm:grid-cols-2'>
            <label className='block text-xs text-zinc-400'>
              Before notes
              <textarea value={beforeNotes} onChange={(e) => setBeforeNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-zinc-400'>
              After notes
              <textarea value={afterNotes} onChange={(e) => setAfterNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-rose-300/90'>
              Damage notes
              <textarea value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-rose-900/40 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-amber-200/90'>
              Internal notes
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-amber-900/40 bg-black px-3 py-2 text-sm text-white' />
            </label>
          </div>
          <label className='block text-xs text-zinc-400'>
            Upsell notes
            <textarea value={upsellNotes} onChange={(e) => setUpsellNotes(e.target.value)} rows={2} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='flex items-center gap-2 text-xs text-zinc-400'>
            <input type='checkbox' checked={customerVisibleNotes} onChange={(e) => setCustomerVisibleNotes(e.target.checked)} />
            Mark non-internal notes customer-visible
          </label>
          <div className='rounded-xl border border-white/10 bg-black/30 p-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>After photos ({afterCount})</p>
            <div className='mt-3 grid gap-3 sm:grid-cols-2'>
              {PHOTO_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className='block rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300 transition hover:border-gold/35 hover:bg-gold/5'
                >
                  <span className='font-black uppercase tracking-wider text-gold-soft'>{cat.label}</span>
                  <span className='mt-1 block text-[10px] text-zinc-500'>Tap to take or upload photo.</span>
                  <input
                    type='file'
                    accept='image/*'
                    capture='environment'
                    onChange={(e) => {
                      uploadPhoto(e.target.files?.[0] ?? null, cat.value, 'after');
                      e.currentTarget.value = '';
                    }}
                    className='mt-3 w-full text-[11px] text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-gold file:px-3 file:py-1 file:text-xs file:font-bold file:text-black'
                  />
                  {afterPreviewByCategory[cat.value]?.length ? (
                    <div className='mt-3 grid grid-cols-3 gap-2'>
                      {afterPreviewByCategory[cat.value].map((src) => (
                        <div key={src.src} className='space-y-1'>
                          <img src={src.src} alt={`${cat.label} after upload preview`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                          <p className='text-[9px] text-emerald-300'>Uploaded {new Date(src.uploadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                          {src.savedTo === 'fallback' ? <p className='text-[9px] text-amber-200'>Saved to fallback job record</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </label>
              ))}
            </div>
            {afterPreviews.length > 0 ? (
              <div className='mt-3 grid grid-cols-3 gap-2'>
                {afterPreviews.map((src) => (
                  <img key={src.src} src={src.src} alt='Uploaded after preview' className='aspect-square rounded-lg border border-white/10 object-cover' />
                ))}
              </div>
            ) : null}
          </div>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={saveWorkflowNotes}
              className='rounded-lg border border-gold/40 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-gold-soft disabled:opacity-40'
            >
              Save notes
            </button>
            <button
              type='button'
              disabled={busy || !timerStarted || afterCount < 1}
              onClick={completeJob}
              className='rounded-lg bg-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              {busy ? 'Saving…' : appointmentId ? 'Complete job' : 'Save fallback'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
