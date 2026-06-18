'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from 'lucide-react';
import type { PublicGalleryItem } from '@/lib/gallery-normalize';
import { publicGalleryDisplayTitle } from '@/lib/gallery-normalize';
import { BeforeAfterSlider } from './before-after-slider';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function TransformationLightbox({
  items,
  activeIndex,
  onClose,
  onIndex,
}: {
  items: PublicGalleryItem[];
  activeIndex: number;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const item = items[activeIndex];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  const go = (dir: -1 | 1) => {
    if (items.length <= 1) return;
    onIndex((activeIndex + dir + items.length) % items.length);
    setZoom(1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item) return null;

  const before = str(item.beforeUrl);
  const after = str(item.afterUrl || item.url);
  const hasPair = before && after && before !== after;
  const caption = publicGalleryDisplayTitle(item) || item.vehicleLabel || 'Gloss Boss transformation';

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col overflow-hidden bg-black/95 p-3 text-white backdrop-blur-xl sm:p-5"
      role="dialog"
      aria-modal="true"
      onTouchStart={(event) => {
        if (event.touches.length === 1) touchStart.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || event.changedTouches.length !== 1) return;
        const end = event.changedTouches[0]!;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx > 0 ? -1 : 1);
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-soft">{activeIndex + 1} / {items.length}</p>
            <h3 className="mt-1 truncate text-base font-black uppercase tracking-tight text-white sm:text-2xl">{caption}</h3>
            <p className="truncate text-xs text-zinc-500">{item.serviceLabel || 'Detailing'} {item.vehicleLabel ? `- ${item.vehicleLabel}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setZoom((v) => Math.max(1, v - 0.25))} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/60 text-zinc-200">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setZoom((v) => Math.min(2.5, v + 0.25))} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/60 text-zinc-200">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-gold/30 bg-black/70 text-gold-soft">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-gold/20 bg-zinc-950">
          {hasPair ? (
            <div className="h-full w-full origin-center transition-transform duration-200" style={{ transform: `scale(${zoom})` }}>
              <BeforeAfterSlider beforeUrl={before} afterUrl={after} aspectRatio="h-full" watermark={item.watermark} className="h-full rounded-none border-0" />
            </div>
          ) : (
            <img
              src={after}
              alt={caption}
              draggable={false}
              className="h-full w-full select-none object-contain transition-transform duration-200 pointer-events-none"
              style={{ transform: `scale(${zoom})` }}
            />
          )}
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-200">
            <Maximize2 className="h-3 w-3 text-gold-soft" /> Swipe or drag
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => go(-1)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase text-zinc-200">
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <button type="button" onClick={() => setZoom(1)} className="min-h-12 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase text-zinc-300">
            Reset
          </button>
          <button type="button" onClick={() => go(1)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
