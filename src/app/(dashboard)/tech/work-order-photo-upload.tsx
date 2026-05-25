'use client';

import { Camera, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PHOTO_SLOT_OPTIONS } from '@/lib/photo-phase';

type UploadJson = { ok?: boolean; url?: string; error?: string; photoId?: string; mediaId?: string };

export function WorkOrderPhotoUpload({
  appointmentId,
  fallbackBookingId,
  workOrderId,
  customerId,
  workflowSessionId,
  source,
  resolvedContextTrust,
  vehicleIndex,
  vehicleLabel,
}: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workOrderId?: string | null;
  customerId?: string | null;
  workflowSessionId?: string | null;
  source?: 'appointment' | 'fallback';
  /** Server already resolved this job on the work order page — do not re-resolve away. */
  resolvedContextTrust?: boolean;
  vehicleIndex: number;
  vehicleLabel: string;
}) {
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [category, setCategory] = useState('front');
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const upload = async (file: File | undefined | null) => {
    if (!file) return;
    const woId = workOrderId || appointmentId || fallbackBookingId;
    if (!woId) {
      setStatus({ tone: 'error', text: 'No job linked — open the work order and try again.' });
      return;
    }
    setBusy(true);
    setStatus({ tone: 'info', text: 'Uploading…' });
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    const fd = new FormData();
    fd.set('workOrderId', woId);
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    if (source) fd.set('source', source);
    if (customerId) fd.set('customerId', customerId);
    if (resolvedContextTrust) fd.set('resolvedContextTrust', 'true');
    if (workflowSessionId) {
      fd.set('workflowSessionId', workflowSessionId);
      fd.set('techWorkflowSessionId', workflowSessionId);
    }
    fd.set('category', phase);
    fd.set('photoCategory', category);
    fd.set('vehicleIndex', String(vehicleIndex));
    fd.set('vehicleLabel', vehicleLabel);
    fd.set('file', file);
    try {
      const res = await fetch('/api/tech/job-media-upload', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as UploadJson;
      if (!res.ok || json.ok === false) {
        setStatus({ tone: 'error', text: json.error ?? `Upload failed (HTTP ${res.status}).` });
        return;
      }
      if (json.url) setPreview(json.url);
      setStatus({
        tone: 'success',
        text: `${phase === 'before' ? 'Before' : 'After'} · ${category.replace(/_/g, ' ')} saved for ${vehicleLabel}.`,
      });
      router.refresh();
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Network error during upload.' });
    } finally {
      setBusy(false);
    }
  };

  const statusClass =
    status?.tone === 'error'
      ? 'border-red-500/40 bg-red-500/10 text-red-100'
      : status?.tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : 'border-gold/30 bg-gold/10 text-gold-soft';

  return (
    <div className='gb-premium-card mt-3 rounded-2xl border border-white/10 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Upload photos</p>
        {busy ? (
          <span className='inline-flex items-center gap-1 text-[10px] font-bold uppercase text-gold-soft'>
            <Loader2 className='h-3 w-3 animate-spin' /> Uploading
          </span>
        ) : null}
      </div>
      <div className='mt-3 flex flex-wrap gap-2'>
        {(['before', 'after'] as const).map((p) => (
          <button
            key={p}
            type='button'
            onClick={() => setPhase(p)}
            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase ${
              phase === p ? 'bg-gold text-black' : 'border border-white/15 text-zinc-400'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className='mt-2 flex flex-wrap gap-1.5'>
        {PHOTO_SLOT_OPTIONS.map((c) => (
          <button
            key={c}
            type='button'
            onClick={() => setCategory(c)}
            className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase ${
              category === c ? 'border border-gold/50 bg-gold/15 text-gold-soft' : 'border border-white/10 text-zinc-500'
            }`}
          >
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <label className='mt-3 flex min-h-[3.25rem] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold/50 bg-gradient-to-r from-gold/25 to-transparent px-4 py-4 text-sm font-black uppercase tracking-wider text-gold-soft transition active:scale-[0.98] hover:border-gold'>
        <Camera className='h-5 w-5' />
        {busy ? 'Uploading…' : 'Tap to capture photo'}
        <input
          type='file'
          accept='image/jpeg,image/png,image/webp,image/*'
          capture='environment'
          className='sr-only'
          disabled={busy}
          onChange={(e) => {
            void upload(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
      </label>
      {preview ? (
        <img src={preview} alt='Upload preview' className='mt-4 h-40 w-full max-w-sm rounded-2xl border border-gold/30 object-cover shadow-[0_0_24px_rgba(212,175,55,0.25)] sm:h-48' />
      ) : null}
      {status ? (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-xs ${statusClass}`} role='status'>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
