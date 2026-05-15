"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  defaultFeaturedShowcaseSlides,
  type PublicSiteDataPayload,
  type SiteDataFeaturedSlide,
} from "@/lib/public-site-data";

export function BeforeAfterRotator() {
  const [slides, setSlides] = useState<SiteDataFeaturedSlide[]>(() => defaultFeaturedShowcaseSlides());
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) setSlides(defaultFeaturedShowcaseSlides());
    }, 12000);
    fetchWithTimeout("/api/public/site-data", { cache: "no-store", timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as PublicSiteDataPayload;
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data) return;
        const next =
          Array.isArray(data.featuredShowcase) && data.featuredShowcase.length > 0
            ? data.featuredShowcase
            : defaultFeaturedShowcaseSlides();
        setSlides(next);
        setActiveIndex(0);
      })
      .catch(() => {
        if (!cancelled) setSlides(defaultFeaturedShowcaseSlides());
      })
      .finally(() => clearTimeout(tid));
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, []);

  useEffect(() => {
    const n = Math.max(slides.length, 1);
    const interval = window.setInterval(() => {
      setActiveIndex((value) => (value + 1) % n);
    }, 2600);
    return () => window.clearInterval(interval);
  }, [slides.length]);

  const safeIndex = slides.length ? activeIndex % slides.length : 0;
  const active = slides[safeIndex];

  if (!active) return null;

  return (
    <article className="rounded-2xl border border-gold/20 bg-black/60 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Before / After Preview</p>
      <p className="mt-2 text-[11px] text-zinc-500">Curated from Admin → Homepage featured transformations.</p>
      <div
        className="mt-4 h-44 rounded-xl bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${active.image})` }}
      />
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-200">{active.label}</p>
      <div className="mt-2 flex gap-2">
        {slides.map((car, idx) => (
          <span
            key={car.id}
            className={`h-1.5 flex-1 rounded-full ${idx === safeIndex ? "bg-gold" : "bg-white/20"}`}
          />
        ))}
      </div>
    </article>
  );
}
