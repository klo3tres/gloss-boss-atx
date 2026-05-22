'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const categories = ['front', 'rear', 'driver_side', 'passenger_side', 'interior', 'wheels', 'damage', 'other'];

export function WorkOrderPhotoUpload({
  appointmentId,
  fallbackBookingId,
  workflowSessionId,
  vehicleIndex,
  vehicleLabel,
}: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workflowSessionId?: string | null;
  vehicleIndex: number;
  vehicleLabel: string;
}) {
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [category, setCategory] = useState('front');
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const upload = async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    if (appointmentId) fd.set('appointmentId', appointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    if (workflowSessionId) {
      fd.set('workflowSessionId', workflowSessionId);
      fd.set('techWorkflowSessionId', workflowSessionId);
    }
    fd.set('category', phase);
    fd.set('photoCategory', category);
    fd.set('vehicleIndex', String(vehicleIndex));
    fd.set('vehicleLabel', vehicleLabel);
    fd.set('file', file);
    const res = await fetch('/api/tech/job-media-upload', { method: 'POST', body: fd });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? 'Photo upload failed.');
      return;
    }
    if (json.url) setPreview(json.url);
    setMessage(`${phase} ${category.replace(/_/g, ' ')} photo saved for ${vehicleLabel}.`);
    router.refresh();
  };

  return (
    <div className='rounded-xl border border-white/10 bg-black/25 p-3'>
      <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Vehicle photo upload</p>
      <div className='mt-2 grid gap-2 sm:grid-cols-3'>
        <select value={phase} onChange={(e) => setPhase(e.target.value as 'before' | 'after')} className='rounded border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
          <option value='before'>Before</option>
          <option value='after'>After</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
          {categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <label className='flex cursor-pointer items-center justify-center rounded-lg border border-gold/35 bg-gold/10 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-gold-soft'>
          {busy ? 'Uploading...' : 'Camera / Upload'}
          <input
            type='file'
            accept='image/*'
            capture='environment'
            className='sr-only'
            disabled={busy}
            onChange={(e) => {
              void upload(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {preview ? <img src={preview} alt='Uploaded preview' className='mt-3 h-20 w-20 rounded-lg border border-white/10 object-cover' /> : null}
      {message ? <p className='mt-2 text-xs text-zinc-400'>{message}</p> : null}
    </div>
  );
}
