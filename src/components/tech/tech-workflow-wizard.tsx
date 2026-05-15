'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { techSearchCustomersAction } from '@/app/(dashboard)/tech/tech-customer-search-actions';
import { techAddJobMediaAction, techStartJobAction } from '@/app/(dashboard)/tech/tech-actions';
import { techCreateWalkInJobAction, techSignWalkInAgreementAction } from '@/app/(dashboard)/tech/tech-workflow-actions';
import { normalizeVehicleClass, UI_VEHICLE_CLASSES, type UiVehicleClass } from '@/lib/vehicle-pricing';

type CatalogService = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };
type AddonOpt = { slug: string; label: string; price_cents: number };

const STEPS = 9;

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
  const [lockedTotalCents, setLockedTotalCents] = useState<number | null>(null);

  const [signerName, setSignerName] = useState('');
  const [beforeUrlDraft, setBeforeUrlDraft] = useState('');
  const [beforeCount, setBeforeCount] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

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

  const canProceed3 = Boolean(selectedService && selectedService.slug !== 'ceramic-coating' && estimatedLineCents != null);

  const createJob = () => {
    if (!selectedService || estimatedLineCents == null) {
      setError('Choose a priced service (ceramic coating is consultation-only from the app).');
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
        setAppointmentId(r.appointmentId);
        setLockedTotalCents(r.totalCents);
        setSignerName(guestName.trim());
        goNext();
      });
    });
  };

  const signAgreement = () => {
    if (!appointmentId) return;
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

  const addBeforePhoto = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!appointmentId || !beforeUrlDraft.trim()) return;
    const fd = new FormData();
    fd.set('appointmentId', appointmentId);
    fd.set('category', 'before');
    fd.set('fileUrl', beforeUrlDraft.trim());
    startTransition(() => {
      void techAddJobMediaAction(fd).then(() => {
        setBeforeUrlDraft('');
        setBeforeCount((c) => c + 1);
        router.refresh();
      });
    });
  };

  const startTimer = async () => {
    if (!appointmentId) return;
    setTimerError(null);
    try {
      const res = await fetch('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', appointmentId, label: 'Walk-in workflow' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTimerError(typeof j.error === 'string' ? j.error : 'Could not start timer');
        return;
      }
      setTimerStarted(true);
    } catch {
      setTimerError('Network error starting timer');
    }
  };

  const startJob = () => {
    if (!appointmentId) return;
    startTransition(() => {
      const fd = new FormData();
      fd.set('appointmentId', appointmentId);
      void techStartJobAction(null, fd).then((r) => {
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
                const disabled = s.slug === 'ceramic-coating' || cents == null;
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
                        {disabled ? 'Consultation / no auto quote' : `$${(cents / 100).toFixed(0)} (${vehicleClass.replace('_', ' ')})`}
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
            Customer signs liability acknowledgment. Typed name is stored as the signature for this walk-in job.
          </p>
          {lockedTotalCents != null ? (
            <p className='text-xs text-emerald-300'>
              Locked total ${(lockedTotalCents / 100).toFixed(2)}
              {appointmentId ? ` · Job ${appointmentId.slice(0, 8)}…` : ''}
            </p>
          ) : null}
          {!appointmentId ? (
            <p className='text-sm text-red-300'>No job id — go back to quote step.</p>
          ) : (
            <>
              <label className='block text-xs text-zinc-400'>
                Signer legal name
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
                  disabled={busy || signerName.trim().length < 2}
                  onClick={signAgreement}
                  className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
                >
                  {busy ? 'Saving…' : 'Record signature'}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === 7 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>7 · Before photos</h2>
          <p className='text-sm text-zinc-400'>Add at least one &quot;before&quot; photo URL before starting the job timer.</p>
          <p className='text-xs text-zinc-500'>Recorded this session: {beforeCount}</p>
          <form onSubmit={addBeforePhoto} className='flex flex-col gap-2 sm:flex-row sm:items-end'>
            <label className='block flex-1 text-xs text-zinc-400'>
              Image URL
              <input
                value={beforeUrlDraft}
                onChange={(e) => setBeforeUrlDraft(e.target.value)}
                placeholder='https://…'
                className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
              />
            </label>
            <button
              type='submit'
              disabled={busy || !appointmentId}
              className='rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40'
            >
              Attach before photo
            </button>
          </form>
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
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>9 · Start job</h2>
          <p className='text-sm text-zinc-400'>Sets appointment status to in progress and logs the job start on the timeline.</p>
          {!timerStarted ? (
            <p className='text-sm text-amber-200'>Start the timer on the previous step before marking this job in progress.</p>
          ) : null}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={busy || !timerStarted}
              onClick={startJob}
              className='rounded-lg bg-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              {busy ? 'Starting…' : 'Start job'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
