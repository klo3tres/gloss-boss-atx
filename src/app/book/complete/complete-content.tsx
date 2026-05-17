'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AgreementSign, getCanvasSignatureDataUrl } from '@/components/booking/agreement-sign';
import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';

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

export default function CompleteContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id') ?? searchParams.get('sessionId') ?? '';
  const token = searchParams.get('token') ?? '';
  const appointmentId = searchParams.get('appointment_id') ?? searchParams.get('appointmentId') ?? '';
  const fallbackBookingId = searchParams.get('fallback_booking_id') ?? searchParams.get('fallbackBookingId') ?? '';
  const customerId = searchParams.get('customer_id') ?? searchParams.get('customerId') ?? '';
  const paymentId = searchParams.get('payment_id') ?? searchParams.get('paymentId') ?? '';
  const email = searchParams.get('email') ?? '';
  const phone = searchParams.get('phone') ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<ApptLite | null>(null);
  const [resolvedAppointmentId, setResolvedAppointmentId] = useState(appointmentId);
  const [resolvedToken, setResolvedToken] = useState(token);
  const [resolvedSessionId, setResolvedSessionId] = useState(sessionId);
  const [template, setTemplate] = useState<{ id: string; title: string; body: string; version: number } | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [signatureMode, setSignatureMode] = useState<'typed' | 'drawn'>('typed');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const classLabel = vc === 'suv_truck' ? 'SUV / Truck' : 'Sedan';
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

  useEffect(() => {
    if (!sessionId && !token && !appointmentId && !fallbackBookingId && !customerId && !paymentId && !email && !phone) {
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
        setResolvedToken(data.accessToken ?? token);
        setResolvedSessionId(data.sessionId ?? sessionId);
        setTemplate(data.template ?? null);
        setAlreadySigned(Boolean(data.alreadySigned));
        setPaymentVerified(Boolean(data.paymentVerified));
        if (data.alreadySigned) setDone(true);
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
  }, [sessionId, token, appointmentId, fallbackBookingId, customerId, paymentId, email, phone, searchParams]);

  const handleSign = async () => {
    if (!resolvedAppointmentId || !agreementBody.trim()) return;
    if (!legalName.trim()) {
      setError('Enter your full legal name.');
      return;
    }
    if (!acknowledged) {
      setError('You must acknowledge the agreement.');
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
        accessToken: resolvedToken,
        sessionId: resolvedSessionId,
        templateId: template?.id,
        signerLegalName: legalName.trim(),
        signatureType: signatureMode,
        signatureData,
        agreementSnapshot: agreementBody,
        acknowledged: true,
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
    return <p className='text-zinc-400'>Verifying payment…</p>;
  }

  if (error && !appointment) {
    return (
      <div>
        <p className='text-red-300'>{error}</p>
        <Link href='/book' className='mt-4 inline-block text-gold-soft'>
          Back to booking
        </Link>
      </div>
    );
  }

  if (done || alreadySigned) {
    return (
      <div className='rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6'>
        <h2 className='text-xl font-bold text-emerald-200'>Booking confirmed</h2>
        <p className='mt-2 text-sm text-zinc-300'>Thank you. Gloss Boss ATX will follow up with appointment details.</p>
        {appointment ? (
          <dl className='mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300 sm:grid-cols-2'>
            <div><dt className='text-xs uppercase text-zinc-500'>Customer</dt><dd>{appointment.guest_name ?? 'Customer'}</dd></div>
            <div><dt className='text-xs uppercase text-zinc-500'>Service</dt><dd>{String(appointment.service_slug ?? '').replace(/-/g, ' ')}</dd></div>
            <div><dt className='text-xs uppercase text-zinc-500'>Vehicle</dt><dd>{appointment.vehicle_description ?? 'Vehicle'}</dd></div>
            <div><dt className='text-xs uppercase text-zinc-500'>Appointment</dt><dd>{appointment.scheduled_start ? new Date(appointment.scheduled_start).toLocaleString() : 'Scheduling pending'}</dd></div>
            <div><dt className='text-xs uppercase text-zinc-500'>Deposit paid</dt><dd>${((appointment.deposit_amount_cents ?? 0) / 100).toFixed(2)}</dd></div>
            <div><dt className='text-xs uppercase text-zinc-500'>Total</dt><dd>${((appointment.base_price_cents ?? 0) / 100).toFixed(2)}</dd></div>
            <div className='sm:col-span-2'><dt className='text-xs uppercase text-zinc-500'>Service address</dt><dd>{[appointment.service_address, appointment.service_city, appointment.service_state, appointment.service_zip].filter(Boolean).join(', ') || 'On file'}</dd></div>
          </dl>
        ) : null}
        <Link href='/' className='mt-4 inline-block text-gold-soft'>
          Return home
        </Link>
      </div>
    );
  }

  if (!agreementBody.trim()) {
    return (
      <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6'>
        <p className='text-sm text-zinc-300'>Agreement could not be prepared. Please return to booking and try again.</p>
        <Link href='/book' className='mt-4 inline-block text-sm font-bold uppercase tracking-wider text-gold-soft'>
          Back to booking
        </Link>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {error ? <p className='text-sm text-red-300'>{error}</p> : null}
      <AgreementSign
        title={agreementTitle}
        body={agreementBody}
        legalName={legalName}
        onLegalNameChange={setLegalName}
        signatureMode={signatureMode}
        onSignatureModeChange={setSignatureMode}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        onClearSignature={() => {}}
        canvasRef={canvasRef}
      />
      <button
        type='button'
        onClick={handleSign}
        disabled={submitting}
        className='w-full rounded-xl bg-gold px-6 py-4 text-sm font-black uppercase tracking-wider text-black disabled:opacity-50'
      >
        {submitting ? 'Saving…' : 'Sign & confirm booking'}
      </button>
    </div>
  );
}
