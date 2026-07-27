'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, MessageSquare } from 'lucide-react';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

type AppointmentChoice = {
  id: string;
  status: string;
  scheduledStart: string;
  serviceSlug: string;
};

function label(appointment: AppointmentChoice) {
  const service = appointment.serviceSlug.replace(/-/g, ' ');
  const date = new Date(appointment.scheduledStart);
  const when = Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleDateString();
  return `${service} · ${when} · ${appointment.status.replace(/_/g, ' ')}`;
}

export function CustomerPhotoUpload({ appointments }: { appointments: AppointmentChoice[] }) {
  const router = useRouter();
  const choices = useMemo(() => {
    const seen = new Set<string>();
    return appointments.filter((appointment) => {
      if (!appointment.id || seen.has(appointment.id)) return false;
      seen.add(appointment.id);
      return true;
    });
  }, [appointments]);
  const [appointmentId, setAppointmentId] = useState(choices[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ id: string; fileUrl: string }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!appointmentId || !file) {
      setMessage({ ok: false, text: 'Choose an appointment and a photo.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set('appointmentId', appointmentId);
    body.set('file', file);
    body.set('note', note);
    try {
      const response = await fetch('/api/customer/media', { method: 'POST', body });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        fileUrl?: string;
      };
      if (!response.ok) {
        setMessage({ ok: false, text: result.error ?? 'Upload failed. Please try again.' });
        return;
      }
      if (!result.fileUrl) {
        setMessage({ ok: false, text: 'The photo was saved, but its preview is unavailable. Refresh to view it.' });
        router.refresh();
        return;
      }
      if (inputRef.current) inputRef.current.value = '';
      setNote('');
      setUploadedPhotos((photos) => [
        { id: result.id ?? result.fileUrl!, fileUrl: result.fileUrl! },
        ...photos,
      ]);
      setMessage({ ok: true, text: 'Photo attached to your appointment.' });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: 'The upload was interrupted. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionEyebrow>Share photos</SectionEyebrow>
          <h3 className="mt-1 text-lg font-black text-foreground">Upload vehicle pictures</h3>
          <p className="mt-2 text-sm text-muted-foreground">Attach condition, access, or concern photos directly to the correct appointment.</p>
        </div>
        <Camera className="h-5 w-5 text-gold-soft" />
      </div>
      {choices.length ? (
        <div className="mt-4 space-y-3">
          <select className="gb-input w-full" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
            {choices.map((appointment) => <option key={appointment.id} value={appointment.id}>{label(appointment)}</option>)}
          </select>
          <input ref={inputRef} className="gb-input w-full" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
          <textarea className="gb-input w-full" rows={2} maxLength={500} placeholder="Optional note about this photo" value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="button" disabled={busy} onClick={() => void upload()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-5 text-xs font-black uppercase text-black disabled:opacity-50">
            <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload photo'}
          </button>
          {message ? <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{message.text}</p> : null}
          {uploadedPhotos.length ? (
            <div aria-label="Photos uploaded this visit" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {uploadedPhotos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-muted/30"
                >
                  <img src={photo.fileUrl} alt="Customer vehicle upload" className="aspect-square w-full object-cover" />
                  <span className="block px-3 py-2 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-300">
                    Uploaded
                  </span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Book an appointment before uploading vehicle photos.
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/book" className="inline-flex min-h-11 items-center rounded-xl bg-gold px-4 text-[10px] font-black uppercase text-black">Book service</Link>
            <Link href="/dashboard/messages" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-[10px] font-black uppercase text-foreground"><MessageSquare className="h-3.5 w-3.5" /> Message us</Link>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
