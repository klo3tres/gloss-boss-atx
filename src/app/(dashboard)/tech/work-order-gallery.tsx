'use client';

import { useMemo, useState } from 'react';

export type WorkOrderGalleryPhoto = {
  id: string;
  url: string;
  category: string;
  createdAt: string;
  uploader: string;
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

export function WorkOrderGallery({ title, photos }: { title: string; photos: WorkOrderGalleryPhoto[] }) {
  const [active, setActive] = useState<WorkOrderGalleryPhoto | null>(null);
  const hero = active ?? photos[0] ?? null;
  const activeIndex = useMemo(() => (hero ? photos.findIndex((p) => p.id === hero.id || p.url === hero.url) : -1), [hero, photos]);

  return (
    <section className='gb-glass rounded-2xl border border-gold/25 p-5 shadow-[0_0_28px_rgba(212,175,55,0.08)]'>
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
                  onClick={() => {
                    setActive(p);
                  }}
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
      {active ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md' onClick={() => setActive(null)}>
          <div
            className='max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl border border-gold/35 bg-zinc-950/95 p-5 shadow-[0_0_80px_rgba(212,175,55,0.2)]'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{title} · {pretty(active.category)}</p>
                <p className='text-xs text-zinc-500'>{chicago(active.createdAt)} · By {active.uploader || 'Unknown'}</p>
              </div>
              <button type='button' onClick={() => setActive(null)} className='rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase text-white'>
                Close
              </button>
            </div>
            <img src={active.url} alt={pretty(active.category)} className='max-h-[70vh] w-full rounded-2xl object-contain' />
            <div className='mt-4 flex gap-2 overflow-x-auto'>
              {photos.map((p) => (
                <button
                  key={p.id || p.url}
                  type='button'
                  onClick={() => setActive(p)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                    p.url === active.url ? 'border-gold' : 'border-white/10'
                  }`}
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