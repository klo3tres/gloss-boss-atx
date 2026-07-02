'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import type { PublicReview } from '@/lib/public-site-data';
import { isGoogleReviewSource } from '@/lib/public-site-data';

export function HeroReviewTrust({
  reviews,
  googleReviewUrl,
  bookingHref = '/book',
  compact = false,
}: {
  reviews: PublicReview[];
  googleReviewUrl: string;
  bookingHref?: string;
  compact?: boolean;
}) {
  const published = reviews.filter((r) => r.rating >= 1);
  if (published.length === 0) return null;

  const avg =
    Math.round((published.reduce((sum, r) => sum + r.rating, 0) / published.length) * 10) / 10;
  const hasGoogle = published.some((r) => r.isGoogle || isGoogleReviewSource(r.source));

  return (
    <div
      className={`rounded-2xl border border-gold/20 bg-black/55 backdrop-blur-md ${
        compact ? 'mt-6 p-4' : 'p-5 sm:p-6'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 sm:h-5 sm:w-5 ${i < Math.round(avg) ? 'fill-gold text-gold' : 'text-zinc-700'}`}
              />
            ))}
          </div>
          <span className="text-xl font-black text-white sm:text-2xl">{avg}</span>
          <span className="text-xs text-zinc-400 sm:text-sm">
            from {published.length} review{published.length === 1 ? '' : 's'}
          </span>
          {hasGoogle ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-200">
              <span className="text-[10px] font-bold text-[#4285F4]">G</span>
              Google reviews
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10"
            >
              Leave a Review
            </a>
          ) : null}
          <Link
            href={bookingHref}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-5 py-2 text-[10px] font-black uppercase tracking-wider text-black hover:brightness-110"
          >
            Book Now
          </Link>
        </div>
      </div>

      {!compact ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {published.slice(0, 3).map((review) => (
            <article key={review.id} className="rounded-xl border border-white/8 bg-zinc-950/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-0.5 text-gold">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-current" />
                  ))}
                </div>
                {review.isGoogle || isGoogleReviewSource(review.source) ? (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-bold uppercase text-zinc-400">
                    Google
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-300 line-clamp-3">&ldquo;{review.text}&rdquo;</p>
              <p className="mt-2 text-[9px] font-black uppercase text-zinc-500">{review.reviewerName}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
