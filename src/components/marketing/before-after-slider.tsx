'use client';

import { useRef, useState } from 'react';

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
  aspectRatio?: string;
  watermark?: boolean;
};

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  className = '',
  aspectRatio = 'aspect-[4/3]',
  watermark = false,
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, next)));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.preventDefault();
    updateFromClientX(event.clientX);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!dragging || event.touches.length !== 1) return;
    event.preventDefault();
    updateFromClientX(event.touches[0]!.clientX);
  };

  return (
    <div
      ref={railRef}
      className={`relative w-full ${aspectRatio} overflow-hidden rounded-2xl border border-gold/15 bg-zinc-950 touch-pan-y ${
        dragging ? 'cursor-grabbing' : 'cursor-ew-resize'
      } ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={() => setDragging(false)}
      onTouchMove={onTouchMove}
      role="slider"
      aria-label="Before/after image slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(sliderPosition)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setSliderPosition((v) => Math.max(0, v - 5));
        if (event.key === 'ArrowRight') setSliderPosition((v) => Math.min(100, v + 5));
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <img src={afterUrl} alt="After Detailing" draggable={false} className="h-full w-full select-none object-cover pointer-events-none" />
        <span className="gb-before-after-label absolute right-3 top-3 z-10 rounded bg-gold px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black shadow-md">
          After
        </span>
        {watermark && (
          <img
            src="/brand/glossboss-clean-logo.png"
            alt="Gloss Boss logo watermark"
            draggable={false}
            className="absolute bottom-3 right-3 z-10 h-5 w-auto select-none object-contain opacity-15 pointer-events-none"
          />
        )}
      </div>

      <div className="absolute inset-0 overflow-hidden select-none pointer-events-none" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}>
        <img src={beforeUrl} alt="Before Detailing" draggable={false} className="h-full w-full select-none object-cover pointer-events-none" />
        <span className="gb-before-after-label absolute left-3 top-3 z-10 rounded border border-gold/30 bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gold-soft shadow-md">
          Before
        </span>
        {watermark && (
          <img
            src="/brand/glossboss-clean-logo.png"
            alt="Gloss Boss logo watermark"
            draggable={false}
            className="absolute bottom-3 left-3 z-10 h-5 w-auto select-none object-contain opacity-15 pointer-events-none"
          />
        )}
      </div>

      <div
        className="absolute bottom-0 top-0 z-20 w-0.5 bg-gold shadow-[0_0_14px_rgba(212,175,55,0.8)] pointer-events-none"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-black bg-gold shadow-[0_0_20px_rgba(212,175,55,0.7)] sm:h-9 sm:w-9">
          <span className="select-none text-sm font-black text-black pointer-events-none">&lt;&gt;</span>
        </div>
      </div>
    </div>
  );
}
