'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCanvasSignatureDataUrl } from '@/components/booking/agreement-sign';
import {
  buildNativeAgreementSnapshot,
  DEFAULT_AGREEMENT_TITLE,
  parseAgreementSnapshotSections,
} from '@/lib/default-gloss-boss-agreement';

type ApptLite = {
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  vehicle_description?: string | null;
  service_slug?: string | null;
  vehicle_class?: string | null;
  base_price_cents?: number | null;
  deposit_amount_cents?: number | null;
  scheduled_start?: string | null;
  status?: string | null;
  payment_status?: string | null;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
};

type Step = 'review' | 'consents' | 'sign';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'consents', label: 'Consents' },
  { id: 'sign', label: 'Sign' },
];

function firstName(full: string | null | undefined) {
  const n = String(full ?? '').trim();
  if (!n) return 'there';
  return n.split(/\s+/)[0] || 'there';
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return 'Scheduling pending';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatAddress(a: ApptLite) {
  return [a.service_address, a.service_city, a.service_state, a.service_zip].filter(Boolean).join(', ') || 'On file';
}

export default function CompleteContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id') ?? searchParams.get('sessionId') ?? '';
  const token = searchParams.get('token') ?? '';
  const appointmentId = searchParams.get('appointment_id') ?? searchParams.get('appointmentId') ?? '';
  const fallbackBookingId = searchParams.get('fallback_booking_id') ?? searchParams.get('fallbackBookingId') ?? '';
  const customerId = searchParams.get('customer_id') ?? searchParams.get('customerId') ?? '';
  const paymentId = searchParams.get('payment_id') ?? searchParams.get('paymentId') ?? '';
  const workOrderId = searchParams.get('work_order_id') ?? searchParams.get('workOrderId') ?? '';
  const email = searchParams.get('email') ?? '';
  const phone = searchParams.get('phone') ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<ApptLite | null>(null);
  const [resolvedAppointmentId, setResolvedAppointmentId] = useState(appointmentId);
  const [resolvedFallbackBookingId, setResolvedFallbackBookingId] = useState(fallbackBookingId);
  const [resolvedToken, setResolvedToken] = useState(token);
  const [resolvedSessionId, setResolvedSessionId] = useState(sessionId);
  const [template, setTemplate] = useState<{ id: string; title: string; body: string; version: number } | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [signatureMode, setSignatureMode] = useState<'typed' | 'drawn'>('typed');
  const [acknowledged, setAcknowledged] = useState(false);
  const [marketingMediaConsent, setMarketingMediaConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [step, setStep] = useState<Step>('review');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const viewedMarked = useRef(false);

  const agreementBody = useMemo(() => {
    if (template?.body?.trim()) return template.body;
    const a = appointment;
    if (!a) return '';
    const totalCents = typeof a.base_price_cents === 'number' ? a.base_price_cents : 0;
    const depCents = typeof a.deposit_amount_cents === 'number' ? a.deposit_amount_cents : 0;
    const depositNote =
      paymentVerified && depCents > 0
        ? `Deposit paid: $${(depCents / 100).toFixed(2)} (Stripe checkout).`
        : 'Deposit/payment status will be confirmed by Gloss Boss ATX.';
    const vc = String(a.vehicle_class ?? 'sedan');
    const classLabel =
      vc === 'truck' ? 'Truck' : vc === 'suv' || vc === 'suv_truck' ? 'SUV' : 'Sedan';
    return buildNativeAgreementSnapshot({
      customerName: String(a.guest_name ?? '').trim() || 'Customer',
      customerEmail: a.guest_email,
      customerPhone: a.guest_phone,
      vehicleDescription: String(a.vehicle_description ?? '').trim() || 'See booking.',
      serviceLabel: String(a.service_slug ?? 'service').replace(/-/g, ' '),
      vehicleClassLabel: classLabel,
      totalDollars: (totalCents / 100).toFixed(2),
      depositNote,
      technicianName: null,
    });
  }, [template, appointment, paymentVerified]);

  const agreementTitle = template?.title?.trim() ? template.title : DEFAULT_AGREEMENT_TITLE;
  const sections = useMemo(() => parseAgreementSnapshotSections(agreementBody), [agreementBody]);
  const customerFirst = firstName(appointment?.guest_name);
  const workOrderRef = workOrderId || (resolvedAppointmentId ? resolvedAppointmentId.slice(0, 8).toUpperCase() : '');

  useEffect(() => {
    if (!sessionId && !token && !appointmentId && !fallbackBookingId && !customerId && !paymentId && !workOrderId && !email && !phone) {
      setError('Missing booking parameters.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const q = new URLSearchParams();
    if (sessionId) q.set('session_id', sessionId);
    if (token) q.set('token', token);
    if (appointmentId) q.set('appointmentId', appointmentId);
    if (fallbackBookingId) q.set('fallbackBookingId', fallbackBookingId);
    if (customerId) q.set('customerId', customerId);
    if (paymentId) q.set('paymentId', paymentId);
    if (workOrderId) q.set('workOrderId', workOrderId);
    if (email) q.set('email', email);
    if (phone) q.set('phone', phone);
    fetch(`/api/bookings/ready-sign?${q.toString()}`)
      .then((r) => r.json())
      .then((data: {
        error?: string;
        appointment?: ApptLite;
        appointmentId?: string;
        accessToken?: string;
        sessionId?: string;
        template?: { id: string; title: string; body: string; version: number } | null;
        alreadySigned?: boolean;
        paymentVerified?: boolean;
        fallbackBookingId?: string;
      }) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        if (!data.appointment) {
          setError('Unable to load booking.');
          return;
        }
        setAppointment(data.appointment);
        setResolvedAppointmentId(data.appointmentId ?? appointmentId);
        setResolvedFallbackBookingId(data.fallbackBookingId ?? fallbackBookingId);
        setResolvedToken(data.accessToken ?? token);
        setResolvedSessionId(data.sessionId ?? sessionId);
        setTemplate(data.template ?? null);
        setAlreadySigned(Boolean(data.alreadySigned));
        setPaymentVerified(Boolean(data.paymentVerified));
        if (data.alreadySigned) setDone(true);
        const name = String(data.appointment.guest_name ?? '').trim();
        if (name) setLegalName(name);
      })
      .catch(() => {
        if (!cancelled) setError('Could not verify payment');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, token, appointmentId, fallbackBookingId, customerId, paymentId, workOrderId, email, phone, searchParams]);

  useEffect(() => {
    const id = resolvedAppointmentId || appointmentId;
    if (!id || viewedMarked.current || alreadySigned || done) return;
    viewedMarked.current = true;
    void fetch('/api/agreements/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: id }),
    }).catch(() => {
      /* non-blocking */
    });
  }, [resolvedAppointmentId, appointmentId, alreadySigned, done]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#d4a64d';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  };

  useEffect(() => {
    if (step !== 'sign' || signatureMode !== 'drawn') return;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [step, signatureMode]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    const me = e as React.MouseEvent;
    return { x: me.clientX - rect.left, y: me.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas();
  };

  const handleSign = async () => {
    if ((!resolvedAppointmentId && !resolvedFallbackBookingId) || !agreementBody.trim()) return;
    if (!legalName.trim()) {
      setError('Enter your full legal name.');
      return;
    }
    if (!acknowledged) {
      setError('Please confirm the required service acknowledgment.');
      setStep('consents');
      return;
    }
    if (signatureMode === 'drawn') {
      const png = getCanvasSignatureDataUrl(canvasRef.current);
      if (!png || png.length < 100) {
        setError('Please draw your signature.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    const signatureData =
      signatureMode === 'drawn' ? getCanvasSignatureDataUrl(canvasRef.current) : legalName.trim();

    const res = await fetch('/api/agreements/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: resolvedAppointmentId,
        fallbackBookingId: resolvedFallbackBookingId,
        accessToken: resolvedToken,
        sessionId: resolvedSessionId,
        templateId: template?.id,
        signerLegalName: legalName.trim(),
        signatureType: signatureMode,
        signatureData,
        agreementSnapshot: agreementBody,
        acknowledged: true,
        marketingMediaConsent,
        smsConsent,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Could not save signature');
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className='flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center'>
        <div className='h-10 w-10 animate-pulse rounded-full border-2 border-gold/40 border-t-gold' />
        <p className='text-sm text-zinc-400'>Preparing your service acknowledgment…</p>
      </div>
    );
  }

  if (error && !appointment) {
    return (
      <div className='rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6'>
        <p className='text-red-200'>{error}</p>
        <Link href='/book' className='mt-4 inline-flex min-h-11 items-center text-gold-soft'>
          Back to booking
        </Link>
      </div>
    );
  }

  if (done || alreadySigned) {
    return (
      <div className='rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8'>
        <p className='text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/80'>Confirmed</p>
        <h2 className='mt-2 text-2xl font-black uppercase tracking-tight text-emerald-100'>You&apos;re all set, {customerFirst}</h2>
        <p className='mt-2 text-sm leading-relaxed text-zinc-300'>
          Thanks for reviewing and signing your Gloss Boss ATX service acknowledgment. We&apos;ll see you at your appointment.
        </p>
        {appointment ? (
          <dl className='mt-6 grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300 sm:grid-cols-2'>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Appointment</dt>
              <dd className='mt-1'>{formatWhen(appointment.scheduled_start)}</dd>
            </div>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Vehicle</dt>
              <dd className='mt-1'>{appointment.vehicle_description ?? 'Vehicle on file'}</dd>
            </div>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Services</dt>
              <dd className='mt-1 capitalize'>{String(appointment.service_slug ?? '').replace(/-/g, ' ')}</dd>
            </div>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Address</dt>
              <dd className='mt-1'>{formatAddress(appointment)}</dd>
            </div>
            {workOrderRef ? (
              <div className='sm:col-span-2'>
                <dt className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Work order ref</dt>
                <dd className='mt-1 font-mono text-gold-soft'>{workOrderRef}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <Link
          href='/'
          className='mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 px-5 text-xs font-black uppercase tracking-wider text-gold-soft'
        >
          Return home
        </Link>
      </div>
    );
  }

  if (!agreementBody.trim()) {
    return (
      <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6'>
        <p className='text-sm text-zinc-300'>Agreement could not be prepared. Please return to booking and try again.</p>
        <Link href='/book' className='mt-4 inline-flex min-h-11 items-center text-sm font-bold uppercase tracking-wider text-gold-soft'>
          Back to booking
        </Link>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className='space-y-6'>
      <header className='space-y-3'>
        <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Service acknowledgment</p>
        <h1 className='text-2xl font-black uppercase tracking-tight text-white sm:text-3xl'>Hi {customerFirst},</h1>
        <p className='max-w-xl text-sm leading-relaxed text-zinc-400'>
          Please review your appointment details and terms, choose optional permissions, then sign to authorize service.
          This only takes a minute.
        </p>
      </header>

      {appointment ? (
        <div className='grid gap-3 rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.07] to-transparent p-4 sm:grid-cols-2'>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Date & time</p>
            <p className='mt-1 text-sm font-semibold text-white'>{formatWhen(appointment.scheduled_start)}</p>
          </div>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Vehicle</p>
            <p className='mt-1 text-sm font-semibold text-white'>{appointment.vehicle_description ?? 'Vehicle on file'}</p>
          </div>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Services</p>
            <p className='mt-1 text-sm font-semibold capitalize text-white'>
              {String(appointment.service_slug ?? 'service').replace(/-/g, ' ')}
            </p>
          </div>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Service address</p>
            <p className='mt-1 text-sm font-semibold text-white'>{formatAddress(appointment)}</p>
          </div>
          {workOrderRef ? (
            <div className='sm:col-span-2'>
              <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>Work order ref</p>
              <p className='mt-1 font-mono text-sm text-gold-soft'>{workOrderRef}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <nav aria-label='Agreement progress' className='flex items-center gap-2'>
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const complete = i < stepIndex;
          return (
            <button
              key={s.id}
              type='button'
              onClick={() => {
                if (i <= stepIndex || (s.id === 'consents' && step === 'sign') || (s.id === 'review')) setStep(s.id);
              }}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${
                active
                  ? 'border-gold/50 bg-gold/15 text-gold-soft'
                  : complete
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 bg-black/40 text-zinc-500'
              }`}
            >
              <span className='text-[9px] font-black uppercase tracking-[0.18em]'>{i + 1}. {s.label}</span>
            </button>
          );
        })}
      </nav>

      {error ? <p className='rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200'>{error}</p> : null}

      {step === 'review' ? (
        <section className='space-y-4'>
          <h2 className='text-lg font-black uppercase tracking-tight text-gold-soft'>{agreementTitle}</h2>
          <div className='max-h-[55vh] space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-4'>
            {sections.length > 0 ? (
              sections.map((sec) => (
                <article key={sec.heading} className='border-b border-white/5 pb-4 last:border-0 last:pb-0'>
                  <h3 className='text-[11px] font-black uppercase tracking-[0.16em] text-gold-soft/90'>{sec.heading}</h3>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300'>{sec.content}</p>
                </article>
              ))
            ) : (
              <p className='whitespace-pre-wrap text-sm leading-relaxed text-zinc-300'>{agreementBody}</p>
            )}
          </div>
          <button
            type='button'
            onClick={() => setStep('consents')}
            className='flex min-h-11 w-full items-center justify-center rounded-xl bg-gold px-6 text-sm font-black uppercase tracking-wider text-black'
          >
            Continue to consents
          </button>
        </section>
      ) : null}

      {step === 'consents' ? (
        <section className='space-y-4'>
          <h2 className='text-lg font-black uppercase tracking-tight text-gold-soft'>Consents</h2>

          <label className='flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4'>
            <input
              type='checkbox'
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className='mt-1 h-5 w-5 shrink-0 rounded border-zinc-600 bg-black accent-gold'
              required
            />
            <span className='text-sm leading-relaxed text-zinc-200'>
              <strong className='text-white'>Required.</strong> I have read and agree to the Gloss Boss ATX service
              acknowledgment and authorize the booked services under these terms. I understand my electronic signature is
              legally binding.
            </span>
          </label>

          <div className='rounded-2xl border border-white/10 bg-black/40 p-4'>
            <p className='text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500'>Operational photos</p>
            <p className='mt-2 text-sm leading-relaxed text-zinc-300'>
              Before/after and documentation photos are <strong className='text-white'>required</strong> for quality
              control, insurance, and job records. These are not marketing photos.
            </p>
          </div>

          <label className='flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/40 p-4'>
            <input
              type='checkbox'
              checked={marketingMediaConsent}
              onChange={(e) => setMarketingMediaConsent(e.target.checked)}
              className='mt-1 h-5 w-5 shrink-0 rounded border-zinc-600 bg-black accent-gold'
            />
            <span className='text-sm leading-relaxed text-zinc-300'>
              <strong className='text-white'>Optional.</strong> I allow Gloss Boss ATX to use vehicle photos or short video
              for marketing / social media. Declining does not block signing.
            </span>
          </label>

          <label className='flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/40 p-4'>
            <input
              type='checkbox'
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className='mt-1 h-5 w-5 shrink-0 rounded border-zinc-600 bg-black accent-gold'
            />
            <span className='text-sm leading-relaxed text-zinc-300'>
              <strong className='text-white'>Optional.</strong> I consent to SMS/text messages about appointments and
              promotions. Msg &amp; data rates may apply. Reply STOP to opt out.
            </span>
          </label>

          <div className='flex flex-col gap-3 sm:flex-row'>
            <button
              type='button'
              onClick={() => setStep('review')}
              className='flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/15 px-6 text-xs font-black uppercase tracking-wider text-zinc-200'
            >
              Back
            </button>
            <button
              type='button'
              disabled={!acknowledged}
              onClick={() => {
                if (!acknowledged) {
                  setError('Please confirm the required service acknowledgment.');
                  return;
                }
                setError(null);
                setStep('sign');
              }}
              className='flex min-h-11 flex-1 items-center justify-center rounded-xl bg-gold px-6 text-sm font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue to sign
            </button>
          </div>
        </section>
      ) : null}

      {step === 'sign' ? (
        <section className='space-y-4'>
          <h2 className='text-lg font-black uppercase tracking-tight text-gold-soft'>Sign</h2>

          <div className='grid gap-3 sm:grid-cols-2'>
            <label className='text-sm'>
              <span className='mb-1.5 block text-zinc-400'>Signature method</span>
              <select
                value={signatureMode}
                onChange={(e) => setSignatureMode(e.target.value as 'typed' | 'drawn')}
                className='min-h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-white'
              >
                <option value='typed'>Type full legal name</option>
                <option value='drawn'>Draw signature</option>
              </select>
            </label>
            <label className='text-sm'>
              <span className='mb-1.5 block text-zinc-400'>Full legal name</span>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className='min-h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-white'
                placeholder='First Middle Last'
                autoComplete='name'
                required
              />
            </label>
          </div>

          {signatureMode === 'drawn' ? (
            <div>
              <p className='mb-2 text-xs text-zinc-400'>Sign in the box below with your finger or mouse.</p>
              <canvas
                ref={canvasRef}
                className='h-44 w-full touch-none rounded-xl border border-gold/30 bg-black'
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              <button
                type='button'
                onClick={clearSignature}
                className='mt-2 inline-flex min-h-11 items-center text-xs font-black uppercase tracking-wider text-gold-soft'
              >
                Clear signature
              </button>
            </div>
          ) : (
            <div className='rounded-xl border border-dashed border-gold/25 bg-black/40 px-4 py-6 text-center'>
              <p className='font-serif text-2xl italic text-gold-soft'>{legalName.trim() || 'Your typed signature'}</p>
            </div>
          )}

          <div className='flex flex-col gap-3 sm:flex-row'>
            <button
              type='button'
              onClick={() => setStep('consents')}
              className='flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/15 px-6 text-xs font-black uppercase tracking-wider text-zinc-200'
            >
              Back
            </button>
            <button
              type='button'
              onClick={handleSign}
              disabled={submitting}
              className='flex min-h-11 flex-1 items-center justify-center rounded-xl bg-gold px-6 text-sm font-black uppercase tracking-wider text-black disabled:opacity-50'
            >
              {submitting ? 'Saving…' : 'Sign & confirm'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
