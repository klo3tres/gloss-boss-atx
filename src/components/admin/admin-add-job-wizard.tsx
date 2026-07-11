'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { createAdminJobAction } from '@/app/(dashboard)/admin/work-orders/add/actions';
import { AdminAddJobSuccessPanel } from '@/components/admin/admin-add-job-success-panel';
import type { CreateAdminJobResult } from '@/lib/admin/create-admin-job-result';
import type { AdminJobQuoteResult } from '@/lib/admin/admin-job-quote';
import { addonPriceCentsForVehicle } from '@/lib/addon-vehicle-pricing';

type ServiceOption = { slug: string; title: string };
type AddonOption = { slug: string; label: string; priceCents: number };
type TechOption = { id: string; name: string };

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'van', label: 'Van' },
  { value: 'other', label: 'Other' },
];

const inputClass =
  'mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-gold/50';
const labelClass = 'text-[10px] font-black uppercase tracking-wider text-zinc-500';

export function AdminAddJobWizard({
  services,
  addons,
  technicians,
  defaultMode,
  prefilledDate,
  prefilledTime,
  errorMessage,
}: {
  services: ServiceOption[];
  addons: AddonOption[];
  technicians: TechOption[];
  defaultMode?: 'scheduled' | 'completed';
  prefilledDate?: string;
  prefilledTime?: string;
  errorMessage?: string;
}) {
  const [jobStatus, setJobStatus] = useState(defaultMode === 'completed' ? 'completed' : 'scheduled');
  const [serviceSlug, setServiceSlug] = useState(services[0]?.slug ?? 'full-detail');
  const [vehicleClass, setVehicleClass] = useState('sedan');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState<'none' | 'percent' | 'dollar'>('none');
  const [manualDiscountValue, setManualDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [quote, setQuote] = useState<AdminJobQuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saveResult, setSaveResult] = useState<CreateAdminJobResult | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState('pay_later');
  const [pending, startTransition] = useTransition();

  const addonCsv = useMemo(() => selectedAddons.join(','), [selectedAddons]);

  const fetchQuote = useCallback(async () => {
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch('/api/admin/bookings/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceSlug,
          vehicleClass,
          vehicleDescription: vehicleDescription || 'Vehicle',
          addOnSlugs: selectedAddons,
          promoCode,
          manualDiscountType,
          manualDiscountValue: Number(manualDiscountValue || 0),
          discountReason,
          priceOverrideCents: priceOverride ? Math.round(Number(priceOverride) * 100) : null,
          paymentChoice:
            paymentMode === 'paid' || paymentMode === 'comped'
              ? 'full'
              : paymentMode === 'pay_later' || paymentMode === 'custom_manual'
                ? 'none'
                : 'deposit',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuote(null);
        setQuoteError(data.error ?? 'Could not calculate price');
        return;
      }
      setQuote(data as AdminJobQuoteResult);
    } catch {
      setQuoteError('Quote request failed');
    } finally {
      setQuoteLoading(false);
    }
  }, [
    serviceSlug,
    vehicleClass,
    vehicleDescription,
    selectedAddons,
    promoCode,
    manualDiscountType,
    manualDiscountValue,
    discountReason,
    priceOverride,
    jobStatus,
    paymentMode,
  ]);

  useEffect(() => {
    if (defaultMode === 'completed') setPaymentMode('paid');
  }, [defaultMode]);

  useEffect(() => {
    const t = window.setTimeout(() => void fetchQuote(), 350);
    return () => window.clearTimeout(t);
  }, [fetchQuote]);

  const toggleAddon = (slug: string) => {
    setSelectedAddons((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveErrors([]);
    setSaveResult(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createAdminJobAction(formData);
      if (!result.success) {
        setSaveErrors(result.errors.length > 0 ? result.errors : ['Could not save job. Check required fields and try again.']);
        return;
      }
      setSaveResult(result);
    });
  };

  if (saveResult?.success) {
    return (
      <div className="space-y-6">
        <AdminAddJobSuccessPanel result={saveResult} onAddAnother={() => setSaveResult(null)} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="addon_slugs" value={addonCsv} />

      {errorMessage || saveErrors.length > 0 ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100 space-y-2">
          {errorMessage ? <p>{errorMessage}</p> : null}
          {saveErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      ) : null}

      <section className="rounded-3xl border border-gold/20 bg-zinc-950/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">
              <Plus className="h-4 w-4" /> Add Job
            </p>
            <p className="mt-1 text-sm text-zinc-400">Schedule a future job or enter completed work — pricing auto-fills.</p>
          </div>
          <Link href="/admin/work-orders" className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300">
            Back
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            Job type
            <select name="job_status" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} className={inputClass}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed / past</option>
              <option value="quote_only">Quote only</option>
              <option value="canceled">Canceled record</option>
            </select>
          </label>
          <label className={labelClass}>
            Payment structure
            <select
              name="payment_status"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className={inputClass}
            >
              <option value="pay_later">Pay in full later</option>
              <option value="deposit_required">Deposit required (unpaid)</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="paid">Paid in full</option>
              <option value="comped">No charge / comped</option>
              <option value="custom_manual">Custom manual payment</option>
            </select>
          </label>
          {(paymentMode === 'deposit_required' || paymentMode === 'deposit_paid' || paymentMode === 'custom_manual') && (
            <label className={labelClass}>
              Deposit amount ($)
              <input
                name="deposit_amount"
                type="number"
                min={0}
                step="0.01"
                placeholder={quote?.labels.deposit?.replace('$', '') ?? 'Suggested from quote'}
                className={inputClass}
              />
            </label>
          )}
          {paymentMode === 'custom_manual' ? (
            <label className={labelClass}>
              Amount paid ($)
              <input name="amount_paid" type="number" min={0} step="0.01" className={inputClass} placeholder="0.00" />
            </label>
          ) : null}
          <label className={labelClass}>
            Service date
            <input
              name="service_date"
              type="date"
              required
              defaultValue={prefilledDate || new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Start time
            <input name="start_time" type="time" defaultValue={prefilledTime || '09:00'} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5 sm:p-6">
        <p className={labelClass}>Customer</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className={labelClass}>
            Name *
            <input name="customer_name" required className={inputClass} placeholder="Jane Smith" />
          </label>
          <label className={labelClass}>
            Phone *
            <input name="phone" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputClass} placeholder="5125550100" />
          </label>
          <label className={labelClass}>
            Email
            <input name="email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={inputClass} />
          </label>
          <label className={`${labelClass} md:col-span-3`}>
            Service address *
            <input name="address" required className={inputClass} placeholder="123 Main St, Austin TX" />
          </label>
          <input type="hidden" name="city" value="Austin" />
          <input type="hidden" name="state" value="TX" />
          <input type="hidden" name="zip" value="" />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5 sm:p-6">
        <p className={labelClass}>Vehicle & service</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className={labelClass}>
            Vehicle type *
            <select name="vehicle_class" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)} className={inputClass}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Year
            <input name="vehicle_year" className={inputClass} placeholder="2022" />
          </label>
          <label className={labelClass}>
            Make
            <input name="vehicle_make" className={inputClass} placeholder="BMW" />
          </label>
          <label className={labelClass}>
            Model
            <input name="vehicle_model" className={inputClass} placeholder="X5" />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Description override
            <input
              name="vehicle_description"
              value={vehicleDescription}
              onChange={(e) => setVehicleDescription(e.target.value)}
              className={inputClass}
              placeholder="2022 BMW X5 Black"
            />
          </label>
          <label className={labelClass}>
            Service package *
            <select name="service_slug" value={serviceSlug} onChange={(e) => setServiceSlug(e.target.value)} className={inputClass}>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>{s.title}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Duration (min)
            <input name="duration_minutes" type="number" min={30} step={15} placeholder="Auto" className={inputClass} />
          </label>
          <label className={labelClass}>
            Technician
            <select name="technician_id" className={inputClass}>
              <option value="">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>

        {addons.length > 0 ? (
          <div className="mt-4">
            <p className={labelClass}>Add-ons (priced for {vehicleClass})</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {addons.map((a) => {
                const cents = addonPriceCentsForVehicle(a.slug, vehicleClass, a.priceCents);
                return (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => toggleAddon(a.slug)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-[10px] font-bold uppercase transition ${
                    selectedAddons.includes(a.slug)
                      ? 'border-gold/40 bg-gold/15 text-gold-soft'
                      : 'border-border text-muted-foreground hover:border-gold/30'
                  }`}
                >
                  {a.label} · ${(cents / 100).toFixed(0)}
                </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">
          <Sparkles className="h-4 w-4" /> Pricing & discounts
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className={labelClass}>
            Promo code
            <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} name="promo_code" className={inputClass} />
          </label>
          <label className={labelClass}>
            Manual discount
            <select value={manualDiscountType} onChange={(e) => setManualDiscountType(e.target.value as typeof manualDiscountType)} className={inputClass}>
              <option value="none">None</option>
              <option value="percent">Percent off</option>
              <option value="dollar">Dollar off</option>
            </select>
          </label>
          <label className={labelClass}>
            Discount value
            <input value={manualDiscountValue} onChange={(e) => setManualDiscountValue(e.target.value)} name="manual_discount_value" type="number" min={0} step="0.01" className={inputClass} />
            <input type="hidden" name="manual_discount_type" value={manualDiscountType} />
          </label>
          <label className={labelClass}>
            Override total ($)
            <input value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} name="price_override" type="number" min={0} step="0.01" className={inputClass} placeholder="Optional" />
          </label>
          <label className={`${labelClass} md:col-span-4`}>
            Discount reason
            <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} name="discount_reason" className={inputClass} placeholder="Member courtesy, fleet rate, etc." />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
          {quoteLoading ? (
            <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</p>
          ) : quoteError ? (
            <p className="text-sm text-amber-200">{quoteError}</p>
          ) : quote ? (
            <div className="space-y-2">
              {quote.lineItems.map((line) => (
                <div key={line.label} className="flex justify-between text-sm">
                  <span className="text-zinc-400">{line.label}</span>
                  <span className="font-mono font-bold text-white">${(line.cents / 100).toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
                <div><p className="text-[10px] uppercase text-zinc-500">Deposit</p><p className="font-mono text-lg font-black text-gold-soft">{quote.labels.deposit}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Balance due</p><p className="font-mono text-lg font-black text-white">{quote.labels.balance}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Duration</p><p className="font-mono text-lg font-black text-white">{quote.durationMinutes} min</p></div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/50 p-5 sm:p-6">
        <label className={`${labelClass} block`}>
          Internal notes
          <textarea name="notes" rows={3} className={inputClass} placeholder="Gate code, pet hair, upsell notes…" />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="send_customer_confirmation"
                className="accent-[var(--gold)]"
                defaultChecked
                disabled={!customerEmail.includes('@') && customerPhone.replace(/\D/g, '').length < 10}
              />
              Send customer confirmation{' '}
              {customerEmail.includes('@') || customerPhone.replace(/\D/g, '').length >= 10
                ? '(email + SMS when available)'
                : '(needs email or phone)'}
            </label>
            {jobStatus === 'completed' ? (
              <label className={labelClass}>
                Payment method
                <select name="payment_method" className={inputClass}>
                  <option value="cash">Cash</option>
                  <option value="zelle">Zelle</option>
                  <option value="stripe">Stripe</option>
                  <option value="card">Card</option>
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={pending || !!quoteError || quoteLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase text-black hover:brightness-110 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? 'Saving job…' : 'Save job'}
          </button>
        </div>
      </section>
    </form>
  );
}
