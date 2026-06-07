'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ChevronLeft, ChevronRight, Calendar, Car, Sparkles, ShieldCheck, Tag } from 'lucide-react';
import { BeforeAfterSlider } from './before-after-slider';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';

type TechPhoto = {
  id: string;
  url: string;
  category: string;
};

type GalleryDetailClientProps = {
  item: PublicGalleryItem;
  techPhotos: TechPhoto[];
};

export function GalleryDetailClient({ item, techPhotos }: GalleryDetailClientProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Combine all images for the lightbox list
  const allImages: { url: string; label: string }[] = [];
  
  if (item.beforeUrl) {
    allImages.push({ url: item.beforeUrl, label: 'Before Detailing' });
  }
  if (item.afterUrl) {
    allImages.push({ url: item.afterUrl, label: 'After Detailing' });
  } else if (item.url) {
    allImages.push({ url: item.url, label: 'Completed Detail' });
  }

  techPhotos.forEach((photo) => {
    // Avoid duplicating before/after URLs if they happen to be identical to what is in techPhotos
    if (photo.url !== item.beforeUrl && photo.url !== item.afterUrl && photo.url !== item.url) {
      const formattedCategory = photo.category ? photo.category.replace(/_/g, ' ') : 'Detail Photo';
      allImages.push({ url: photo.url, label: `Job Media — ${formattedCategory}` });
    }
  });

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') setLightboxIndex((prev) => (prev !== null ? (prev - 1 + allImages.length) % allImages.length : null));
      if (e.key === 'ArrowRight') setLightboxIndex((prev) => (prev !== null ? (prev + 1) % allImages.length : null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, allImages.length]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Recently completed';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently completed';
    }
  };

  const hasSlider = Boolean(item.beforeUrl && item.afterUrl && item.beforeUrl !== item.afterUrl);

  return (
    <div className="space-y-12">
      {/* Detail Page Layout grid */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Slider or Main Image */}
        <div className="lg:col-span-8 space-y-4">
          {hasSlider ? (
            <BeforeAfterSlider
              beforeUrl={item.beforeUrl!}
              afterUrl={item.afterUrl!}
              aspectRatio="aspect-[16/10]"
              watermark={item.watermark}
              className="shadow-[0_0_50px_rgba(212,175,55,0.06)]"
            />
          ) : (
            <div className="relative overflow-hidden rounded-3xl border border-gold/15 bg-zinc-950 aspect-[16/10]">
              <img
                src={item.afterUrl || item.url}
                alt={item.caption || 'Transformation Detail'}
                className="h-full w-full object-cover"
              />
              {item.watermark && (
                <img
                  src="/brand/glossboss-clean-logo.png"
                  alt="Gloss Boss watermark"
                  className="absolute right-4 bottom-4 h-6 w-auto opacity-15 select-none pointer-events-none"
                />
              )}
            </div>
          )}

          {/* Quick swipe hint */}
          {hasSlider && (
            <p className="text-center text-xs text-zinc-500">
              Drag the golden handle to compare the Before & After results
            </p>
          )}
        </div>

        {/* Info Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="gb-premium-card rounded-3xl border border-gold/15 p-6 space-y-6">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">
                <Sparkles className="h-3.5 w-3.5" /> Project Specs
              </span>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
                {item.vehicleLabel || 'Transformation'}
              </h2>
            </div>

            <div className="space-y-4 border-t border-b border-white/5 py-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-medium flex items-center gap-2">
                  <Car className="h-4 w-4 text-gold" /> Vehicle
                </span>
                <span className="text-white font-bold">{item.vehicleLabel || 'Premium Ride'}</span>
              </div>
              
              {item.vehicleClass && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-gold" /> Body Style
                  </span>
                  <span className="text-white font-bold capitalize">
                    {item.vehicleClass.replace('_', ' ')}
                  </span>
                </div>
              )}

              {item.serviceLabel && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4 text-gold" /> Service Package
                  </span>
                  <span className="text-white font-bold">{item.serviceLabel}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gold" /> Completed
                </span>
                <span className="text-white font-bold">{formatDate(item.createdAt)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400 font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gold" /> Guarantee
                </span>
                <span className="text-gold-soft font-bold">100% Satisfaction</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Link
                href="/book"
                className="block text-center rounded-xl bg-gold hover:brightness-110 px-6 py-4 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_30px_rgba(212,175,55,0.25)] transition duration-300"
              >
                Book This Service Now
              </Link>
              <Link
                href="/gallery"
                className="block text-center rounded-xl border border-white/20 bg-black/40 hover:border-gold/30 hover:bg-black/60 px-6 py-4 text-xs font-black uppercase tracking-[0.15em] text-white transition duration-300"
              >
                Back To Gallery
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Extra technician work order photos */}
      {techPhotos.length > 0 && (
        <section className="space-y-6 pt-6 border-t border-white/10">
          <div>
            <h3 className="text-xl font-black uppercase tracking-wider text-white">
              Field Work Order Album
            </h3>
            <p className="text-sm text-zinc-400 mt-1">
              Raw high-resolution shots captured on-site during inspection and completion steps. Click to zoom.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {allImages.map((image, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 transition hover:border-gold/30 focus:outline-none"
              >
                <img
                  src={image.url}
                  alt={image.label}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white bg-gold/90 px-2 py-1 rounded shadow-md">
                    Zoom
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lightbox Zoom Modal */}
      {lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close image preview"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 z-10 rounded-full border border-gold/40 bg-black/80 p-2.5 text-gold-soft hover:bg-gold/10"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>

          {/* Nav buttons */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev !== null ? (prev - 1 + allImages.length) % allImages.length : null));
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full border border-gold/45 bg-black/80 p-3 text-gold-soft hover:bg-gold/15"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev !== null ? (prev + 1) % allImages.length : null));
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full border border-gold/45 bg-black/80 p-3 text-gold-soft hover:bg-gold/15"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Active Image container */}
          <div className="max-h-[85vh] max-w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={allImages[lightboxIndex].url}
              alt={allImages[lightboxIndex].label}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-[0_0_50px_rgba(212,175,55,0.15)]"
            />
            {allImages[lightboxIndex].label && (
              <p className="mt-4 text-center text-sm font-bold uppercase tracking-wider text-gold-soft">
                {allImages[lightboxIndex].label}
              </p>
            )}
            <p className="mt-2 text-center text-[10px] text-zinc-500">
              Image {lightboxIndex + 1} of {allImages.length} · Use arrow keys or click outside to exit
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
