"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PublicSiteDataPayload, SiteDataFeaturedSlide } from '@/lib/public-site-data';
import { publicGalleryDisplayTitle } from '@/lib/gallery-normalize';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';
import { BeforeAfterSlider } from './before-after-slider';
import { TransformationLightbox } from './transformation-lightbox';

type RotatorSlide = SiteDataFeaturedSlide & {
  beforeUrl?: string;
  afterUrl?: string;
  galleryItem?: PublicGalleryItem;
};

export function BeforeAfterRotator() {
  const [slides, setSlides] = useState<RotatorSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchWithTimeout('/api/gallery/public', { cache: 'no-store', timeoutMs: 8000 }).then(async (r) =>
        r.ok ? ((await r.json()) as { images?: PublicGalleryItem[] }) : null,
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
        const featured = (gal?.images ?? []).filter((i) => i.featured === true && (i.url || i.image_url));
        if (featured.length > 0) {
          setSlides(
            featured.map((img, i) => ({
              id: `gal-${i}`,
              label: publicGalleryDisplayTitle(img as Record<string, unknown>),
              image: String(img.url || img.image_url),
              beforeUrl: img.beforeUrl ? String(img.beforeUrl) : undefined,
              afterUrl: img.afterUrl || img.url ? String(img.afterUrl || img.url) : undefined,
              galleryItem: img,
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
      if (paused || lightbox) return;
      setActiveIndex((value) => (value + 1) % n);
    }, 5200);
    return () => window.clearInterval(interval);
  }, [lightbox, paused, slides.length]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const lightboxItems: PublicGalleryItem[] = slides.map((slide) => slide.galleryItem ?? ({
    id: slide.id,
    url: slide.afterUrl || slide.image,
    image_url: slide.afterUrl || slide.image,
    caption: slide.label,
    sort_order: 0,
    order_index: 0,
    published: true,
    watermark: false,
    beforeUrl: slide.beforeUrl,
    afterUrl: slide.afterUrl || slide.image,
    vehicleLabel: slide.label,
    serviceLabel: 'Featured transformation',
    vehicleClass: 'premium',
    featured: true,
    createdAt: new Date().toISOString(),
  }));

  const safeIndex = slides.length ? activeIndex % slides.length : 0;
  const active = slides[safeIndex];

  if (!slides.length || !active) {
    return null;
  }

  return (
    <article
      className="rounded-2xl border border-gold/20 bg-card/80 p-5 backdrop-blur"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Before / After Preview</p>
      <p className="mt-2 text-[11px] text-muted-foreground">Curated from Admin → Homepage featured transformations.</p>
      <button
        type="button"
        className="group relative mt-4 block w-full overflow-hidden rounded-xl border border-gold/25 text-left outline-none transition hover:border-gold/50 hover:shadow-[0_0_32px_rgba(212,166,77,0.22)] focus-visible:ring-2 focus-visible:ring-gold-soft"
        onClick={() => setLightbox(true)}
        aria-label={`Open larger preview: ${active.label}`}
      >
        <div className="relative h-44 w-full md:h-52">
          {active.beforeUrl && active.afterUrl && active.beforeUrl !== active.afterUrl ? (
            <BeforeAfterSlider beforeUrl={active.beforeUrl} afterUrl={active.afterUrl} aspectRatio="h-full" className="rounded-none border-0" />
          ) : (
            <Image
              src={active.image}
              alt={active.label}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
              sizes="(max-width:768px) 100vw, 420px"
              unoptimized
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
          <span className="absolute bottom-2 left-3 right-3 text-[10px] font-bold uppercase tracking-wider text-white drop-shadow">
            Tap to expand
          </span>
        </div>
      </button>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-foreground">{active.label}</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map((car, idx) => (
          <button
            key={car.id}
            type="button"
            onClick={() => {
              setPaused(true);
              setActiveIndex(idx);
            }}
            className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition ${
              idx === safeIndex ? "border-gold shadow-[0_0_12px_rgba(212,166,77,0.35)]" : "border-border opacity-70 hover:opacity-100"
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
            className={`h-1.5 flex-1 rounded-full ${idx === safeIndex ? "bg-gold" : "bg-muted"}`}
          />
        ))}
      </div>

      {lightbox ? (
        <TransformationLightbox items={lightboxItems} activeIndex={safeIndex} onIndex={setActiveIndex} onClose={() => setLightbox(false)} />
      ) : null}
    </article>
  );
}
