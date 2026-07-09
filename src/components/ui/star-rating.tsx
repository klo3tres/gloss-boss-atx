'use client';

import { Star } from 'lucide-react';

function clampRating(rating: number) {
  return Math.min(5, Math.max(0, rating));
}

/** Premium star display — supports fractional averages (e.g. 4.8 shows partial fill). */
export function StarRating({
  rating,
  size = 'md',
  showValue = false,
  className = '',
}: {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  className?: string;
}) {
  const r = clampRating(rating);
  const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4 sm:h-5 sm:w-5';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-0.5" aria-label={`${r} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = Math.min(1, Math.max(0, r - i));
          return (
            <span key={i} className={`relative inline-block ${sizeClass}`}>
              <Star className={`${sizeClass} text-zinc-700/80`} strokeWidth={1.5} />
              {fill > 0 ? (
                <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                  <Star className={`${sizeClass} fill-gold text-gold`} strokeWidth={1.5} />
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {showValue ? <span className="text-lg font-black text-foreground sm:text-xl">{r.toFixed(1)}</span> : null}
    </div>
  );
}
