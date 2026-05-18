'use client';

import { useState } from 'react';

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

  return (
    <section className='rounded-2xl border border-gold/20 bg-black/35 p-4'>
      <button type='button' onClick={() => photos[0] && setActive(photos[0])} className='flex w-full items-center justify-between gap-3 text-left'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{title}</p>
        <span className='rounded-full border border-white/10 px-3 py-1 text-xs text-white'>{photos.length}</span>
      </button>
      {photos.length === 0 ? (
        <p className='mt-3 rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500'>No {title.toLowerCase()} uploaded yet.</p>
      ) : (
        <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
          {photos.map((p) => (
            <button key={p.id || p.url} type='button' onClick={() => setActive(p)} className='group block rounded-xl border border-white/10 bg-zinc-950 p-2 text-left transition hover:border-gold/50 hover:shadow-[0_0_24px_rgba(212,166,77,0.18)]'>
              <img src={p.url} alt={`${pretty(p.category)} ${title}`} className='aspect-square w-full rounded-lg object-cover' />
              <p className='mt-2 truncate text-[10px] font-black uppercase tracking-wider text-gold-soft'>{pretty(p.category)}</p>
              <p className='text-[10px] text-zinc-500'>{chicago(p.createdAt)}</p>
              <p className='truncate text-[10px] text-zinc-600'>By {p.uploader || 'Unknown'}</p>
            </button>
          ))}
        </div>
      )}
      {active ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur' onClick={() => setActive(null)}>
          <div className='max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl border border-gold/30 bg-zinc-950 p-4 shadow-[0_0_60px_rgba(212,166,77,0.24)]' onClick={(e) => e.stopPropagation()}>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{pretty(active.category)}</p>
                <p className='text-xs text-zinc-500'>{chicago(active.createdAt)} · By {active.uploader || 'Unknown'}</p>
              </div>
              <button type='button' onClick={() => setActive(null)} className='rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase text-white'>Close</button>
            </div>
            <img src={active.url} alt={pretty(active.category)} className='max-h-[72vh] w-full rounded-2xl object-contain' />
          </div>
        </div>
      ) : null}
    </section>
  );
}
