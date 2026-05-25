'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { NormalizedGalleryImage } from '@/lib/gallery-normalize';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type PortfolioItem = NormalizedGalleryImage & {
  beforeUrl?: string | null;
  afterUrl?: string | null;
  vehicleLabel?: string | null;
  serviceLabel?: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function PublicGalleryPortfolio() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 12000 })
      .then(async (r) => (r.ok ? ((await r.json()) as { images?: PortfolioItem[] }) : null))
      .then((j) => {
        if (cancelled) return;
        const rows = (j?.images ?? []).filter((img) => str(img.url || img.image_url));
        setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = lightbox != null ? items[lightbox.index] : null;
  const go = useCallback(
    (d: number) => {
      if (!lightbox || items.length < 2) return;
      setLightbox({ index: (lightbox.index + d + items.length) % items.length });
    },
    [lightbox, items.length],
  );

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox, go]);

  if (loading) {
    return <p className='text-center text-sm text-zinc-500'>Loading transformations…</p>;
  }

  if (items.length === 0) {
    return (
      <p className='rounded-2xl border border-gold/20 bg-black/40 px-6 py-12 text-center text-sm text-zinc-400'>
        Portfolio images will appear here once uploaded in Website CMS → Gallery.
      </p>
    );
  }

  return (
    <>
      <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
        {items.map((img, i) => {
          const url = str(img.url || img.image_url);
          const before = str(img.beforeUrl || (img as Record<string, unknown>).before_url);
          const after = str(img.afterUrl || url);
          const caption = str(img.caption) || str(img.vehicleLabel) || str(img.serviceLabel) || 'Transformation';
          return (
            <button
              key={img.id || i}
              type='button'
              onClick={() => setLightbox({ index: i })}
              className='gb-premium-card group overflow-hidden rounded-2xl border border-gold/20 text-left transition hover:border-gold/50 hover:shadow-[0_0_32px_rgba(212,175,55,0.15)]'
            >
              {before && after && before !== after ? (
                <div className='grid grid-cols-2 gap-0.5'>
                  <div className='relative'>
                    <span className='absolute left-2 top-2 z-10 rounded bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-300'>
                      Before
                    </span>
                    <img src={before} alt='Before' className='h-40 w-full object-cover' />
                  </div>
                  <div className='relative'>
                    <span className='absolute left-2 top-2 z-10 rounded bg-gold/90 px-2 py-0.5 text-[9px] font-black uppercase text-black'>
                      After
                    </span>
                    <img src={after} alt='After' className='h-40 w-full object-cover' />
                  </div>
                </div>
              ) : (
                <img src={url} alt={caption} className='h-52 w-full object-cover transition group-hover:scale-[1.02]' />
              )}
              <div className='p-4'>
                <p className='text-sm font-bold text-white'>{caption}</p>
                {str(img.serviceLabel) ? <p className='mt-1 text-xs text-gold-soft'>{str(img.serviceLabel)}</p> : null}
              </div>
            </button>
          );
        })}
      </div>

      {active && lightbox ? (
        <div className='fixed inset-0 z-[300] flex flex-col bg-black/95' role='dialog' aria-modal>
          <div className='flex items-center justify-between border-b border-white/10 px-4 py-3'>
            <p className='text-sm font-black uppercase text-gold-soft'>{str(active.caption) || 'Gallery'}</p>
            <button type='button' onClick={() => setLightbox(null)} className='rounded-lg border border-white/20 p-2 text-white' aria-label='Close'>
              <X className='h-5 w-5' />
            </button>
          </div>
          <div className='relative flex flex-1 items-center justify-center p-4'>
            {items.length > 1 ? (
              <button type='button' onClick={() => go(-1)} className='absolute left-2 rounded-full bg-black/60 p-3 text-white'>
                <ChevronLeft className='h-6 w-6' />
              </button>
            ) : null}
            <img
              src={str(active.url || active.image_url)}
              alt=''
              className='max-h-[min(82vh,960px)] max-w-full object-contain'
            />
            {items.length > 1 ? (
              <button type='button' onClick={() => go(1)} className='absolute right-2 rounded-full bg-black/60 p-3 text-white'>
                <ChevronRight className='h-6 w-6' />
              </button>
            ) : null}
          </div>
          <p className='pb-4 text-center text-xs text-zinc-500'>
            {lightbox.index + 1} / {items.length}
          </p>
        </div>
      ) : null}
    </>
  );
}
