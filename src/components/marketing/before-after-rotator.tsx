"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PublicSiteDataPayload, SiteDataFeaturedSlide } from '@/lib/public-site-data';

export function BeforeAfterRotator() {
  const [slides, setSlides] = useState<SiteDataFeaturedSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 8000 }).then(async (r) =>
        r.ok ? ((await r.json()) as { images?: Array<{ url?: string; image_url?: string; caption?: string | null; featured?: boolean }> }) : null,
      ),
      fetchWithTimeout('/api/public/site-data', { cache: 'no-store', timeoutMs: 8000 }).then(async (r) => {
        try {
          return r.ok ? ((await r.json()) as PublicSiteDataPayload) : null;
        } catch {
          return null;
        }
      }),
    ])
      .then(([gal, site]) => {
        if (cancelled) return;
        const featured = (gal?.images ?? []).filter((i) => i.featured !== false && (i.url || i.image_url));
        if (featured.length > 0) {
          setSlides(
            featured.map((img, i) => ({
              id: `gal-${i}`,
              label: img.caption?.trim() || 'Featured work',
              image: String(img.url || img.image_url),
            })),
          );
          setActiveIndex(0);
          return;
        }
        if (site?.featuredShowcaseFromCms === true && site.featuredShowcase?.length) {
          setSlides(site.featuredShowcase);
          setActiveIndex(0);
          return;
        }
        setSlides([]);
      })
      .catch(() => {
        if (!cancelled) setSlides([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const n = Math.max(slides.length, 1);
    const interval = window.setInterval(() => {
      setActiveIndex((value) => (value + 1) % n);
    }, 2600);
    return () => window.clearInterval(interval);
  }, [slides.length]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const safeIndex = slides.length ? activeIndex % slides.length : 0;
  const active = slides[safeIndex];

  const go = useCallback(
    (dir: -1 | 1) => {
      const n = Math.max(slides.length, 1);
      setActiveIndex((i) => (i + dir + n) % n);
    },
    [slides.length],
  );

  if (!slides.length || !active) {
    return (
      <div className='rounded-3xl border border-dashed border-white/10 bg-black/40 px-6 py-16 text-center'>
        <p className='text-sm font-semibold text-zinc-400'>Featured work gallery coming soon.</p>
        <p className='mt-2 text-xs text-zinc-600'>Upload and feature photos in Admin → CMS.</p>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-gold/20 bg-black/60 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Before / After Preview</p>
      <p className="mt-2 text-[11px] text-zinc-500">Curated from Admin → Homepage featured transformations.</p>
      <button
        type="button"
        className="group relative mt-4 block w-full overflow-hidden rounded-xl border border-gold/25 text-left outline-none transition hover:border-gold/50 hover:shadow-[0_0_32px_rgba(212,166,77,0.22)] focus-visible:ring-2 focus-visible:ring-gold-soft"
        onClick={() => setLightbox(true)}
        aria-label={`Open larger preview: ${active.label}`}
      >
        <div className="relative h-44 w-full md:h-52">
          <Image
            src={active.image}
            alt={active.label}
            fill
            className="object-cover transition duration-700 group-hover:scale-[1.03]"
            sizes="(max-width:768px) 100vw, 420px"
            unoptimized
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
          <span className="absolute bottom-2 left-3 right-3 text-[10px] font-bold uppercase tracking-wider text-white drop-shadow">
            Tap to expand
          </span>
        </div>
      </button>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-200">{active.label}</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map((car, idx) => (
          <button
            key={car.id}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition ${
              idx === safeIndex ? "border-gold shadow-[0_0_12px_rgba(212,166,77,0.35)]" : "border-white/10 opacity-70 hover:opacity-100"
            }`}
            aria-label={`Show slide ${idx + 1}`}
          >
            <Image src={car.image} alt="" fill className="object-cover" sizes="64px" unoptimized />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {slides.map((car, idx) => (
          <span
            key={`dot-${car.id}`}
            className={`h-1.5 flex-1 rounded-full ${idx === safeIndex ? "bg-gold" : "bg-white/20"}`}
          />
        ))}
      </div>

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Featured transformation preview"
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/92 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 z-10 rounded-full border border-gold/40 bg-black/80 p-2 text-gold-soft hover:bg-gold/10"
          >
            <X className="h-7 w-7" aria-hidden />
          </button>
          <div className="max-h-[90vh] max-w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative mx-auto h-[min(70vh,520px)] w-[min(100vw-2rem,900px)]">
              <Image
                src={active.image}
                alt={active.label}
                fill
                className="object-contain"
                sizes="900px"
                priority
                unoptimized
              />
            </div>
            {slides.length > 1 ? (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="rounded-full border border-gold/40 px-3 py-1 text-xs font-bold uppercase text-gold-soft"
                  onClick={() => go(-1)}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded-full border border-gold/40 px-3 py-1 text-xs font-bold uppercase text-gold-soft"
                  onClick={() => go(1)}
                >
                  Next
                </button>
              </div>
            ) : null}
            <p className="mt-3 text-sm text-zinc-300">{active.label}</p>
            <p className="mt-2 text-[10px] text-zinc-600">Click outside to close</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}
