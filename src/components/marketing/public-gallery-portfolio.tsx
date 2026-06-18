'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, Sparkles, Tag, Car, Calendar, SlidersHorizontal, ArrowRight, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [slider, setSlider] = useState(50);
  const [zoomed, setZoomed] = useState(false);

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
                  <TransformationCard key={img.id} img={img} onOpen={() => {
                    setActiveIndex(filteredItems.findIndex((item) => item.id === img.id));
                    setSlider(50);
                    setZoomed(false);
                  }} />
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
                  <TransformationCard key={img.id} img={img} onOpen={() => {
                    setActiveIndex(filteredItems.findIndex((item) => item.id === img.id));
                    setSlider(50);
                    setZoomed(false);
                  }} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {activeIndex != null && filteredItems[activeIndex] ? (
        <GalleryModal
          item={filteredItems[activeIndex]}
          index={activeIndex}
          total={filteredItems.length}
          slider={slider}
          zoomed={zoomed}
          onSlider={setSlider}
          onZoom={() => setZoomed((v) => !v)}
          onClose={() => setActiveIndex(null)}
          onPrev={() => {
            setActiveIndex((activeIndex - 1 + filteredItems.length) % filteredItems.length);
            setSlider(50);
            setZoomed(false);
          }}
          onNext={() => {
            setActiveIndex((activeIndex + 1) % filteredItems.length);
            setSlider(50);
            setZoomed(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TransformationCard({ img, onOpen }: { img: PublicGalleryItem; onOpen: () => void }) {
  const before = str(img.beforeUrl);
  const after = str(img.afterUrl || img.url);
  const rawCaption = publicGalleryDisplayTitle(img);
  const caption = rawCaption.trim() ? rawCaption : 'Gloss Boss Detailing';

  const hasSlider = before && after && before !== after;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block overflow-hidden gb-premium-card gb-luxury-card-hover rounded-3xl border border-gold/15 bg-black text-left shadow-[0_0_35px_rgba(212,175,55,0.03)] transition duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-[0_0_44px_rgba(212,175,55,0.16)]"
    >
      {/* Before/After Split Preview or Single image */}
      {hasSlider ? (
        <div className="grid grid-cols-2 gap-[1px] bg-white/5 relative aspect-[4/3] overflow-hidden">
          <span className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-gold/35 bg-black/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-gold-soft opacity-95 backdrop-blur transition group-hover:bg-gold group-hover:text-black">
            <ZoomIn className="h-3 w-3" /> Expand
          </span>
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
          <span className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-gold/35 bg-black/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-gold-soft opacity-95 backdrop-blur transition group-hover:bg-gold group-hover:text-black">
            <ZoomIn className="h-3 w-3" /> Expand
          </span>
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
    </button>
  );
}

function GalleryModal({
  item,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  item: PublicGalleryItem;
  index: number;
  total: number;
  slider: number;
  zoomed: boolean;
  onSlider: (value: number) => void;
  onZoom: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const before = str(item.beforeUrl);
  const after = str(item.afterUrl || item.url);
  const caption = publicGalleryDisplayTitle(item) || 'Gloss Boss transformation';
  const hasPair = before && after && before !== after;
  const bookingHref = (() => {
    const hay = `${item.serviceLabel ?? ''} ${item.caption ?? ''} ${item.vehicleLabel ?? ''}`.toLowerCase();
    if (hay.includes('fleet') || hay.includes('commercial')) return '/fleet#fleet-inquiry';
    if (hay.includes('ceramic') || hay.includes('coating')) return '/book?service=ceramic-coating&package=ceramic-coating';
    if (hay.includes('interior')) return '/book?service=interior-detail&package=interior-detail';
    if (hay.includes('exterior')) return '/book?service=exterior-detail&package=exterior-detail';
    if (hay.includes('full')) return '/book?service=full-detail&package=full-detail';
    return '/book';
  })();

  // Local Zoom/Pan/ViewMode states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sliderVal, setSliderVal] = useState(50);
  const [viewMode, setViewMode] = useState<'slider' | 'before' | 'after'>(hasPair ? 'slider' : 'after');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [swapped, setSwapped] = useState(false);
  const [beforeOffset, setBeforeOffset] = useState({ x: 0, y: 0 });
  const [beforeScale, setBeforeScale] = useState(1);
  const [showAlignTools, setShowAlignTools] = useState(false);

  const imgBefore = swapped ? after : before;
  const imgAfter = swapped ? before : after;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Reset zoom/pan when active item changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSliderVal(50);
    setViewMode(hasPair ? 'slider' : 'after');
    setSwapped(false);
    setBeforeOffset({ x: 0, y: 0 });
    setBeforeScale(1);
  }, [item.id, hasPair]);

  // Track container width for slider alignment
  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [item.id]);

  const handleZoomIn = () => {
    setZoom((z) => Math.min(3, z + 0.5));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const nextZ = Math.max(1, z - 0.5);
      if (nextZ === 1) setPan({ x: 0, y: 0 });
      return nextZ;
    });
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBeforeOffset({ x: 0, y: 0 });
    setBeforeScale(1);
    setSwapped(false);
  };

  // Drag and Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 || e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0]!;
    setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const cursorClass = zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default';

  return (
    <div className="fixed inset-0 z-[120] bg-black/95 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        {/* Header Controls */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">{index + 1} / {total}</p>
            <h3 className="mt-1 text-lg font-black uppercase text-white sm:text-2xl">{caption}</h3>
            <p className="text-xs text-zinc-500">{item.vehicleLabel || 'Vehicle'} - {item.serviceLabel || 'Detailing'}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Before / After toggle controls */}
            {hasPair && (
              <div className="flex rounded-xl border border-white/10 bg-black/60 p-1">
                {(['before', 'after', 'slider'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                      viewMode === mode ? 'bg-gold text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}

            {/* Alignment Tools Toggle */}
            {hasPair && (
              <button
                type="button"
                onClick={() => setShowAlignTools(!showAlignTools)}
                className={`rounded-xl border p-3 text-xs font-bold uppercase transition flex items-center gap-1.5 ${
                  showAlignTools ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-200 hover:border-gold/40'
                }`}
                title="Toggle Alignment Tools"
              >
                <SlidersHorizontal className="h-4 w-4" /> Align
              </button>
            )}

            {/* Zoom Controls */}
            <div className="flex rounded-xl border border-white/10 bg-black/60 p-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-mono font-bold text-white flex items-center justify-center min-w-[40px]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            {(zoom > 1 || beforeOffset.x !== 0 || beforeOffset.y !== 0 || beforeScale !== 1 || swapped) && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-white/10 p-3 text-zinc-200 hover:border-gold/40 hover:text-white transition flex items-center gap-1.5 text-xs font-bold uppercase"
                title="Reset Pan, Zoom & Alignment"
              >
                <RefreshCw className="h-4 w-4" /> Reset
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 p-3 text-zinc-200 hover:border-gold/40 hover:text-white transition"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
            <a
              href={bookingHref}
              className="rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black hover:bg-gold-light transition"
            >
              {bookingHref.startsWith('/fleet') ? 'Request fleet quote' : 'Book this service'}
            </a>
          </div>
        </div>

        {/* Collapsible Alignment Panel */}
        {showAlignTools && hasPair && (
          <div className="mb-3 rounded-2xl border border-gold/30 bg-black/80 p-4 text-white backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSwapped(!swapped)}
                  className={`rounded-lg border px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                    swapped ? 'bg-gold/20 border-gold text-gold-soft shadow-[0_0_10px_rgba(212,175,55,0.15)]' : 'border-white/15 text-zinc-300 hover:border-white/30'
                  }`}
                >
                  Swap Left / Right
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBeforeOffset({ x: 0, y: 0 });
                    setBeforeScale(1);
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold uppercase text-zinc-400 hover:text-white hover:border-white/30"
                >
                  Reset Offset
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                {/* Horizontal Shift */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Shift X:</span>
                  <input
                    type="range"
                    min="-150"
                    max="150"
                    value={beforeOffset.x}
                    onChange={(e) => setBeforeOffset((prev) => ({ ...prev, x: Number(e.target.value) }))}
                    className="w-24 accent-gold bg-zinc-800 rounded-lg appearance-none h-1.5"
                  />
                  <span className="text-xs font-mono text-gold-soft w-8 text-right">{beforeOffset.x}px</span>
                </div>

                {/* Vertical Shift */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Shift Y:</span>
                  <input
                    type="range"
                    min="-150"
                    max="150"
                    value={beforeOffset.y}
                    onChange={(e) => setBeforeOffset((prev) => ({ ...prev, y: Number(e.target.value) }))}
                    className="w-24 accent-gold bg-zinc-800 rounded-lg appearance-none h-1.5"
                  />
                  <span className="text-xs font-mono text-gold-soft w-8 text-right">{beforeOffset.y}px</span>
                </div>

                {/* Scaling */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Scale Left:</span>
                  <input
                    type="range"
                    min="0.8"
                    max="2"
                    step="0.01"
                    value={beforeScale}
                    onChange={(e) => setBeforeScale(Number(e.target.value))}
                    className="w-24 accent-gold bg-zinc-800 rounded-lg appearance-none h-1.5"
                  />
                  <span className="text-xs font-mono text-gold-soft w-10 text-right">{Math.round(beforeScale * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Viewport container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-gold/20 bg-zinc-950 select-none ${cursorClass}`}
        >
          {viewMode === 'slider' && hasPair ? (
            <>
              {/* Right side/background (After image). The frame is hard-masked so pan/zoom never bleeds outside. */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                <img
                  src={imgAfter}
                  alt="After"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
                  style={{
                    transform: `scale(${zoom}) translate3d(${pan.x / zoom}px, ${pan.y / zoom}px, 0px)`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                  }}
                />
              </div>

              {/* Left side clipped reveal (Before image). This is the only image reveal boundary. */}
              <div
                className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none select-none"
                style={{
                  width: `${sliderVal}%`,
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: containerWidth ? `${containerWidth}px` : '100vw' }}
                >
                  <img
                    src={imgBefore}
                    alt="Before"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none max-w-none"
                    style={{
                      transform: `scale(${zoom * beforeScale}) translate3d(${(pan.x + beforeOffset.x) / zoom}px, ${(pan.y + beforeOffset.y) / zoom}px, 0px)`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                    }}
                  />
                </div>
              </div>

              {/* Slider Line Overlay */}
              <div
                className="absolute inset-y-0 w-[2px] bg-gold shadow-[0_0_18px_rgba(212,175,55,0.9)] z-10"
                style={{ left: `${sliderVal}%` }}
              >
                <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold bg-black px-3 py-2 text-xs font-black text-gold-soft">
                  DRAG
                </span>
              </div>

              {/* Range Input (only interactive when not zoomed to avoid click-conflict with pan drag) */}
              {zoom <= 1 && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderVal}
                  onChange={(e) => setSliderVal(Number(e.target.value))}
                  className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
                />
              )}
              
              <span className="absolute bottom-4 left-4 rounded-lg bg-black/75 px-3 py-1 text-[10px] font-black uppercase text-amber-200 z-10 pointer-events-none select-none">
                Before
              </span>
              <span className="absolute bottom-4 right-4 rounded-lg bg-gold px-3 py-1 text-[10px] font-black uppercase text-black z-10 pointer-events-none select-none">
                After
              </span>
            </>
          ) : viewMode === 'before' && hasPair ? (
            <img
              src={imgBefore}
              alt="Before"
              draggable={false}
              className="h-full w-full object-contain pointer-events-none select-none"
              style={{
                transform: `scale(${zoom * beforeScale}) translate3d(${(pan.x + beforeOffset.x) / zoom}px, ${(pan.y + beforeOffset.y) / zoom}px, 0px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          ) : (
            <img
              src={imgAfter}
              alt={caption}
              draggable={false}
              className="h-full w-full object-contain pointer-events-none select-none"
              style={{
                transform: `scale(${zoom}) translate3d(${pan.x / zoom}px, ${pan.y / zoom}px, 0px)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          )}

          {item.watermark && (
            <img
              src="/brand/glossboss-clean-logo.png"
              alt=""
              className="pointer-events-none absolute bottom-4 right-4 h-10 w-auto opacity-20 z-10 select-none"
            />
          )}
        </div>

        {/* Footer controls */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase text-zinc-200 hover:border-gold/40 hover:text-white transition"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black hover:bg-gold-light transition"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
