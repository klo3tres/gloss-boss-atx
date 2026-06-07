'use client';

import { useState } from 'react';

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
  aspectRatio?: string; // e.g. 'aspect-[4/3]' or 'aspect-[16/10]'
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

  return (
    <div className={`relative w-full ${aspectRatio} overflow-hidden rounded-2xl border border-gold/15 bg-zinc-950 ${className}`}>
      {/* After image is in the background (Right side) */}
      <div className="absolute inset-0">
        <img
          src={afterUrl}
          alt="After Detailing"
          className="h-full w-full object-cover select-none pointer-events-none"
        />
        <span className="absolute right-3 top-3 z-10 rounded bg-gold px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black shadow-md">
          After
        </span>
        {watermark && (
          <img
            src="/brand/glossboss-clean-logo.png"
            alt="Gloss Boss logo watermark"
            className="absolute right-3 bottom-3 z-10 h-5 w-auto opacity-15 pointer-events-none select-none object-contain"
          />
        )}
      </div>

      {/* Before image is clipped on top (Left side) */}
      <div
        className="absolute inset-0 select-none pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={beforeUrl}
          alt="Before Detailing"
          className="h-full w-full object-cover select-none pointer-events-none"
        />
        <span className="absolute left-3 top-3 z-10 rounded bg-black/80 border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-300">
          Before
        </span>
        {watermark && (
          <img
            src="/brand/glossboss-clean-logo.png"
            alt="Gloss Boss logo watermark"
            className="absolute left-3 bottom-3 z-10 h-5 w-auto opacity-15 pointer-events-none select-none object-contain"
          />
        )}
      </div>

      {/* Slider Line and Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-gold z-20 pointer-events-none shadow-[0_0_12px_rgba(212,175,55,0.7)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gold border-2 border-black flex items-center justify-center shadow-[0_0_16px_rgba(212,175,55,0.6)]">
          <span className="text-black text-sm font-black select-none pointer-events-none">↔</span>
        </div>
      </div>

      {/* Invisible Interactive Range Input Overlays the entire component */}
      <input
        type="range"
        min="0"
        max="100"
        value={sliderPosition}
        onChange={(e) => setSliderPosition(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30 touch-none"
        aria-label="Before/after image slider"
      />
    </div>
  );
}
