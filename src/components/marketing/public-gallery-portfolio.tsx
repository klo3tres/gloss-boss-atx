'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Tag, Car, Calendar, SlidersHorizontal, ArrowRight } from 'lucide-react';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';
import { publicGalleryDisplayTitle } from '@/lib/gallery-normalize';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'Recent';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recent';
  }
};

export function PublicGalleryPortfolio() {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBodyStyle, setSelectedBodyStyle] = useState('all');

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
    { id: 'all', label: 'All Services' },
    { id: 'ceramic', label: 'Ceramic Coating' },
    { id: 'full-detail', label: 'Full Detail' },
    { id: 'interior', label: 'Interior' },
    { id: 'exterior', label: 'Exterior' },
  ];

  const BODY_STYLES = [
    { id: 'all', label: 'All Vehicles' },
    { id: 'sedan', label: 'Sedans' },
    { id: 'suv', label: 'SUVs' },
    { id: 'truck', label: 'Trucks' },
  ];


  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Text Search Filter
      const searchLower = searchQuery.toLowerCase().trim();
      if (searchLower) {
        const vehicle = str(item.vehicleLabel).toLowerCase();
        const service = str(item.serviceLabel).toLowerCase();
        const caption = str(item.caption).toLowerCase();
        const bodyClass = str(item.vehicleClass).toLowerCase();

        const matchesSearch = 
          vehicle.includes(searchLower) ||
          service.includes(searchLower) ||
          caption.includes(searchLower) ||
          bodyClass.includes(searchLower);

        if (!matchesSearch) return false;
      }

      // 2. Service Category Filter
      if (selectedCategory !== 'all') {
        const serviceLabel = str(item.serviceLabel || item.caption || '').toLowerCase();
        
        if (selectedCategory === 'ceramic') {
          if (!serviceLabel.includes('ceramic') && !serviceLabel.includes('coating')) return false;
        } else if (selectedCategory === 'full-detail') {
          if (!serviceLabel.includes('detail') && !serviceLabel.includes('full')) return false;
        } else if (selectedCategory === 'interior') {
          if (!serviceLabel.includes('interior') && !serviceLabel.includes('restore')) return false;
        } else if (selectedCategory === 'exterior') {
          if (!serviceLabel.includes('exterior') && !serviceLabel.includes('correction') && !serviceLabel.includes('paint') && !serviceLabel.includes('polish')) return false;
        }
      }

      // 3. Body Style Filter
      if (selectedBodyStyle !== 'all') {
        const bodyClass = str(item.vehicleClass).toLowerCase();
        const vehicleLabel = str(item.vehicleLabel || item.caption || '').toLowerCase();

        if (selectedBodyStyle === 'sedan') {
          const isSedan = bodyClass.includes('sedan') || vehicleLabel.includes('sedan');
          if (!isSedan) return false;
        } else if (selectedBodyStyle === 'suv') {
          const isSuv = bodyClass.includes('suv') || vehicleLabel.includes('suv') || vehicleLabel.includes('crossover');
          if (!isSuv) return false;
        } else if (selectedBodyStyle === 'truck') {
          const isTruck = bodyClass.includes('truck') || bodyClass.includes('oversized') || vehicleLabel.includes('truck') || vehicleLabel.includes('f150') || vehicleLabel.includes('silverado') || vehicleLabel.includes('ram') || vehicleLabel.includes('tundra');
          if (!isTruck) return false;
        }
      }

      return true;
    });
  }, [items, searchQuery, selectedCategory, selectedBodyStyle]);

  const featured = useMemo(() => filteredItems.filter((i) => i.featured), [filteredItems]);
  const regular = useMemo(() => filteredItems.filter((i) => !i.featured), [filteredItems]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="h-10 w-10 animate-pulse rounded-full border-2 border-gold/40 border-t-gold" />
        <p className="text-sm text-zinc-500">Loading transformations portfolio…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search and Filters Layout */}
      <div className="gb-premium-card rounded-3xl border border-gold/15 bg-black/60 p-4 sm:p-6 space-y-6">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by vehicle (e.g. Porsche, Tesla) or service (e.g. Ceramic)..."
            className="w-full pl-12 pr-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-gold/40 text-sm transition"
          />
        </div>

        {/* Filter Pill Sections */}
        <div className="space-y-4">
          {/* Category Filters */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Service Categories
            </span>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Vehicle Body Style Filters */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Car className="h-3 w-3" /> Vehicle Type
            </span>
            <div className="flex flex-wrap gap-2">
              {BODY_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedBodyStyle(style.id)}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                    selectedBodyStyle === style.id
                      ? 'bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.25)]'
                      : 'border border-white/10 text-zinc-400 hover:border-gold/30'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="gb-glass rounded-3xl border border-gold/20 px-8 py-16 text-center">
          <p className="text-lg font-bold text-white">No transformations found</p>
          <p className="mt-2 text-sm text-zinc-400">
            Try adjusting your search filters or clearing the text search.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedBodyStyle('all');
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-2.5 text-xs font-black uppercase tracking-wider text-black"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Featured Transformations */}
          {featured.length > 0 && (
            <section className="space-y-4">
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">
                <Sparkles className="h-3.5 w-3.5" /> Featured Work
              </span>
              <div className="grid gap-6 sm:grid-cols-2">
                {featured.map((img) => (
                  <TransformationCard key={img.id} img={img} />
                ))}
              </div>
            </section>
          )}

          {/* Regular Transformations Portfolio */}
          {regular.length > 0 && (
            <section className="space-y-4">
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Detailing Portfolio
              </span>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {regular.map((img) => (
                  <TransformationCard key={img.id} img={img} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TransformationCard({ img }: { img: PublicGalleryItem }) {
  const before = str(img.beforeUrl);
  const after = str(img.afterUrl || img.url);
  const rawCaption = publicGalleryDisplayTitle(img);
  const caption = rawCaption.trim() ? rawCaption : 'Gloss Boss Detailing';

  const hasSlider = before && after && before !== after;

  return (
    <Link
      href={`/gallery/${img.id}`}
      className="group block overflow-hidden gb-premium-card gb-luxury-card-hover rounded-3xl border border-gold/15 bg-black text-left shadow-[0_0_35px_rgba(212,175,55,0.03)] hover:border-gold/50 transition duration-300"
    >
      {/* Before/After Split Preview or Single image */}
      {hasSlider ? (
        <div className="grid grid-cols-2 gap-[1px] bg-white/5 relative aspect-[4/3] overflow-hidden">
          <div className="relative h-full w-full">
            <span className="absolute left-2.5 top-2.5 z-10 rounded bg-black/80 border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-300">
              Before
            </span>
            <img
              src={before}
              alt="Before"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            {img.watermark && (
              <img
                src="/brand/glossboss-clean-logo.png"
                alt="Watermark"
                className="absolute right-2 bottom-2 h-4 w-auto opacity-15 pointer-events-none select-none object-contain"
              />
            )}
          </div>
          <div className="relative h-full w-full">
            <span className="absolute left-2.5 top-2.5 z-10 rounded bg-gold/90 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-black">
              After
            </span>
            <img
              src={after}
              alt="After"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            {img.watermark && (
              <img
                src="/brand/glossboss-clean-logo.png"
                alt="Watermark"
                className="absolute right-2 bottom-2 h-4 w-auto opacity-15 pointer-events-none select-none object-contain"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={after}
            alt={caption}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          {img.watermark && (
            <img
              src="/brand/glossboss-clean-logo.png"
              alt="Watermark"
              className="absolute right-3 bottom-3 h-5 w-auto opacity-15 pointer-events-none select-none object-contain"
            />
          )}
        </div>
      )}

      {/* Meta Content */}
      <div className="p-4 border-t border-white/5 flex flex-col justify-between min-h-[110px] bg-gradient-to-t from-black to-zinc-950/80">
        <div>
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            <span className="text-gold-soft">{img.serviceLabel || 'Detailing'}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(img.createdAt)}
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-gold-soft transition">
            {caption}
          </h3>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] font-black uppercase tracking-wider text-gold-soft">
          <span className="flex items-center gap-1 text-zinc-400 font-bold">
            {img.vehicleClass && (
              <>
                <Car className="h-3 w-3" />
                {img.vehicleClass.replace('_', ' ')}
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1 group-hover:translate-x-1 transition duration-200">
            View Story <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
