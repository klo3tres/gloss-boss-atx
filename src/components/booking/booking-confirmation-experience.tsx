'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CustomerBookingLifecycle } from '@/components/booking/customer-booking-lifecycle';
import { SocialLinksRow } from '@/components/marketing/social-links';
import { CustomerAccountConflictRecovery } from '@/components/customer/customer-account-conflict-recovery';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type VehicleView = {
  description: string;
  serviceSlug: string;
  vehicleClass: string;
  priceCents: number;
  addOns: Array<{ label: string; priceCents: number }>;
};

export type BookingConfirmationSummary = {
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  scheduledStart: string;
  serviceAddress: string;
  vehicles: VehicleView[];
  promoCode: string | null;
  serviceSubtotalCents: number;
  finalTotalCents: number;
  depositCents: number;
  depositPaidCents: number;
  depositDueCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  paymentStatus: string;
  externalPaymentMethods: Array<{ key: string; label: string; instructions: string; proofRequired: boolean }>;
  onlineDiscountCents: number;
  multiCarDiscountCents: number;
  promoDiscountCents: number;
  manualDiscountCents: number;
  pricingAdjustmentCents: number;
  customerBenefits: {
    loyaltyPunches: number;
    activeCreditsCents: number;
    availableRewards: number;
    redeemedRewards: number;
    referralCode: string | null;
  };
  sessionState: {
    appointmentActive: boolean;
    acknowledgementCompleted: boolean;
    depositRequired: boolean;
    depositPaid: boolean;
    paidInFull: boolean;
    payOnArrival: boolean;
    paymentChoice: string;
    accountClaimed: boolean;
    paymentFailed: boolean;
    paymentCancelled: boolean;
    paymentExpired: boolean;
    canReschedule: boolean;
    canCancel: boolean;
    nextStep: 'inactive' | 'acknowledgement' | 'payment' | 'confirmation';
  };
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function chicago(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
}

function googleCalendarHref(summary: BookingConfirmationSummary) {
  const start = new Date(summary.scheduledStart);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const title = encodeURIComponent('Gloss Boss ATX — Mobile Detail');
  const details = encodeURIComponent(`Booking ${summary.bookingNumber} · ${summary.guestPhone}`);
  const location = encodeURIComponent(summary.serviceAddress || 'Mobile service');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
}

function ConfirmationInner({
  initialSummary,
  appointmentIdOverride,
  accessTokenOverride,
  previewMode,
  accountClaimIssue,
}: {
  initialSummary?: BookingConfirmationSummary | null;
  appointmentIdOverride?: string;
  accessTokenOverride?: string;
  previewMode: boolean;
  accountClaimIssue?: { message: string; temporary?: boolean } | null;
}) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const appointmentId = appointmentIdOverride ?? sp.get('appointment_id') ?? sp.get('appointmentId') ?? '';
  const token = accessTokenOverride ?? sp.get('token') ?? '';
  const sessionId = sp.get('session_id') ?? '';
  const adminPreview = previewMode || sp.get('admin_preview') === '1';

  const [summary, setSummary] = useState<BookingConfirmationSummary | null>(initialSummary ?? null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentReconciling, setPaymentReconciling] = useState(Boolean(sessionId));
  const [socialLinks, setSocialLinks] = useState({ instagramUrl: '', facebookUrl: '', tiktokUrl: '', youtubeUrl: '' });

  useEffect(() => {
    fetch('/api/public/site-data', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.socialLinks) setSocialLinks(d.socialLinks);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (adminPreview || (!pathname.startsWith('/booking/') && pathname !== '/portal/job') || !appointmentId || !token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sent = false;
    const confirmVisibleView = () => {
      if (sent || document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (sent || document.visibilityState !== 'visible') return;
        sent = true;
        const storageKey = `gb_portal_view_${appointmentId}`;
        const existing = window.sessionStorage.getItem(storageKey);
        const viewId = existing || window.crypto.randomUUID();
        if (!existing) window.sessionStorage.setItem(storageKey, viewId);
        void fetch('/api/public/portal-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId,
            token,
            eventType: 'portal_opened',
            viewId,
            dwellMs: 1500,
            visibilityState: document.visibilityState,
          }),
          keepalive: true,
        }).catch(() => {});
      }, 1500);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') confirmVisibleView();
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    confirmVisibleView();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [adminPreview, appointmentId, pathname, token]);

  useEffect(() => {
    if (initialSummary) return;
    if (!appointmentId || !token) {
      setError('Missing booking reference. Check your email for a confirmation link.');
      return;
    }
    void fetchWithTimeout(
      `/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store', timeoutMs: 10000 },
    )
      .then(async (r) => {
        const j = (await r.json()) as BookingConfirmationSummary & { ok?: boolean; error?: string };
        if (!r.ok || !(j as { ok?: boolean }).ok) throw new Error(j.error ?? 'Could not load booking');
        const { ok: _ok, error: _e, ...rest } = j;
        setSummary(rest as BookingConfirmationSummary);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [appointmentId, token, initialSummary]);

  useEffect(() => {
    if (adminPreview || !sessionId || !appointmentId || !token) {
      setPaymentReconciling(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const response = await fetchWithTimeout(
          `/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
          { cache: 'no-store', timeoutMs: 10000 },
        );
        const json = (await response.json()) as BookingConfirmationSummary & { ok?: boolean; error?: string };
        if (!response.ok || !json.ok) throw new Error(json.error ?? 'Payment status could not be refreshed.');
        const { ok: _ok, error: _error, ...nextSummary } = json;
        if (cancelled) return;
        setSummary(nextSummary as BookingConfirmationSummary);
        setError(null);
        if (nextSummary.sessionState.nextStep === 'confirmation') {
          setPaymentReconciling(false);
          return;
        }
      } catch {
        // A webhook may still be settling. Keep the booking usable and retry for a bounded period.
      }
      if (!cancelled && attempts < 15) {
        timer = setTimeout(refresh, 1500);
      } else if (!cancelled) {
        setPaymentReconciling(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [adminPreview, appointmentId, sessionId, token]);

  if (error) {
    return (
      <p className='rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200'>{error}</p>
    );
  }

  if (!summary) {
    return <p className='text-zinc-400'>Loading your confirmation…</p>;
  }

  const paidDeposit = summary.depositCents > 0 && summary.depositPaidCents >= summary.depositCents;
  const paidInFull = summary.finalTotalCents > 0 && summary.totalPaidCents >= summary.finalTotalCents;
  const depositRequired =
    summary.depositCents > 0 &&
    !paidDeposit &&
    !paidInFull &&
    !summary.sessionState.payOnArrival;
  const selectedPaymentChoice =
    summary.sessionState.paymentChoice === 'full' ? 'full' : 'deposit';
  const checkoutAmountCents =
    selectedPaymentChoice === 'full' ? summary.balanceDueCents : summary.depositDueCents;
  const signHref = `/book/complete?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`;

  const openDepositCheckout = async (paymentChoice: 'deposit' | 'full' = 'deposit') => {
    if (adminPreview) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      await fetch('/api/public/portal-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, token, eventType: 'payment_page_opened' }),
        keepalive: true,
      }).catch(() => null);
      const res = await fetchWithTimeout('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, accessToken: token, paymentChoice }),
        timeoutMs: 12000,
      });
      const json = (await res.json()) as { url?: string; skipPayment?: boolean; customerMessage?: string; error?: string };
      if (res.ok && json.skipPayment) {
        window.location.reload();
        return;
      }
      if (!res.ok || !json.url) throw new Error(json.customerMessage ?? json.error ?? 'Secure checkout could not be opened.');
      window.location.assign(json.url);
    } catch (e) {
      setCheckoutError(
        e instanceof Error && e.name === 'AbortError'
          ? 'Secure checkout took too long. Your booking is saved—try again.'
          : e instanceof Error
            ? e.message
            : 'Secure checkout could not be opened.',
      );
      setCheckoutBusy(false);
    }
  };

  const trackAccountClaim = () => {
    if (adminPreview || !appointmentId || !token) return;
    void fetch('/api/public/portal-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, token, eventType: 'account_claim_started' }),
      keepalive: true,
    }).catch(() => {});
  };

  const calHref = googleCalendarHref(summary);
  const icsHref = appointmentId ? `/api/calendar/appointment/${appointmentId}` : '';
  const canonicalPath = `/booking/${encodeURIComponent(token)}`;
  const lifecycleSteps = [
    { label: 'Appointment', done: summary.sessionState.appointmentActive },
    { label: 'Acknowledgment', done: summary.sessionState.acknowledgementCompleted },
    { label: 'Payment', done: !summary.sessionState.depositRequired || summary.sessionState.depositPaid || summary.sessionState.paidInFull },
    { label: 'Secured', done: summary.sessionState.nextStep === 'confirmation' },
  ];

  return (
    <div className='space-y-6'>
      {adminPreview ? (
        <div className='sticky top-3 z-50 rounded-2xl border border-sky-400/40 bg-sky-950/95 px-5 py-4 text-center shadow-2xl backdrop-blur'>
          <p className='text-xs font-black uppercase tracking-[0.18em] text-sky-200'>
            Admin preview mode — no customer activity will be recorded
          </p>
        </div>
      ) : null}
      {accountClaimIssue && !adminPreview ? (
        <CustomerAccountConflictRecovery
          message={accountClaimIssue.message}
          bookingPath={canonicalPath}
          compact
          title={accountClaimIssue.temporary ? 'We could not link your account yet' : undefined}
        />
      ) : null}
      {paymentReconciling ? (
        <div className='rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-center text-sm text-sky-100'>
          Confirming your secure payment… Your booking is saved. This page will update automatically.
        </div>
      ) : null}
      <section className='gb-premium-hero rounded-3xl px-6 py-8 text-center sm:px-10'>
        <p className='text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='gb-display-serif mt-3 text-3xl font-black text-white sm:text-5xl'>
          {summary.sessionState.nextStep === 'confirmation' ? 'You’re booked' : 'Your appointment is reserved'}
        </h1>
        <p className='mt-2 text-sm text-zinc-400'>Ref {summary.bookingNumber}</p>
        <p className='mt-4 text-xl font-bold text-white'>{chicago(summary.scheduledStart)}</p>
        <p className='mt-2 text-sm text-zinc-300'>{summary.serviceAddress || 'Mobile service at your address'}</p>
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          {calHref ? (
            <a
              href={calHref}
              target='_blank'
              rel='noreferrer'
              className='inline-flex rounded-2xl border border-gold/40 bg-gold/10 px-6 py-3 text-xs font-black uppercase text-gold-soft'
            >
              Add to Google Calendar
            </a>
          ) : null}
          {icsHref ? (
            <a
              href={icsHref}
              className='inline-flex rounded-2xl border border-white/20 px-6 py-3 text-xs font-black uppercase text-zinc-200'
            >
              Download .ics
            </a>
          ) : null}
        </div>
      </section>

      <section className='grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/50 p-3 sm:grid-cols-4' aria-label='Booking progress'>
        {lifecycleSteps.map((step, index) => (
          <div
            key={step.label}
            className={`rounded-xl border px-3 py-3 text-center ${
              step.done ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 text-zinc-400'
            }`}
          >
            <p className='text-[10px] font-black uppercase tracking-wider'>{index + 1}. {step.label}</p>
            <p className='mt-1 text-[10px]'>{step.done ? 'Complete' : 'Next'}</p>
          </div>
        ))}
      </section>

      <section className='gb-glass rounded-3xl border border-gold/20 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Your detail</h2>
        <ul className='mt-4 space-y-3'>
          {summary.vehicles.map((v, i) => (
            <li key={i} className='rounded-2xl border border-white/10 bg-black/40 p-4'>
              <p className='font-bold text-white'>{v.description}</p>
              <p className='text-xs text-zinc-500'>
                {v.serviceSlug.replace(/-/g, ' ')} · {v.vehicleClass}
                {v.priceCents > 0 ? ` · ${money(v.priceCents)}` : ''}
              </p>
              {v.addOns.length > 0 ? (
                <p className='mt-2 text-xs text-zinc-400'>{v.addOns.map((a) => a.label).join(' · ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
        <dl className='mt-6 space-y-2 border-t border-white/10 pt-4 text-sm'>
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Service subtotal</dt>
            <dd className='font-bold text-white'>{money(summary.serviceSubtotalCents)}</dd>
          </div>
          {summary.promoCode ? (
            <div className='flex justify-between gap-4'>
              <dt className='text-zinc-400'>Promo</dt>
              <dd className='text-gold-soft'>{summary.promoCode}</dd>
            </div>
          ) : null}
          {summary.onlineDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Online discount</dt>
              <dd>−{money(summary.onlineDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.multiCarDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Multi-car discount</dt>
              <dd>−{money(summary.multiCarDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.promoDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Promo savings</dt>
              <dd>−{money(summary.promoDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.manualDiscountCents > 0 ? (
            <div className='flex justify-between gap-4 text-emerald-300'>
              <dt>Additional discount</dt>
              <dd>−{money(summary.manualDiscountCents)}</dd>
            </div>
          ) : null}
          {summary.pricingAdjustmentCents !== 0 ? (
            <div className={`flex justify-between gap-4 ${summary.pricingAdjustmentCents < 0 ? 'text-emerald-300' : 'text-zinc-200'}`}>
              <dt>Custom quote adjustment</dt>
              <dd>{summary.pricingAdjustmentCents < 0 ? '−' : '+'}{money(Math.abs(summary.pricingAdjustmentCents))}</dd>
            </div>
          ) : null}
          <div className='flex justify-between gap-4 border-t border-white/10 pt-2'>
            <dt className='font-bold text-zinc-200'>Appointment total</dt>
            <dd className='font-bold text-white'>{money(summary.finalTotalCents)}</dd>
          </div>
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Deposit required</dt>
            <dd className='text-white'>{money(summary.depositCents)}</dd>
          </div>
          <div className='flex justify-between gap-4'>
            <dt className='text-zinc-400'>Deposit paid</dt>
            <dd className={paidDeposit || paidInFull ? 'text-emerald-300' : 'text-amber-200'}>
              {paidInFull
                ? 'Paid in full'
                : paidDeposit
                  ? money(summary.depositPaidCents)
                  : summary.sessionState.payOnArrival
                    ? 'Pay on arrival'
                    : summary.sessionState.depositRequired
                      ? 'Payment required'
                      : 'Not required'}
            </dd>
          </div>
          <div className='flex justify-between gap-4 border-t border-white/10 pt-2'>
            <dt className='text-zinc-400'>Balance due</dt>
            <dd className='font-bold text-gold-soft'>{money(summary.balanceDueCents)}</dd>
          </div>
        </dl>
        {summary.sessionState.paymentFailed || summary.sessionState.paymentCancelled || summary.sessionState.paymentExpired || sp.get('payment_cancelled') === '1' ? (
          <p className='mt-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
            Your booking is still saved. The last checkout did not complete; use the button below to open a fresh secure checkout.
          </p>
        ) : null}
        {depositRequired && summary.sessionState.nextStep === 'payment' && !adminPreview ? (
          <div className='mt-5 border-t border-white/10 pt-5'>
            <button
              type='button'
              disabled={checkoutBusy}
              onClick={() => void openDepositCheckout(selectedPaymentChoice)}
              className='w-full rounded-2xl bg-gold px-6 py-4 text-sm font-black uppercase text-black disabled:opacity-60'
            >
              {checkoutBusy
                ? 'Opening secure checkout…'
                : selectedPaymentChoice === 'full'
                  ? `Pay ${money(checkoutAmountCents)} in full`
                  : `Pay ${money(checkoutAmountCents)} deposit`}
            </button>
            {checkoutError ? <p className='mt-3 text-sm text-red-200'>{checkoutError}</p> : null}
          </div>
        ) : null}
        {!depositRequired && summary.balanceDueCents > 0 && summary.sessionState.appointmentActive && summary.sessionState.acknowledgementCompleted && !summary.sessionState.payOnArrival && !adminPreview ? (
          <div className='mt-5 border-t border-white/10 pt-5'>
            <button
              type='button'
              disabled={checkoutBusy}
              onClick={() => void openDepositCheckout('full')}
              className='w-full rounded-2xl border border-gold/50 bg-gold/10 px-6 py-4 text-sm font-black uppercase text-gold-soft disabled:opacity-60'
            >
              {checkoutBusy ? 'Opening secure checkout…' : `Pay ${money(summary.balanceDueCents)} remaining balance`}
            </button>
            {checkoutError ? <p className='mt-3 text-sm text-red-200'>{checkoutError}</p> : null}
          </div>
        ) : null}
      </section>

      <section className='rounded-3xl border border-white/10 bg-black/50 p-6'>
        <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Your Gloss Boss benefits</h2>
        <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <div className='rounded-2xl border border-white/10 p-4 text-center'>
            <p className='text-xl font-black text-white'>{summary.customerBenefits.loyaltyPunches}</p>
            <p className='mt-1 text-[10px] uppercase text-zinc-500'>Loyalty punches</p>
          </div>
          <div className='rounded-2xl border border-white/10 p-4 text-center'>
            <p className='text-xl font-black text-white'>{money(summary.customerBenefits.activeCreditsCents)}</p>
            <p className='mt-1 text-[10px] uppercase text-zinc-500'>Available credits</p>
          </div>
          <div className='rounded-2xl border border-white/10 p-4 text-center'>
            <p className='text-xl font-black text-white'>{summary.customerBenefits.availableRewards}</p>
            <p className='mt-1 text-[10px] uppercase text-zinc-500'>Available rewards</p>
          </div>
          <div className='rounded-2xl border border-white/10 p-4 text-center'>
            <p className='text-xl font-black text-white'>{summary.customerBenefits.redeemedRewards}</p>
            <p className='mt-1 text-[10px] uppercase text-zinc-500'>Redeemed</p>
          </div>
        </div>
        <p className='mt-4 text-xs text-zinc-400'>
          Referral code: {summary.customerBenefits.referralCode || 'Created when your customer account is ready'}
        </p>
      </section>

      {summary.sessionState.nextStep === 'payment' && summary.externalPaymentMethods?.length && !adminPreview ? (
        <section className='rounded-3xl border border-white/10 bg-black/50 p-6'>
          <h2 className='text-sm font-black uppercase tracking-widest text-gold-soft'>Other enabled ways to pay</h2>
          <p className='mt-2 text-sm text-zinc-400'>Use only the instructions shown here. Your work order is updated after Gloss Boss verifies an external payment.</p>
          <div className='mt-4 space-y-3'>
            {summary.externalPaymentMethods.map((method) => (
              <div key={method.key} className='rounded-2xl border border-white/10 bg-zinc-950/70 p-4'>
                <p className='font-black text-white'>{method.label}</p>
                {method.instructions ? <p className='mt-1 whitespace-pre-wrap text-sm text-zinc-300'>{method.instructions}</p> : null}
                {method.proofRequired ? <p className='mt-2 text-xs font-bold text-amber-200'>Keep the payment reference or proof for verification.</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className='rounded-2xl border border-gold/30 bg-gold/10 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Next step</p>
        <p className='mt-2 text-sm text-white'>
          {summary.sessionState.nextStep === 'acknowledgement'
            ? 'Review and sign the service acknowledgment. Your deposit step will follow.'
            : summary.sessionState.nextStep === 'payment'
              ? selectedPaymentChoice === 'full'
                ? `Pay the selected ${money(checkoutAmountCents)} full balance to complete your booking.`
                : `Pay the required ${money(checkoutAmountCents)} deposit to complete your booking.`
              : summary.sessionState.nextStep === 'inactive'
                ? 'This appointment is no longer active. Contact Gloss Boss ATX if you need help.'
                : summary.sessionState.payOnArrival
                  ? 'Your appointment is confirmed. Payment is due on arrival.'
                  : 'Your appointment requirements are complete.'}
        </p>
      </section>

      {appointmentId && token && !adminPreview ? (
        <CustomerBookingLifecycle
          appointmentId={appointmentId}
          token={token}
          canReschedule={summary.sessionState.canReschedule}
          canCancel={summary.sessionState.canCancel}
        />
      ) : null}

      <section className='rounded-2xl border border-white/10 bg-black/50 p-5 text-sm text-zinc-300'>
        <p className='font-black uppercase tracking-wider text-gold-soft'>Next steps</p>
        <ol className='mt-3 space-y-2'>
          <li>1 — Sign your service agreement (required)</li>
          <li>2 — Watch for confirmation email & receipt</li>
          <li>3 — Water & power access ready at arrival</li>
          <li>4 — Track live updates in your dashboard</li>
        </ol>
      </section>

      <div className='grid gap-3 sm:grid-cols-2'>
        {adminPreview ? (
          <div className='rounded-2xl border border-sky-400/30 bg-sky-500/10 px-6 py-4 text-center text-sm font-black uppercase text-sky-100 sm:col-span-2'>
            Customer actions are disabled in read-only preview
          </div>
        ) : null}
        {summary.sessionState.nextStep === 'acknowledgement' && !adminPreview ? (
          <Link href={signHref} className='rounded-2xl bg-gold px-6 py-4 text-center text-sm font-black uppercase text-black shadow-[0_0_32px_rgba(212,175,55,0.35)]'>
            Review and sign now
          </Link>
        ) : null}
        {!adminPreview ? <Link
          href={canonicalPath}
          className='rounded-2xl border border-gold/40 px-6 py-4 text-center text-sm font-black uppercase text-gold-soft'
        >
          Open customer portal
        </Link> : null}
        {!adminPreview ? <Link
          href={`/signup?email=${encodeURIComponent(summary.guestEmail)}&next=${encodeURIComponent(canonicalPath)}`}
          onClick={trackAccountClaim}
          className='rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-black uppercase text-zinc-300'
        >
          Create your account
        </Link> : null}
        {!adminPreview ? <Link
          href={`/login?email=${encodeURIComponent(summary.guestEmail)}&next=${encodeURIComponent(canonicalPath)}`}
          className='rounded-2xl border border-white/15 px-6 py-4 text-center text-sm font-black uppercase text-zinc-300 sm:col-span-2'
        >
          Sign in to view in dashboard
        </Link> : null}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Follow Gloss Boss ATX</p>
        <SocialLinksRow links={socialLinks} className="mt-3 justify-center" />
      </div>
    </div>
  );
}

export function BookingConfirmationExperience({
  initialSummary,
  appointmentId,
  accessToken,
  previewMode = false,
  accountClaimIssue,
}: {
  initialSummary?: BookingConfirmationSummary | null;
  appointmentId?: string;
  accessToken?: string;
  previewMode?: boolean;
  accountClaimIssue?: { message: string; temporary?: boolean } | null;
}) {
  return (
    <main className='gb-luxury-page min-h-screen px-4 py-20 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl'>
        <Suspense fallback={<p className='text-zinc-400'>Loading…</p>}>
          <ConfirmationInner
            initialSummary={initialSummary}
            appointmentIdOverride={appointmentId}
            accessTokenOverride={accessToken}
            previewMode={previewMode}
            accountClaimIssue={accountClaimIssue}
          />
        </Suspense>
      </div>
    </main>
  );
}
