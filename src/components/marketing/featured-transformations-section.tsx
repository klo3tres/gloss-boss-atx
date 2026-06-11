'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Calendar, Tag, Car } from 'lucide-react';
import { BeforeAfterSlider } from './before-after-slider';
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

export function FeaturedTransformationsSection({ visuals }: FeaturedTransformationsSectionProps) {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Resolve the display items based on: Owner Selected -> CMS Featured -> Fallback
  let displayItems: PublicGalleryItem[] = [];
  
  if (visuals?.featuredTransformations?.items && Array.isArray(visuals.featuredTransformations.items)) {
    const publishedVisuals = visuals.featuredTransformations.items.filter((x: any) => x.published !== false);
    if (publishedVisuals.length > 0) {
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
    displayItems = items.length > 0 ? items : fallbackItems;
  }

  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {displayItems.map((item) => (
        <article
          key={item.id}
          className="gb-premium-card gb-luxury-card-hover flex flex-col overflow-hidden rounded-3xl border border-gold/15 bg-black/40 p-4 sm:p-5 shadow-[0_0_35px_rgba(212,175,55,0.04)]"
        >
          {/* Interactive Slider */}
          <div className="relative overflow-hidden rounded-2xl">
            <BeforeAfterSlider
              beforeUrl={item.beforeUrl!}
              afterUrl={item.afterUrl!}
              aspectRatio="aspect-[4/3]"
              watermark={item.watermark}
            />
          </div>

          {/* Details */}
          <div className="mt-4 flex flex-1 flex-col justify-between">
            <div>
              {/* Service & Completion Date row */}
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <span className="inline-flex items-center gap-1 text-gold-soft">
                  <Tag className="h-3 w-3" />
                  {item.serviceLabel || 'Detailing'}
                </span>
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.createdAt)}
                </span>
              </div>

              {/* Title / Vehicle Year Make Model */}
              <h3 className="mt-2 text-base font-black tracking-tight text-white uppercase line-clamp-1">
                {item.vehicleLabel || 'Premium Transformation'}
              </h3>

              {/* Quick badges */}
              <div className="mt-2 flex flex-wrap gap-2">
                {item.vehicleClass && (
                  <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                    <Car className="h-2.5 w-2.5" />
                    {item.vehicleClass.replace('_', ' ')}
                  </span>
                )}
                {item.featured && (
                  <span className="rounded bg-gold/10 border border-gold/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-soft">
                    Featured
                  </span>
                )}
              </div>
            </div>

            {/* Link to detail page */}
            <div className="mt-5 pt-3 border-t border-white/5">
              <Link
                href={`/gallery/${item.id}`}
                className="inline-flex w-full items-center justify-between rounded-xl bg-gold/10 hover:bg-gold/20 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft hover:text-white transition duration-300"
              >
                <span>Read Full Story</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
