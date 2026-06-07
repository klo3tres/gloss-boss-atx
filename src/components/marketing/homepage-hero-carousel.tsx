'use client';

import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { BeforeAfterSlider } from './before-after-slider';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';

export function HomepageHeroCarousel() {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 10000 })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { images?: PublicGalleryItem[] };
      })
      .then((data) => {
        if (cancelled || !data?.images) return;
        // Filter for transformations that have both before and after images
        const transformations = data.images.filter(
          (img) => img.beforeUrl && img.afterUrl && img.beforeUrl !== img.afterUrl
        );
        // Show featured first, then others
        const sorted = [...transformations].sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });
        setItems(sorted);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToSlide = useCallback(
    (idx: number) => {
      const el = scrollerRef.current;
      if (!el || items.length === 0) return;
      const target = Math.max(0, Math.min(items.length - 1, idx));
      const w = el.clientWidth;
      el.scrollTo({ left: target * w, behavior: 'smooth' });
      setActiveIndex(target);
    },
    [items.length]
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const i = Math.round(el.scrollLeft / w);
      setActiveIndex(Math.max(0, Math.min(items.length - 1, i)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [items.length]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-zinc-900 ring-1 ring-white/5" />
      </div>
    );
  }

  if (items.length === 0) {
    return null; // Don't render if there are no before/after pairs
  }

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-col items-center text-center mb-6">
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">
          <Sparkles className="h-3 w-3" /> Featured Transformations
        </span>
        <h2 className="mt-2 text-xl font-black uppercase tracking-wider text-white sm:text-2xl">
          Swipe to see the difference
        </h2>
      </div>

      <div className="relative group">
        {/* Scroller Container */}
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="w-full min-w-full shrink-0 snap-center px-1"
            >
              <div className="gb-premium-card overflow-hidden rounded-3xl border border-gold/15 bg-black/60 p-4 sm:p-6 shadow-[0_0_50px_rgba(212,175,55,0.08)]">
                {/* Before/After slider */}
                <BeforeAfterSlider
                  beforeUrl={item.beforeUrl!}
                  afterUrl={item.afterUrl!}
                  aspectRatio="aspect-[16/10]"
                  watermark={item.watermark}
                />

                {/* Details under slider */}
                <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white uppercase">
                      {item.vehicleLabel || 'Premium Detailing Transformation'}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {item.serviceLabel && (
                        <span className="rounded-full border border-gold/30 bg-gold/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-soft">
                          {item.serviceLabel}
                        </span>
                      )}
                      {item.featured && (
                        <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/gallery/${item.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gold/40 hover:border-gold bg-black/50 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-gold-soft hover:text-white transition duration-300"
                  >
                    View Details <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Carousel Prev/Next Buttons (hidden on mobile, visible on desktop) */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="absolute left-4 top-[40%] -translate-y-1/2 z-20 hidden md:flex items-center justify-center rounded-full border border-gold/45 bg-black/80 p-3 text-gold-soft hover:bg-gold/15 disabled:opacity-30 disabled:pointer-events-none transition shadow-[0_0_20px_rgba(212,175,55,0.25)]"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              disabled={activeIndex === items.length - 1}
              className="absolute right-4 top-[40%] -translate-y-1/2 z-20 hidden md:flex items-center justify-center rounded-full border border-gold/45 bg-black/80 p-3 text-gold-soft hover:bg-gold/15 disabled:opacity-30 disabled:pointer-events-none transition shadow-[0_0_20px_rgba(212,175,55,0.25)]"
              aria-label="Next slide"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Dot Indicators */}
      {items.length > 1 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex justify-center gap-2">
            {items.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToSlide(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? 'w-8 bg-gold' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          <p className="text-[10px] text-zinc-500 md:hidden">Swipe to browse other transformations</p>
        </div>
      )}
    </section>
  );
}
