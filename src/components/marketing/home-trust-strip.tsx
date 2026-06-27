'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import type { PublicReview } from '@/lib/public-site-data';

type Props = {
  reviews: PublicReview[];
  googleReviewUrl: string;
  bookingHref?: string;
};

export function HomeTrustStrip({ reviews, googleReviewUrl, bookingHref = '/book' }: Props) {
  const published = reviews.filter((r) => r.rating >= 1);
  if (published.length === 0) return null;

  const topThree = published.slice(0, 3);
  const avg =
    Math.round((published.reduce((sum, r) => sum + r.rating, 0) / published.length) * 10) / 10;

  return (
    <section className="border-b border-white/5 bg-gradient-to-b from-zinc-950 to-black py-12">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-gold/20 bg-black/60 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Trusted in Austin</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${i < Math.round(avg) ? 'fill-gold text-gold' : 'text-zinc-700'}`}
                    />
                  ))}
                </div>
                <span className="text-2xl font-black text-white">{avg}</span>
                <span className="text-sm text-zinc-400">from {published.length} reviews</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {googleReviewUrl ? (
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gold/30 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10"
                >
                  Leave a Review
                </a>
              ) : null}
              <Link
                href={bookingHref}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-soft px-6 py-3 text-[10px] font-black uppercase tracking-wider text-black hover:brightness-110"
              >
                Book Now
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {topThree.map((review) => (
              <article key={review.id} className="rounded-2xl border border-white/8 bg-zinc-950/80 p-4">
                <div className="flex gap-0.5 text-gold">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300 line-clamp-4">&ldquo;{review.text}&rdquo;</p>
                <p className="mt-3 text-[10px] font-black uppercase text-zinc-500">{review.reviewerName}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
