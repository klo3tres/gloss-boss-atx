'use client';

import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';
import { publicGalleryDisplayTitle } from '@/lib/gallery-normalize';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function PublicGalleryPortfolio() {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ index: number; zoom: boolean } | null>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 12000 })
      .then(async (r) => (r.ok ? ((await r.json()) as { images?: PublicGalleryItem[] }) : null))
      .then((j) => {
        if (cancelled) return;
        setItems((j?.images ?? []).filter((img) => str(img.url || img.image_url)));
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

  const CATEGORIES = [
    { id: 'all', label: 'All Projects' },
    { id: 'ceramic', label: 'Ceramic Coatings' },
    { id: 'details', label: 'Full Details' },
    { id: 'interior', label: 'Interior Restoration' },
    { id: 'paint', label: 'Paint Correction' },
  ];

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const featured = useMemo(() => items.filter((i) => i.featured), [items]);
  const baseItems = useMemo(() => (featured.length ? featured : items), [featured, items]);

  const filteredGridItems = useMemo(() => {
    if (selectedCategory === 'all') return baseItems;
    return baseItems.filter((item) => {
      const lbl = str(item.serviceLabel || item.caption || '').toLowerCase();
      if (selectedCategory === 'ceramic') return lbl.includes('ceramic') || lbl.includes('coating');
      if (selectedCategory === 'details') return lbl.includes('detail') || lbl.includes('full');
      if (selectedCategory === 'interior') return lbl.includes('interior') || lbl.includes('leather') || lbl.includes('seat') || lbl.includes('carpet');
      if (selectedCategory === 'paint') return lbl.includes('paint') || lbl.includes('correction') || lbl.includes('polish');
      return true;
    });
  }, [selectedCategory, baseItems]);

  const active = lightbox != null ? items[lightbox.index] : null;

  const go = useCallback(
    (d: number) => {
      if (!lightbox || items.length < 2) return;
      setLightbox({ index: (lightbox.index + d + items.length) % items.length, zoom: false });
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
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <div className='h-10 w-10 animate-pulse rounded-full border-2 border-gold/40 border-t-gold' />
        <p className='text-sm text-zinc-500'>Loading transformations…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='gb-glass rounded-3xl border border-gold/20 px-8 py-16 text-center'>
        <p className='text-lg font-bold text-white'>Portfolio coming soon</p>
        <p className='mt-2 text-sm text-zinc-400'>Upload before/after pairs in Admin → Website CMS → Gallery.</p>
      </div>
    );
  }

  return (
    <>
      {featured.length > 0 ? (
        <section className='mb-12'>
          <p className='text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft'>Featured transformations</p>
          <div className='mt-4 grid gap-6 lg:grid-cols-2'>
            {featured.slice(0, 4).map((img, i) => (
              <FeaturedCard
                key={img.id || i}
                img={img}
                onOpen={() => setLightbox({ index: Math.max(0, items.findIndex((x) => x.id === img.id)), zoom: false })}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Category Filter Tabs */}
      <div className="mb-8 flex flex-wrap gap-2 justify-center border-b border-white/5 pb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
              selectedCategory === cat.id
                ? 'bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.25)]'
                : 'border border-white/10 text-zinc-400 hover:border-gold/30'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <p className='mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft'>All work · click to enlarge</p>
      <div className='gb-gallery-masonry'>
        {filteredGridItems.map((img, i) => (
          <MasonryTile
            key={img.id || i}
            img={img}
            tall={i % 3 === 0}
            onOpen={() => setLightbox({ index: Math.max(0, items.findIndex((x) => x.id === img.id)), zoom: false })}
          />
        ))}
      </div>

      <AnimatePresence>
        {active && lightbox ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 z-[400] flex flex-col bg-black'
            role='dialog'
            aria-modal
            onTouchStart={(e) => {
              touchStart.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (touchStart.current == null || items.length < 2) return;
              const end = e.changedTouches[0]?.clientX ?? touchStart.current;
              const dx = end - touchStart.current;
              if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
              touchStart.current = null;
            }}
          >
            <header className='flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6'>
              <div className='min-w-0'>
                <p className='truncate text-base font-black text-white'>{publicGalleryDisplayTitle(active)}</p>
                <div className='mt-1 flex flex-wrap gap-2'>
                  {str(active.vehicleLabel) ? (
                    <span className='rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-300'>
                      {str(active.vehicleLabel)}
                    </span>
                  ) : null}
                  {str(active.serviceLabel) ? (
                    <span className='rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>
                      {str(active.serviceLabel)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => setLightbox((lb) => (lb ? { ...lb, zoom: !lb.zoom } : lb))}
                  className='rounded-lg border border-white/20 p-2 text-white'
                  aria-label='Toggle zoom'
                >
                  {lightbox.zoom ? <Maximize2 className='h-5 w-5' /> : <ZoomIn className='h-5 w-5' />}
                </button>
                <button type='button' onClick={() => setLightbox(null)} className='rounded-lg border border-white/20 p-2 text-white' aria-label='Close'>
                  <X className='h-5 w-5' />
                </button>
              </div>
            </header>

            <div className='relative flex min-h-0 flex-1 flex-col items-center justify-center p-2 sm:p-6'>
              {items.length > 1 ? (
                <button type='button' onClick={() => go(-1)} className='absolute left-2 z-10 rounded-full bg-black/70 p-3 text-white sm:left-4'>
                  <ChevronLeft className='h-7 w-7' />
                </button>
              ) : null}
              <LightboxMedia item={active} zoom={lightbox.zoom} />
              {items.length > 1 ? (
                <button type='button' onClick={() => go(1)} className='absolute right-2 z-10 rounded-full bg-black/70 p-3 text-white sm:right-4'>
                  <ChevronRight className='h-7 w-7' />
                </button>
              ) : null}
            </div>

            <footer className='shrink-0 border-t border-white/10 px-4 py-4 text-center sm:px-6'>
              <p className='text-xs text-zinc-500'>
                {lightbox.index + 1} of {items.length} · swipe or arrow keys
              </p>
            </footer>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function cleanCaption(text: string): string {
  const t = text.trim();
  if (
    !t ||
    /\.(jpe?g|png|webp|gif|heic|avif|heif)$/i.test(t) ||
    /^(img|dsc|photo|image|snap|screenshot|wp|p\d|vid)[-_]?\d*/i.test(t) ||
    /^[a-f0-9-]{20,}$/i.test(t) ||
    t.includes('/') ||
    t.includes('\\') ||
    (t.includes('_') && !t.includes(' '))
  ) {
    return 'Gloss Boss Premium Detail';
  }
  return t;
}

function FeaturedCard({ img, onOpen }: { img: PublicGalleryItem; onOpen: () => void }) {
  const before = str(img.beforeUrl);
  const after = str(img.afterUrl || img.url);
  const rawCaption = publicGalleryDisplayTitle(img);
  const caption = cleanCaption(rawCaption);

  return (
    <button
      type='button'
      onClick={onOpen}
      className='group overflow-hidden gb-premium-card rounded-3xl border border-gold/20 bg-black text-left shadow-[0_0_48px_rgba(212,175,55,0.12)] transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_35px_rgba(212,175,55,0.22)] hover:-translate-y-0.5'
    >
      {before && after && before !== after ? (
        <div className='grid min-h-[280px] grid-cols-2 sm:min-h-[360px]'>
          <div className='relative'>
            <span className='absolute left-3 top-3 z-10 rounded-full bg-black/85 border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-200 backdrop-blur-sm'>Before</span>
            <img src={before} alt='Before' className='h-full min-h-[280px] w-full object-cover sm:min-h-[360px] transition duration-500 group-hover:scale-[1.01]' />
          </div>
          <div className='relative'>
            <span className='absolute left-3 top-3 z-10 rounded-full bg-gold/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black shadow-md'>After</span>
            <img src={after} alt='After' className='h-full min-h-[280px] w-full object-cover sm:min-h-[360px] transition duration-500 group-hover:scale-[1.01]' />
          </div>
        </div>
      ) : (
        <img src={after} alt={caption} className='h-[360px] w-full object-cover transition duration-500 group-hover:scale-[1.02]' />
      )}
      <div className='border-t border-gold/10 bg-gradient-to-t from-black to-zinc-950/80 p-5'>
        <p className='text-lg font-black text-white tracking-tight'>{caption}</p>
        {str(img.serviceLabel) ? <p className='mt-1 text-sm text-gold-soft font-bold uppercase tracking-wider'>{str(img.serviceLabel)}</p> : null}
      </div>
    </button>
  );
}

function MasonryTile({
  img,
  onOpen,
  tall,
}: {
  img: PublicGalleryItem;
  onOpen: () => void;
  tall?: boolean;
}) {
  const before = str(img.beforeUrl);
  const after = str(img.afterUrl || img.url);
  const url = str(img.url || img.image_url);
  const rawCaption = publicGalleryDisplayTitle(img);
  const caption = cleanCaption(rawCaption);

  return (
    <button
      type='button'
      onClick={onOpen}
      className='gb-gallery-masonry-item mb-5 break-inside-avoid overflow-hidden gb-premium-card rounded-2xl border border-gold/15 text-left transition-all duration-300 hover:border-gold/50 hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] hover:-translate-y-0.5'
    >
      {before && after && before !== after ? (
        <div className='grid grid-cols-2 gap-px bg-black'>
          <div className='relative'>
            <span className='absolute left-2 top-2 z-10 rounded bg-black/80 border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-300'>Before</span>
            <img src={before} alt='' className={tall ? 'h-56 w-full object-cover' : 'h-44 w-full object-cover'} />
          </div>
          <div className='relative'>
            <span className='absolute left-2 top-2 z-10 rounded bg-gold/90 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-black'>After</span>
            <img src={after} alt='' className={tall ? 'h-56 w-full object-cover' : 'h-44 w-full object-cover'} />
          </div>
        </div>
      ) : (
        <img src={url} alt={caption} className={tall ? 'h-72 w-full object-cover' : 'h-52 w-full object-cover'} />
      )}
      <div className='p-4 border-t border-white/5'>
        <p className='text-sm font-bold text-white tracking-tight'>{caption}</p>
        <div className='mt-2 flex flex-wrap gap-1.5'>
          {str(img.vehicleLabel) ? (
            <span className='rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400'>{str(img.vehicleLabel)}</span>
          ) : null}
          {str(img.serviceLabel) ? (
            <span className='rounded bg-gold/5 border border-gold/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gold-soft'>{str(img.serviceLabel)}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function LightboxMedia({ item, zoom }: { item: PublicGalleryItem; zoom: boolean }) {
  const before = str(item.beforeUrl);
  const after = str(item.afterUrl || item.url);
  const scale = zoom ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in';

  if (before && after && before !== after) {
    return (
      <div className={`grid h-full w-full max-w-6xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 ${scale}`}>
        <div className='relative flex flex-col'>
          <span className='mb-2 text-center text-[10px] font-black uppercase text-zinc-400'>Before</span>
          <img src={before} alt='Before' className='max-h-[min(70vh,720px)] w-full flex-1 object-contain' />
        </div>
        <div className='relative flex flex-col'>
          <span className='mb-2 text-center text-[10px] font-black uppercase text-gold-soft'>After</span>
          <img src={after} alt='After' className='max-h-[min(70vh,720px)] w-full flex-1 object-contain' />
        </div>
      </div>
    );
  }

  return (
    <img
      src={str(item.url || item.image_url)}
      alt=''
      className={`max-h-[min(85vh,1000px)] max-w-full object-contain transition-transform duration-300 ${scale}`}
    />
  );
}
