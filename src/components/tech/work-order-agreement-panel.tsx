'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  Mail,
  MessageSquare,
  Phone,
  CalendarClock,
  Smartphone,
} from 'lucide-react';
import { AgreementStatusBadge } from '@/components/agreements/agreement-status-badge';
import {
  AGREEMENT_STATUS_LABELS,
  isAgreementComplete,
  parseAgreementStatus,
  type AgreementStatus,
} from '@/lib/agreements/status';
import { SectionEyebrow } from '@/components/ui/premium';

export type WorkOrderAgreementPanelProps = {
  appointmentId: string;
  workOrderId?: string;
  agreementSigned: boolean;
  agreementStatus?: string;
  signerName?: string;
  signedAt?: string;
  smsConsent?: boolean;
  photoConsent?: boolean;
  mediaConsent?: boolean;
  agreementCaptureHref: string;
  agreementDetailHref: string;
  agreementPdfHref?: string;
  accessToken?: string;
  userId?: string;
};

type LocalStatus = {
  status: AgreementStatus;
  signed: boolean;
  signerName?: string;
  signedAt?: string;
  smsConsent?: boolean;
  photoConsent?: boolean;
  mediaConsent?: boolean;
  secureUrl?: string;
  viewedAt?: string | null;
  sentAt?: string | null;
  scheduledSendAt?: string | null;
};

const btn =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:opacity-40';
const btnGold = `${btn} border-gold/40 bg-gold/10 text-gold-soft hover:bg-gold/20`;
const btnGhost = `${btn} border-white/15 bg-white/[0.03] text-zinc-200 hover:bg-white/5`;

export function WorkOrderAgreementPanel({
  appointmentId,
  workOrderId,
  agreementSigned,
  agreementStatus,
  signerName,
  signedAt,
  smsConsent,
  photoConsent,
  mediaConsent,
  agreementCaptureHref,
  agreementDetailHref,
  agreementPdfHref,
  accessToken,
  userId,
}: WorkOrderAgreementPanelProps) {
  const initialStatus: AgreementStatus = agreementSigned
    ? parseAgreementStatus(agreementStatus) === 'verbal'
      ? 'verbal'
      : 'signed'
    : parseAgreementStatus(agreementStatus);

  const [local, setLocal] = useState<LocalStatus>({
    status: initialStatus,
    signed: agreementSigned,
    signerName,
    signedAt,
    smsConsent,
    photoConsent,
    mediaConsent,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVerbal, setShowVerbal] = useState(false);
  const [verbal, setVerbal] = useState({
    customerName: signerName ?? '',
    reason: '',
    witnessName: '',
    note: '',
    marketingMediaConsent: false,
    smsConsent: false,
    serviceAuthorized: true,
  });

  const refreshStatus = useCallback(async () => {
    if (!appointmentId) return;
    const res = await fetch('/api/agreements/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'status', appointmentId }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      request?: {
        status?: string;
        signerName?: string | null;
        signedAt?: string | null;
        viewedAt?: string | null;
        sentAt?: string | null;
        scheduledSendAt?: string | null;
        marketingMediaConsent?: boolean | null;
        smsConsentSelection?: boolean | null;
        securePath?: string | null;
      } | null;
    };
    if (!json.ok || !json.request) return;
    const r = json.request;
    const status = parseAgreementStatus(r.status);
    setLocal((prev) => ({
      ...prev,
      status,
      signed: isAgreementComplete(status),
      signerName: r.signerName ?? prev.signerName,
      signedAt: r.signedAt ?? prev.signedAt,
      viewedAt: r.viewedAt,
      sentAt: r.sentAt,
      scheduledSendAt: r.scheduledSendAt,
      mediaConsent: r.marketingMediaConsent ?? prev.mediaConsent,
      smsConsent: r.smsConsentSelection ?? prev.smsConsent,
      secureUrl: r.securePath
        ? r.securePath.startsWith('http')
          ? r.securePath
          : `${typeof window !== 'undefined' ? window.location.origin : ''}${r.securePath}`
        : prev.secureUrl,
    }));
  }, [appointmentId]);

  const runSend = async (channel: 'sms' | 'email' | 'both', intent: 'send' | 'schedule' = 'send') => {
    if (!appointmentId) {
      setError('Appointment id required to send.');
      return;
    }
    setBusy(channel);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/agreements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          appointmentId,
          channel,
          tone: 'professional',
          scheduleAt: intent === 'schedule' ? scheduleAt || null : null,
          actorUserId: userId ?? null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; url?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Send failed.');
        return;
      }
      if (json.url) setLocal((p) => ({ ...p, secureUrl: json.url }));
      setMessage(intent === 'schedule' ? 'Send scheduled.' : `Agreement sent via ${channel}.`);
      await refreshStatus();
    } catch {
      setError('Network error while sending.');
    } finally {
      setBusy(null);
    }
  };

  const previewLink = async () => {
    if (!appointmentId) {
      if (accessToken) {
        window.open(
          `/agreement?appointment_id=${encodeURIComponent(appointmentId || workOrderId || '')}&token=${encodeURIComponent(accessToken)}`,
          '_blank',
          'noopener,noreferrer',
        );
        return;
      }
      setError('Cannot preview without appointment.');
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      const res = await fetch('/api/agreements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'preview', appointmentId, actorUserId: userId ?? null }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setError(json.error ?? 'Could not build preview link.');
        return;
      }
      setLocal((p) => ({ ...p, secureUrl: json.url }));
      window.open(json.url, '_blank', 'noopener,noreferrer');
      await refreshStatus();
    } catch {
      setError('Network error while previewing.');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    setBusy('copy');
    setError(null);
    try {
      let url = local.secureUrl;
      if (!url && appointmentId) {
        const res = await fetch('/api/agreements/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: 'ensure', appointmentId, actorUserId: userId ?? null }),
        });
        const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !json.ok || !json.url) {
          setError(json.error ?? 'Could not create link.');
          return;
        }
        url = json.url;
        setLocal((p) => ({ ...p, secureUrl: url }));
      }
      if (!url && accessToken && appointmentId) {
        url = `${window.location.origin}/agreement?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(accessToken)}`;
      }
      if (!url) {
        setError('No secure link available.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage('Secure link copied.');
      setTimeout(() => setCopied(false), 2000);
      await refreshStatus();
    } catch {
      setError('Could not copy link.');
    } finally {
      setBusy(null);
    }
  };

  const submitVerbal = async () => {
    if (!appointmentId || !userId) {
      setError('Staff user and appointment are required for verbal acknowledgment.');
      return;
    }
    if (!verbal.customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    setBusy('verbal');
    setError(null);
    try {
      const res = await fetch('/api/agreements/verbal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          recordedByUserId: userId,
          customerName: verbal.customerName.trim(),
          marketingMediaConsent: verbal.marketingMediaConsent,
          smsConsent: verbal.smsConsent,
          note: verbal.note,
          witnessName: verbal.witnessName,
          reason: verbal.reason,
          serviceAuthorized: verbal.serviceAuthorized,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not record verbal acknowledgment.');
        return;
      }
      setShowVerbal(false);
      setMessage('Verbal acknowledgment recorded.');
      setLocal((p) => ({
        ...p,
        signed: true,
        status: 'verbal',
        signerName: verbal.customerName.trim(),
        signedAt: new Date().toLocaleString(),
        mediaConsent: verbal.marketingMediaConsent,
        smsConsent: verbal.smsConsent,
      }));
      await refreshStatus();
    } catch {
      setError('Network error recording verbal acknowledgment.');
    } finally {
      setBusy(null);
    }
  };

  const complete = local.signed || isAgreementComplete(local.status);

  return (
    <div className='gb-premium-card relative overflow-hidden rounded-3xl border border-gold/15 bg-black/45 p-5 shadow-xl sm:p-6'>
      <div className='mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3'>
        <div>
          <SectionEyebrow>Agreement & Acknowledgement</SectionEyebrow>
          <p className='mt-2 text-sm leading-relaxed text-zinc-300'>
            {complete
              ? 'Service acknowledgment is on file for this job.'
              : 'Send, capture, or record verbal acknowledgment before starting field work.'}
          </p>
        </div>
        <AgreementStatusBadge status={local.status} />
      </div>

      {(local.signerName || local.signedAt || local.sentAt || local.viewedAt) && (
        <div className='mb-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-400 sm:grid-cols-2'>
          {local.signerName ? (
            <p>
              <span className='block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500'>Signer</span>
              <strong className='text-white'>{local.signerName}</strong>
            </p>
          ) : null}
          {local.signedAt ? (
            <p>
              <span className='block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500'>Signed</span>
              <strong className='text-white'>{local.signedAt}</strong>
            </p>
          ) : null}
          {local.sentAt ? (
            <p>
              <span className='block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500'>Sent</span>
              <strong className='text-white'>{local.sentAt}</strong>
            </p>
          ) : null}
          {local.viewedAt ? (
            <p>
              <span className='block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500'>Viewed</span>
              <strong className='text-white'>{local.viewedAt}</strong>
            </p>
          ) : null}
          <div className='flex flex-wrap gap-2 sm:col-span-2'>
            {[
              ['SMS', local.smsConsent],
              ['Ops photos', local.photoConsent ?? true],
              ['Marketing media', local.mediaConsent],
            ].map(([label, ok]) => (
              <span
                key={String(label)}
                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                  ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-500'
                }`}
              >
                {label}: {ok ? 'Yes' : 'No'}
              </span>
            ))}
          </div>
        </div>
      )}

      {message ? (
        <p className='mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100'>{message}</p>
      ) : null}
      {error ? (
        <p className='mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100'>{error}</p>
      ) : null}

      <div className='flex flex-wrap gap-2'>
        <button type='button' disabled={!!busy} onClick={previewLink} className={btnGold}>
          <ExternalLink className='h-4 w-4' />
          Preview
        </button>
        <button type='button' disabled={!!busy || !appointmentId} onClick={() => runSend('sms')} className={btnGhost}>
          <MessageSquare className='h-4 w-4' />
          {busy === 'sms' ? 'Sending…' : 'SMS'}
        </button>
        <button type='button' disabled={!!busy || !appointmentId} onClick={() => runSend('email')} className={btnGhost}>
          <Mail className='h-4 w-4' />
          Email
        </button>
        <button type='button' disabled={!!busy || !appointmentId} onClick={() => runSend('both')} className={btnGhost}>
          <Phone className='h-4 w-4' />
          Both
        </button>
        <button type='button' disabled={!!busy} onClick={copyLink} className={btnGhost}>
          {copied ? <Check className='h-4 w-4 text-emerald-400' /> : <Copy className='h-4 w-4' />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type='button'
          disabled={!!busy || !appointmentId}
          onClick={() => setShowSchedule((v) => !v)}
          className={btnGhost}
        >
          <CalendarClock className='h-4 w-4' />
          Schedule
        </button>
        <Link href={agreementCaptureHref} className={btnGold}>
          <Smartphone className='h-4 w-4' />
          Open on this device
        </Link>
        <button
          type='button'
          disabled={!!busy || complete}
          onClick={() => setShowVerbal(true)}
          className={btnGhost}
        >
          <FileSignature className='h-4 w-4' />
          Verbal ack
        </button>
        {complete ? (
          <Link href={agreementDetailHref} className={btnGhost}>
            View signed
          </Link>
        ) : null}
        {agreementPdfHref ? (
          <a href={agreementPdfHref} target='_blank' rel='noreferrer' className={btnGhost}>
            <Download className='h-4 w-4' />
            PDF
          </a>
        ) : null}
      </div>

      {showSchedule ? (
        <div className='mt-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-end'>
          <label className='flex-1 text-xs text-zinc-400'>
            Send at (local)
            <input
              type='datetime-local'
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className='mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white'
            />
          </label>
          <button
            type='button'
            disabled={!!busy || !scheduleAt}
            onClick={() => runSend('both', 'schedule')}
            className={btnGold}
          >
            {busy === 'both' ? 'Scheduling…' : 'Confirm schedule'}
          </button>
        </div>
      ) : null}

      {showVerbal ? (
        <div className='fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center'>
          <div className='w-full max-w-md rounded-3xl border border-gold/20 bg-zinc-950 p-5 shadow-2xl'>
            <h3 className='text-sm font-black uppercase tracking-[0.16em] text-gold-soft'>Verbal acknowledgment</h3>
            <p className='mt-2 text-xs text-zinc-400'>
              Record when the customer cannot complete electronic signature. Status:{' '}
              {AGREEMENT_STATUS_LABELS.verbal}
            </p>
            <div className='mt-4 space-y-3'>
              <label className='block text-xs text-zinc-400'>
                Customer name
                <input
                  value={verbal.customerName}
                  onChange={(e) => setVerbal((v) => ({ ...v, customerName: e.target.value }))}
                  className='mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white'
                />
              </label>
              <label className='block text-xs text-zinc-400'>
                Reason e-sign not completed
                <input
                  value={verbal.reason}
                  onChange={(e) => setVerbal((v) => ({ ...v, reason: e.target.value }))}
                  className='mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white'
                />
              </label>
              <label className='block text-xs text-zinc-400'>
                Witness name
                <input
                  value={verbal.witnessName}
                  onChange={(e) => setVerbal((v) => ({ ...v, witnessName: e.target.value }))}
                  className='mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-white'
                />
              </label>
              <label className='block text-xs text-zinc-400'>
                Note
                <textarea
                  value={verbal.note}
                  onChange={(e) => setVerbal((v) => ({ ...v, note: e.target.value }))}
                  rows={2}
                  className='mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <label className='flex min-h-11 items-start gap-2 text-xs text-zinc-300'>
                <input
                  type='checkbox'
                  checked={verbal.serviceAuthorized}
                  onChange={(e) => setVerbal((v) => ({ ...v, serviceAuthorized: e.target.checked }))}
                  className='mt-0.5 h-5 w-5'
                />
                Customer authorized service (required)
              </label>
              <label className='flex min-h-11 items-start gap-2 text-xs text-zinc-300'>
                <input
                  type='checkbox'
                  checked={verbal.marketingMediaConsent}
                  onChange={(e) => setVerbal((v) => ({ ...v, marketingMediaConsent: e.target.checked }))}
                  className='mt-0.5 h-5 w-5'
                />
                Optional marketing media consent
              </label>
              <label className='flex min-h-11 items-start gap-2 text-xs text-zinc-300'>
                <input
                  type='checkbox'
                  checked={verbal.smsConsent}
                  onChange={(e) => setVerbal((v) => ({ ...v, smsConsent: e.target.checked }))}
                  className='mt-0.5 h-5 w-5'
                />
                Optional SMS consent
              </label>
            </div>
            <div className='mt-5 flex gap-2'>
              <button type='button' onClick={() => setShowVerbal(false)} className={`flex-1 ${btnGhost}`}>
                Cancel
              </button>
              <button
                type='button'
                disabled={!!busy || !verbal.serviceAuthorized}
                onClick={submitVerbal}
                className={`flex-1 ${btnGold}`}
              >
                {busy === 'verbal' ? 'Saving…' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {workOrderId ? (
        <p className='mt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-600'>WO {workOrderId.slice(0, 8)}</p>
      ) : null}
    </div>
  );
}
