'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Calendar, Tag, Car, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { BeforeAfterSlider } from './before-after-slider';
import { MotionFade } from './motion-fade';
import { TransformationLightbox } from './transformation-lightbox';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';

const fallbackItems: PublicGalleryItem[] = [
  {
    id: 'fallback-coating',
    url: '/gallery-fallback/coating-after.png',
    image_url: '/gallery-fallback/coating-after.png',
    caption: 'Porsche 911 Carrera S · Ceramic Coating',
    sort_order: 1,
    order_index: 1,
    published: true,
    watermark: false,
    beforeUrl: '/gallery-fallback/coating-before.png',
    afterUrl: '/gallery-fallback/coating-after.png',
    vehicleLabel: 'Porsche 911 Carrera S',
    serviceLabel: 'Ceramic Coating',
    vehicleClass: 'sedan',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-detail',
    url: '/gallery-fallback/detail-after.png',
    image_url: '/gallery-fallback/detail-after.png',
    caption: 'Tesla Model Y · Full Detail',
    sort_order: 2,
    order_index: 2,
    published: true,
    watermark: false,
    beforeUrl: '/gallery-fallback/detail-before.png',
    afterUrl: '/gallery-fallback/detail-after.png',
    vehicleLabel: 'Tesla Model Y',
    serviceLabel: 'Full Detail & Paint Correction',
    vehicleClass: 'suv',
    featured: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-wash',
    url: '/gallery-fallback/wash-after.png',
    image_url: '/gallery-fallback/wash-after.png',
    caption: 'Ford F-150 Raptor · Restorative Wash',
    sort_order: 3,
    order_index: 3,
    published: true,
    watermark: false,
    beforeUrl: '/gallery-fallback/wash-before.png',
    afterUrl: '/gallery-fallback/wash-after.png',
    vehicleLabel: 'Ford F-150 Raptor',
    serviceLabel: 'Exterior Restorative Wash',
    vehicleClass: 'truck_large',
    featured: true,
    createdAt: new Date().toISOString(),
  },
];

export interface FeaturedTransformationsSectionProps {
  visuals?: any;
}

function isUsableVisualTransformation(item: any) {
  const before = typeof item?.before === 'string' ? item.before.trim() : '';
  const after = typeof item?.after === 'string' ? item.after.trim() : '';
  const title = typeof item?.title === 'string' ? item.title.trim().toLowerCase() : '';
  const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
  const isDefaultPlaceholder =
    id === 'tf-1' ||
    title === 'paint correction & ceramic coat' ||
    (before.includes('images.unsplash.com/photo-1503376780353') && after.includes('images.unsplash.com/photo-1549317336'));

  return item?.published !== false && before && after && before !== after && !isDefaultPlaceholder;
}

export function FeaturedTransformationsSection({ visuals }: FeaturedTransformationsSectionProps) {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
          (img) => img.featured && img.beforeUrl && img.afterUrl && img.beforeUrl !== img.afterUrl
        );
        // Homepage only shows real work that admin marked featured.
        setItems(transformations.slice(0, 3));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Recently completed';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return 'Recently completed';
    }
  };

  if (loading && !visuals) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="gb-premium-card aspect-[4/3] w-full animate-pulse rounded-2xl bg-zinc-900 ring-1 ring-white/5" />
        ))}
      </div>
    );
  }

  // Resolve display items based on real featured gallery first. Homepage visuals are an optional
  // manual fallback only, so default visual-manager placeholders cannot override published work.
  let displayItems: PublicGalleryItem[] = [];

  if (items.length > 0) {
    displayItems = items;
  }

  if (visuals?.featuredTransformations?.items && Array.isArray(visuals.featuredTransformations.items)) {
    const publishedVisuals = visuals.featuredTransformations.items.filter(isUsableVisualTransformation);
    if (displayItems.length === 0 && publishedVisuals.length > 0) {
      displayItems = publishedVisuals.map((item: any) => ({
        id: item.id,
        url: item.after,
        image_url: item.after,
        caption: item.caption,
        sort_order: 1,
        order_index: 1,
        published: true,
        watermark: false,
        beforeUrl: item.before,
        afterUrl: item.after,
        vehicleLabel: item.title,
        serviceLabel: item.tags?.split(',')[0]?.trim() || 'Detailing',
        vehicleClass: item.layoutSize === 'wide' ? 'suv' : 'sedan',
        featured: true,
        createdAt: new Date().toISOString()
      }));
    }
  }

  if (displayItems.length === 0) {
    displayItems = fallbackItems;
  }

  const safeActive = Math.min(activeIndex, Math.max(0, displayItems.length - 1));
  const activeItem = displayItems[safeActive] ?? displayItems[0];
  const setNext = (dir: -1 | 1) => setActiveIndex((idx) => (idx + dir + displayItems.length) % displayItems.length);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        {activeItem ? (
          <MotionFade>
            <article className="gb-premium-card overflow-hidden rounded-3xl border border-gold/20 bg-black/50 p-3 shadow-[0_0_45px_rgba(212,175,55,0.08)] sm:p-5">
              <div className="relative overflow-hidden rounded-2xl">
                <BeforeAfterSlider beforeUrl={activeItem.beforeUrl!} afterUrl={activeItem.afterUrl!} aspectRatio="aspect-[4/3] sm:aspect-[16/10]" watermark={activeItem.watermark} />
                <button
                  type="button"
                  onClick={() => setLightboxIndex(safeActive)}
                  className="absolute right-3 bottom-3 z-30 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold/35 bg-black/75 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft backdrop-blur hover:bg-gold hover:text-black"
                >
                  <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    <span className="inline-flex items-center gap-1 text-gold-soft"><Tag className="h-3 w-3" />{activeItem.serviceLabel || 'Detailing'}</span>
                    <span className="inline-flex items-center gap-1 text-zinc-500"><Calendar className="h-3 w-3" />{formatDate(activeItem.createdAt)}</span>
                  </div>
                  <h3 className="mt-2 text-xl font-black uppercase tracking-tight text-white sm:text-3xl">{activeItem.vehicleLabel || 'Premium Transformation'}</h3>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setNext(-1)} className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-black/60 text-zinc-200 hover:border-gold/40">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => setNext(1)} className="grid h-12 w-12 place-items-center rounded-xl bg-gold text-black">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </article>
          </MotionFade>
        ) : null}

        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:grid-cols-1 lg:overflow-visible">
            {displayItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`group flex min-w-[78%] items-center gap-3 rounded-2xl border p-3 text-left transition sm:min-w-[52%] lg:min-w-0 ${
                  idx === safeActive ? 'border-gold/45 bg-gold/10 shadow-[0_0_24px_rgba(212,175,55,0.12)]' : 'border-white/10 bg-black/35 hover:border-gold/25'
                }`}
              >
                <img src={item.afterUrl || item.url} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black uppercase text-white">{item.vehicleLabel || 'Transformation'}</p>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-gold-soft">{item.serviceLabel || 'Detailing'}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500"><Car className="h-3 w-3" />{item.vehicleClass?.replace('_', ' ') || 'Premium'}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {displayItems.map((item, idx) => (
              <button
                key={`dot-${item.id}`}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`h-1.5 flex-1 rounded-full transition ${idx === safeActive ? 'bg-gold' : 'bg-white/15'}`}
                aria-label={`Show transformation ${idx + 1}`}
              />
            ))}
          </div>
          <Link href="/gallery" className="inline-flex w-full items-center justify-between rounded-xl border border-gold/25 bg-black/45 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10">
            <span>Open full portfolio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      {lightboxIndex !== null ? (
        <TransformationLightbox items={displayItems} activeIndex={lightboxIndex} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      ) : null}
    </>
  );
}
