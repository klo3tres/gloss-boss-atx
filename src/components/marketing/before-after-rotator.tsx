"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  featuredShowcasePlaceholders,
  type PublicSiteDataPayload,
  type SiteDataFeaturedSlide,
} from "@/lib/public-site-data";

export function BeforeAfterRotator() {
  const [slides, setSlides] = useState<SiteDataFeaturedSlide[]>(() => featuredShowcasePlaceholders());
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) setSlides(featuredShowcasePlaceholders());
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
        const next = data.featuredShowcase?.length ? data.featuredShowcase : featuredShowcasePlaceholders();
        setSlides(next);
        setActiveIndex(0);
      })
      .catch(() => {
        if (!cancelled) setSlides(featuredShowcasePlaceholders());
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

  const showCmsHint = slides.some((s) => s.label.toLowerCase().includes('upload first transformation'));

  return (
    <article className="rounded-2xl border border-gold/20 bg-black/60 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">
        Before / After Preview
      </p>
      {showCmsHint ? (
        <p className="mt-2 text-xs text-amber-100/90">Upload first transformation in Admin → Site content when you are ready to go live.</p>
      ) : null}
      <div
        className="mt-4 h-44 rounded-xl bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${active.image})` }}
      />
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-200">
        {active.label}
      </p>
      <div className="mt-2 flex gap-2">
        {slides.map((car, idx) => (
          <span
            key={car.id}
            className={`h-1.5 flex-1 rounded-full ${
              idx === safeIndex ? "bg-gold" : "bg-white/20"
            }`}
          />
        ))}
      </div>
    </article>
  );
}
