'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { techSignWalkInAgreementAction } from '@/app/(dashboard)/tech/tech-workflow-actions';

export function WorkOrderAgreementRecaptureClient(props: {
  workOrderId: string;
  appointmentId: string | null;
  fallbackBookingId: string | null;
  workflowSessionId: string | null;
  title: string;
  agreementBody: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleSummary: string;
  serviceSlug: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [agreementAck, setAgreementAck] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [signerName, setSignerName] = useState(props.customerName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSign() {
    if (!agreementAck || !signerName.trim()) {
      setMsg('Customer must acknowledge terms and provide legal name.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await techSignWalkInAgreementAction({
      appointmentId: props.appointmentId,
      fallbackBookingId: props.fallbackBookingId,
      signerLegalName: signerName.trim(),
      signatureType: 'typed',
      signatureData: signerName.trim(),
      smsConsent,
      agreementSnapshotOverride: props.agreementBody,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg('Agreement saved — refreshing work order progress.');
    router.refresh();
    router.push(`/tech/work-orders/${encodeURIComponent(props.workOrderId)}`);
  }

  return (
    <div className='space-y-6'>
      <div className='rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-sm text-zinc-300'>
        <p>
          <span className='text-zinc-500'>Customer</span> {props.customerName}
        </p>
        {props.customerPhone ? (
          <p>
            <span className='text-zinc-500'>Phone</span> {props.customerPhone}
          </p>
        ) : null}
        {props.customerEmail ? (
          <p>
            <span className='text-zinc-500'>Email</span> {props.customerEmail}
          </p>
        ) : null}
        <p>
          <span className='text-zinc-500'>Vehicle</span> {props.vehicleSummary}
        </p>
        <p>
          <span className='text-zinc-500'>Service</span> {props.serviceSlug.replace(/-/g, ' ')} · {props.totalLabel}
        </p>
      </div>

      <article className='max-h-[min(60vh,32rem)] overflow-y-auto rounded-sm border border-zinc-200/90 bg-white p-6 text-zinc-900'>
        <header className='border-b border-amber-600/30 pb-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.28em] text-amber-700'>Gloss Boss ATX</p>
          <h3 className='mt-2 font-serif text-lg font-bold text-black'>{props.title}</h3>
        </header>
        <pre className='mt-5 whitespace-pre-wrap font-serif text-[13px] leading-relaxed'>{props.agreementBody}</pre>
      </article>

      <label className='flex items-start gap-2 text-sm text-zinc-300'>
        <input type='checkbox' checked={agreementAck} onChange={(e) => setAgreementAck(e.target.checked)} className='mt-1' />
        <span>Customer has read the acknowledgement and agrees to its terms.</span>
      </label>
      <label className='flex items-start gap-2 text-sm text-zinc-300'>
        <input type='checkbox' checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className='mt-1' />
        <span>SMS service updates consent (optional).</span>
      </label>
      <label className='block text-xs text-zinc-400'>
        Signer legal name
        <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className='gb-input mt-1 w-full' />
      </label>

      {msg ? <p className='text-sm text-emerald-200'>{msg}</p> : null}

      <button
        type='button'
        disabled={busy || !agreementAck}
        onClick={onSign}
        className='w-full rounded-2xl bg-gold py-4 text-sm font-black uppercase text-black disabled:opacity-50'
      >
        {busy ? 'Saving…' : 'Save immutable agreement snapshot'}
      </button>
    </div>
  );
}
