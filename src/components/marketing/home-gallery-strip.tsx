'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedGalleryImage } from '@/lib/gallery-normalize';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PublicSiteDataPayload, SiteDataFeaturedSlide } from '@/lib/public-site-data';

function slidesToGalleryRows(slides: SiteDataFeaturedSlide[]): NormalizedGalleryImage[] {
  return slides.map((s, i) => ({
    id: s.id,
    url: s.image,
    image_url: s.image,
    caption: s.label?.trim() ? s.label.trim() : null,
    sort_order: i,
    order_index: i,
    featured: i === 0,
  }));
}

/** Stock placeholders when no published CMS images exist */
const FALLBACK_IMAGES: NormalizedGalleryImage[] = [
  {
    id: 'ph-1',
    url: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80',
    image_url: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80',
    caption: null,
    sort_order: 0,
    order_index: null,
    featured: false,
  },
  {
    id: 'ph-2',
    url: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=900&q=80',
    image_url: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=900&q=80',
    caption: null,
    sort_order: 1,
    order_index: null,
    featured: false,
  },
  {
    id: 'ph-3',
    url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=900&q=80',
    image_url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=900&q=80',
    caption: null,
    sort_order: 2,
    order_index: null,
    featured: false,
  },
];

function sortGalleryRows(rows: NormalizedGalleryImage[]): NormalizedGalleryImage[] {
  return [...rows].sort((a, b) => {
    const fa = a.featured ? 1 : 0;
    const fb = b.featured ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id);
  });
}

/** Admin images first (featured boosted); placeholders only when nothing published. */
function resolveGalleryRows(remote: NormalizedGalleryImage[]): { rows: NormalizedGalleryImage[]; usedFallback: boolean } {
  const valid = sortGalleryRows(remote.filter((r) => (r.url || r.image_url).trim()));
  if (valid.length === 0) {
    return { rows: FALLBACK_IMAGES, usedFallback: true };
  }
  return { rows: valid, usedFallback: false };
}

export function HomeGalleryStrip() {
  const [rows, setRows] = useState<NormalizedGalleryImage[]>(() => resolveGalleryRows([]).rows);
  const [usedFallback, setUsedFallback] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string | null } | null>(null);
  const [page, setPage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(false);

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    const watchdog = window.setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      const r = resolveGalleryRows([]);
      setRows(r.rows);
      setUsedFallback(r.usedFallback);
    }, 10000);
    return () => clearTimeout(watchdog);
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchWithTimeout('/api/public/site-data', { cache: 'no-store', timeoutMs: 10000 }).then(async (r) =>
        r.ok ? ((await r.json()) as PublicSiteDataPayload) : null,
      ),
      fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 10000 }).then(async (r) => {
        if (!r.ok) {
          console.warn('[CRM_DEBUG_UI]', 'gallery_public_http', r.status);
          return null;
        }
        try {
          return (await r.json()) as { images?: NormalizedGalleryImage[] };
        } catch {
          return null;
        }
      }),
    ])
      .then(([site, gal]) => {
        if (cancelled) return;
        settledRef.current = true;
        if (site?.featuredShowcaseFromCms === true && site.featuredShowcase?.length) {
          const mapped = slidesToGalleryRows(site.featuredShowcase);
          const resolved = resolveGalleryRows(mapped);
          setRows(resolved.rows);
          setUsedFallback(resolved.usedFallback);
          setPage(0);
          return;
        }
        const list = (gal?.images ?? []) as NormalizedGalleryImage[];
        const resolved = resolveGalleryRows(list);
        setRows(resolved.rows);
        setUsedFallback(resolved.usedFallback);
        setPage(0);
      })
      .catch((e) => {
        if (cancelled) return;
        settledRef.current = true;
        console.warn('[CRM_DEBUG_UI]', 'gallery_public_fetch', e instanceof Error ? e.message : e);
        const r = resolveGalleryRows([]);
        setRows(r.rows);
        setUsedFallback(r.usedFallback);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const scrollToPage = useCallback(
    (next: number) => {
      const el = scrollerRef.current;
      if (!el) {
        setPage(Math.max(0, Math.min(pageCount - 1, next)));
        return;
      }
      const w = el.clientWidth;
      const target = Math.max(0, Math.min(pageCount - 1, next));
      el.scrollTo({ left: target * w, behavior: 'smooth' });
      setPage(target);
    },
    [pageCount],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const i = Math.round(el.scrollLeft / w);
      setPage(Math.max(0, Math.min(pageCount - 1, i)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pageCount, rows.length]);

  const sliceStart = page * pageSize;
  const visibleSlice = rows.slice(sliceStart, sliceStart + pageSize);

  return (
    <div className='mt-8 space-y-4'>
      {usedFallback ? (
        <p className='text-xs text-zinc-500'>Showing sample imagery until published photos are available in Admin → Website CMS.</p>
      ) : null}

      {lightbox ? (
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Image preview'
          className='fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/92 p-4'
          onClick={() => setLightbox(null)}
        >
          <button
            type='button'
            aria-label='Close image preview'
            onClick={() => setLightbox(null)}
            className='absolute right-4 top-4 z-10 rounded-full border border-gold/40 bg-black/80 p-2 text-gold-soft hover:bg-gold/10'
          >
            <X className='h-7 w-7' aria-hidden />
          </button>
          <div className='max-h-[90vh] max-w-full' onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.caption ?? 'Gallery'}
              className='max-h-[82vh] max-w-full object-contain shadow-[0_0_40px_rgba(212,166,77,0.15)]'
            />
            {lightbox.caption ? <p className='mt-3 text-center text-sm text-zinc-300'>{lightbox.caption}</p> : null}
            <p className='mt-2 text-center text-[10px] text-zinc-600'>Click outside to close</p>
          </div>
        </div>
      ) : null}

      <div className='relative'>
        {rows.length > pageSize ? (
          <>
            <button
              type='button'
              aria-label='Previous gallery page'
              onClick={() => scrollToPage(page - 1)}
              disabled={page <= 0}
              className='absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-gold/45 bg-black/80 p-2.5 text-gold-soft shadow-[0_0_20px_rgba(212,166,77,0.25)] transition hover:bg-gold/15 disabled:opacity-30 sm:block'
            >
              <ChevronLeft className='h-6 w-6' aria-hidden />
            </button>
            <button
              type='button'
              aria-label='Next gallery page'
              onClick={() => scrollToPage(page + 1)}
              disabled={page >= pageCount - 1}
              className='absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-gold/45 bg-black/80 p-2.5 text-gold-soft shadow-[0_0_20px_rgba(212,166,77,0.25)] transition hover:bg-gold/15 disabled:opacity-30 sm:block'
            >
              <ChevronRight className='h-6 w-6' aria-hidden />
            </button>
          </>
        ) : null}

        <div
          ref={scrollerRef}
          className={
            rows.length > pageSize
              ? 'flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'grid gap-4 md:grid-cols-2 lg:grid-cols-3'
          }
          style={rows.length > pageSize ? { scrollSnapType: 'x mandatory' } : undefined}
        >
          {rows.length > pageSize
            ? Array.from({ length: pageCount }).map((_, pi) => (
                <div
                  key={`page-${pi}`}
                  className='grid w-full min-w-full shrink-0 snap-center gap-4 sm:grid-cols-2 lg:grid-cols-3'
                >
                  {rows.slice(pi * pageSize, pi * pageSize + pageSize).map((row) => {
                    const imageUrl = row.url || row.image_url;
                    return (
                      <div key={row.id} className='transition hover:-translate-y-0.5'>
                        <button
                          type='button'
                          onClick={() => setLightbox({ src: imageUrl, caption: row.caption })}
                          className='group block w-full text-left'
                        >
                          <article className='overflow-hidden rounded-2xl border border-gold/25 shadow-[0_0_24px_rgba(212,166,77,0.08)] transition hover:border-gold/50 hover:shadow-[0_0_36px_rgba(212,166,77,0.2)]'>
                            <div
                              className='h-56 bg-cover bg-center transition duration-500 group-hover:scale-[1.02] sm:h-64'
                              style={{ backgroundImage: `url(${imageUrl})` }}
                            />
                            {row.featured ? (
                              <p className='border-t border-white/10 bg-black/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-soft'>
                                Featured
                              </p>
                            ) : null}
                            {row.caption ? (
                              <p className='truncate border-t border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-400'>{row.caption}</p>
                            ) : null}
                          </article>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            : visibleSlice.map((row) => {
                const imageUrl = row.url || row.image_url;
                return (
                  <div key={row.id} className='transition hover:-translate-y-0.5'>
                    <button
                      type='button'
                      onClick={() => setLightbox({ src: imageUrl, caption: row.caption })}
                      className='group block w-full text-left'
                    >
                      <article className='overflow-hidden rounded-2xl border border-gold/25 shadow-[0_0_24px_rgba(212,166,77,0.08)] transition hover:border-gold/50 hover:shadow-[0_0_36px_rgba(212,166,77,0.2)]'>
                        <div
                          className='h-64 bg-cover bg-center transition duration-500 group-hover:scale-105'
                          style={{ backgroundImage: `url(${imageUrl})` }}
                        />
                        {row.featured ? (
                          <p className='border-t border-white/10 bg-black/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-soft'>
                            Featured
                          </p>
                        ) : null}
                        {row.caption ? (
                          <p className='truncate border-t border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-400'>{row.caption}</p>
                        ) : null}
                      </article>
                    </button>
                  </div>
                );
              })}
        </div>
      </div>

      {rows.length > pageSize ? (
        <div className='flex flex-wrap items-center justify-center gap-2'>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type='button'
              aria-label={`Gallery page ${i + 1}`}
              onClick={() => scrollToPage(i)}
              className={`h-2 rounded-full transition ${i === page ? 'w-8 bg-gold' : 'w-2 bg-white/25 hover:bg-white/40'}`}
            />
          ))}
          <p className='w-full text-center text-[10px] text-zinc-600 sm:hidden'>Swipe sideways to browse all photos</p>
        </div>
      ) : null}
    </div>
  );
}
