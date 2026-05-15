'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AgreementSign, getCanvasSignatureDataUrl } from '@/components/booking/agreement-sign';

function CompleteContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const token = searchParams.get('token');
  const appointmentId = searchParams.get('appointment_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<{ id: string; title: string; body: string; version: number } | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [signatureMode, setSignatureMode] = useState<'typed' | 'drawn'>('typed');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!sessionId || !token || !appointmentId) {
      setError('Missing booking parameters.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(
      `/api/bookings/ready-sign?session_id=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}&appointmentId=${encodeURIComponent(appointmentId)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.template) {
          setError(data.error ?? 'Unable to load agreement');
        } else {
          setTemplate(data.template);
          setAlreadySigned(Boolean(data.alreadySigned));
          if (data.alreadySigned) setDone(true);
        }
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
  }, [sessionId, token, appointmentId]);

  const handleSign = async () => {
    if (!sessionId || !token || !appointmentId || !template) return;
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
      signatureMode === 'drawn'
        ? getCanvasSignatureDataUrl(canvasRef.current)
        : legalName.trim();

    const res = await fetch('/api/agreements/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId,
        accessToken: token,
        sessionId,
        templateId: template.id,
        signerLegalName: legalName.trim(),
        signatureType: signatureMode,
        signatureData,
        agreementSnapshot: template.body,
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

  if (error && !template) {
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
        <Link href='/' className='mt-4 inline-block text-gold-soft'>
          Return home
        </Link>
      </div>
    );
  }

  if (!template) {
    return (
      <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6'>
        <p className='text-sm text-zinc-300'>Agreement could not be loaded. Please return to booking and try again.</p>
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
        title={template.title}
        body={template.body}
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

export default function BookCompletePage() {
  return (
    <main className='min-h-screen bg-background px-4 py-24 text-foreground sm:px-6'>
      <div className='mx-auto max-w-2xl'>
        <h1 className='text-3xl font-black uppercase'>Sign agreement</h1>
        <p className='mt-2 text-sm text-zinc-400'>Deposit received. Review and sign below to confirm your appointment.</p>
        <div className='mt-8 rounded-2xl border border-gold/20 bg-zinc-950 p-6'>
          <Suspense fallback={<p className='text-zinc-400'>Loading…</p>}>
            <CompleteContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
