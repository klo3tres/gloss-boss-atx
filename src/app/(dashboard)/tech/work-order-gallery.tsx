'use client';

import { Download, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export type WorkOrderGalleryPhoto = {
  id: string;
  url: string;
  category: string;
  createdAt: string;
  uploader: string;
  table?: 'job_media' | 'job_photos';
  storagePath?: string;
  storageBucket?: string;
};

function pretty(value: string) {
  return (value || 'Photo').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function chicago(value: string) {
  if (!value) return 'Time not provided';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function WorkOrderGallery({
  title,
  photos,
  canDelete = false,
}: {
  title: string;
  photos: WorkOrderGalleryPhoto[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<WorkOrderGalleryPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hero = active ?? photos[0] ?? null;
  const activeIndex = useMemo(() => (hero ? photos.findIndex((p) => p.id === hero.id || p.url === hero.url) : -1), [hero, photos]);

  const deletePhoto = async (p: WorkOrderGalleryPhoto) => {
    if (!canDelete || !p.id) return;
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/tech/job-media-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id,
          table: p.table ?? 'job_photos',
          storagePath: p.storagePath,
          storageBucket: p.storageBucket,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(j.error ?? 'Delete failed.');
        return;
      }
      setActive(null);
      setMsg('Photo deleted.');
      router.refresh();
    } catch {
      setMsg('Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className='gb-glass gb-premium-card rounded-2xl border border-gold/25 p-4 shadow-[0_0_28px_rgba(212,175,55,0.08)] sm:p-5'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{title}</p>
        <span className='rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold text-gold-soft'>{photos.length}</span>
      </div>
      {photos.length === 0 ? (
        <p className='mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500'>No {title.toLowerCase()} photos yet.</p>
      ) : (
        <>
          {hero ? (
            <button
              type='button'
              onClick={() => setActive(hero)}
              className='mt-4 block w-full overflow-hidden rounded-2xl border border-white/10 transition hover:border-gold/40'
            >
              <img src={hero.url} alt={pretty(hero.category)} className='aspect-[16/10] w-full object-cover' />
            </button>
          ) : null}
          <div className='mt-3 flex gap-2 overflow-x-auto pb-1'>
            {photos.map((p, i) => {
              const selected = hero && (p.id === hero.id || p.url === hero.url);
              return (
                <button
                  key={p.id || p.url}
                  type='button'
                  onClick={() => setActive(p)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    selected ? 'border-gold shadow-[0_0_16px_rgba(212,175,55,0.35)]' : 'border-white/10 opacity-80 hover:border-gold/40 hover:opacity-100'
                  }`}
                  aria-label={`${pretty(p.category)} ${i + 1} of ${photos.length}`}
                >
                  <img src={p.url} alt='' className='h-full w-full object-cover' />
                </button>
              );
            })}
          </div>
          {hero ? (
            <p className='mt-2 text-[10px] text-zinc-500'>
              {pretty(hero.category)} · {chicago(hero.createdAt)} · {activeIndex >= 0 ? `${activeIndex + 1}/${photos.length}` : ''} · {hero.uploader || 'Unknown'}
            </p>
          ) : null}
        </>
      )}
      {msg ? <p className='mt-2 text-xs text-zinc-400'>{msg}</p> : null}

      {active ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md' onClick={() => setActive(null)}>
          <div
            className='max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl border border-gold/35 bg-zinc-950/95 p-5 shadow-[0_0_80px_rgba(212,175,55,0.2)]'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
                  {title} · {pretty(active.category)}
                </p>
                <p className='text-xs text-zinc-500'>
                  {chicago(active.createdAt)} · By {active.uploader || 'Unknown'}
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <a
                  href={active.url}
                  download
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-white'
                >
                  <Download className='h-3.5 w-3.5' /> Download
                </a>
                {canDelete ? (
                  <button
                    type='button'
                    disabled={deleting}
                    onClick={() => void deletePhoto(active)}
                    className='inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase text-red-200'
                  >
                    <Trash2 className='h-3.5 w-3.5' /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                ) : null}
                <button type='button' onClick={() => setActive(null)} className='inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-white'>
                  <X className='h-3.5 w-3.5' /> Close
                </button>
              </div>
            </div>
            <img src={active.url} alt={pretty(active.category)} className='max-h-[70vh] w-full rounded-2xl object-contain' />
            <div className='mt-4 flex gap-2 overflow-x-auto'>
              {photos.map((p) => (
                <button
                  key={p.id || p.url}
                  type='button'
                  onClick={() => setActive(p)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${p.url === active.url ? 'border-gold' : 'border-white/10'}`}
                >
                  <img src={p.url} alt='' className='h-full w-full object-cover' />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
