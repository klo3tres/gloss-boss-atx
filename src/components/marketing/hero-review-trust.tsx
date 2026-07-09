'use client';

import Link from 'next/link';
import type { PublicReview } from '@/lib/public-site-data';
import { isGoogleReviewSource } from '@/lib/public-site-data';
import { StarRating } from '@/components/ui/star-rating';

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

  const avg = published.reduce((sum, r) => sum + r.rating, 0) / published.length;
  const hasGoogle = published.some((r) => r.isGoogle || isGoogleReviewSource(r.source));

  return (
    <div
      className={`rounded-2xl border border-gold/20 bg-card/80 backdrop-blur-md ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <StarRating rating={avg} size="md" showValue />
          <span className="text-xs text-muted-foreground sm:text-sm">
            from {published.length} review{published.length === 1 ? '' : 's'}
          </span>
          {hasGoogle ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
              <span className="text-[10px] font-bold text-[#4285F4]">G</span>
              Google
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
              Leave a review
            </a>
          ) : null}
          <Link
            href={bookingHref}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-5 py-2 text-[10px] font-black uppercase tracking-wider text-black hover:brightness-110"
          >
            Book now
          </Link>
        </div>
      </div>
    </div>
  );
}
