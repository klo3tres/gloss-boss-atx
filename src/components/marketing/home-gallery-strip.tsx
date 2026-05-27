'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { publicGalleryDisplayTitle, type NormalizedGalleryImage } from '@/lib/gallery-normalize';
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
    featured: true,
  }));
}

function sortGalleryRows(rows: NormalizedGalleryImage[]): NormalizedGalleryImage[] {
  return [...rows].sort((a, b) => {
    const fa = a.featured ? 1 : 0;
    const fb = b.featured ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id);
  });
}

/** Homepage shows CMS featured images only — no stock placeholders. */
function resolveGalleryRows(remote: NormalizedGalleryImage[]): { rows: NormalizedGalleryImage[]; empty: boolean } {
  const valid = sortGalleryRows(remote.filter((r) => (r.url || r.image_url).trim()));
  const featured = valid.filter((r) => r.featured);
  if (featured.length === 0) {
    return { rows: [], empty: true };
  }
  return { rows: featured, empty: false };
}

export function HomeGalleryStrip() {
  const [rows, setRows] = useState<NormalizedGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyGallery, setEmptyGallery] = useState(false);
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
      setLoading(false);
      const r = resolveGalleryRows([]);
      setRows(r.rows);
      setEmptyGallery(r.empty);
      setLoading(false);
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
        const list = (gal?.images ?? []) as NormalizedGalleryImage[];
        const galleryResolved = resolveGalleryRows(list);
        if (galleryResolved.rows.length > 0) {
          setRows(galleryResolved.rows);
          setEmptyGallery(false);
          setLoading(false);
          setPage(0);
          return;
        }
        if (site?.featuredShowcaseFromCms === true && site.featuredShowcase?.length) {
          const mapped = slidesToGalleryRows(site.featuredShowcase);
          const resolved = resolveGalleryRows(mapped);
          setRows(resolved.rows);
          setEmptyGallery(resolved.empty);
          setLoading(false);
          setPage(0);
          return;
        }
        const resolved = resolveGalleryRows(list);
        setRows(resolved.rows);
        setEmptyGallery(resolved.empty);
        setLoading(false);
        setPage(0);
      })
      .catch((e) => {
        if (cancelled) return;
        settledRef.current = true;
        setLoading(false);
        console.warn('[CRM_DEBUG_UI]', 'gallery_public_fetch', e instanceof Error ? e.message : e);
        const r = resolveGalleryRows([]);
        setRows(r.rows);
        setEmptyGallery(r.empty);
        setLoading(false);
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

  if (loading && rows.length === 0 && !emptyGallery) {
    return (
      <div className='mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='aspect-[4/3] animate-pulse rounded-2xl bg-zinc-900/80 ring-1 ring-white/5' />
        ))}
      </div>
    );
  }

  return (
    <div className='mt-8 space-y-4'>
      {emptyGallery ? (
        <p className='text-xs text-zinc-500'>
          Featured gallery photos will appear here once you feature images in Admin → Website CMS.
        </p>
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
                    const title = publicGalleryDisplayTitle(row);
                    return (
                      <div key={row.id} className='transition hover:-translate-y-0.5'>
                        <button
                          type='button'
                          onClick={() => setLightbox({ src: imageUrl, caption: title })}
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
                            <p className='truncate border-t border-white/5 bg-black/40 px-3 py-2 text-xs text-zinc-400'>{title}</p>
                          </article>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            : visibleSlice.map((row) => {
                const imageUrl = row.url || row.image_url;
                const title = publicGalleryDisplayTitle(row);
                return (
                  <div key={row.id} className='transition hover:-translate-y-0.5'>
                    <button
                      type='button'
                      onClick={() => setLightbox({ src: imageUrl, caption: title })}
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
                        <p className='truncate border-t border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-400'>{title}</p>
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
