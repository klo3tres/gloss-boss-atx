'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PublicReview } from '@/lib/public-site-data';
import { formatReviewerShortName } from '@/lib/review-format';
import { StarRating } from '@/components/ui/star-rating';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';

function formatReviewDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function ReviewsCarousel({
  reviews,
  googleReviewUrl = '',
  bookingHref = '/book',
}: {
  reviews: PublicReview[];
  googleReviewUrl?: string;
  bookingHref?: string;
}) {
  const activeReviews = reviews.filter((r) => r.rating >= 1 && r.text?.trim());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const avg = activeReviews.length
    ? activeReviews.reduce((sum, r) => sum + r.rating, 0) / activeReviews.length
    : 0;

  useEffect(() => {
    if (activeReviews.length <= 1 || paused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % activeReviews.length);
    }, 7000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeReviews.length, paused]);

  if (activeReviews.length === 0) return null;

  const current = activeReviews[index]!;

  return (
    <section
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Client reviews"
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PremiumEyebrow>Client testimonials</PremiumEyebrow>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StarRating rating={avg} size="md" showValue />
            <span className="text-sm text-muted-foreground">
              from {activeReviews.length} Google review{activeReviews.length === 1 ? '' : 's'}
            </span>
          </div>
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

      <div className="relative min-h-[200px] rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id || index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mx-auto max-w-2xl text-center"
          >
            <StarRating rating={current.rating} size="sm" className="justify-center" />
            <p className="mt-4 text-lg font-semibold text-foreground">{formatReviewerShortName(current.reviewerName)}</p>
            <blockquote className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              &ldquo;{current.text}&rdquo;
            </blockquote>
            {(current.vehicleOrService || current.date) && (
              <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {[current.vehicleOrService, formatReviewDate(current.date)].filter(Boolean).join(' · ')}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {activeReviews.length > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-2">
            {activeReviews.map((r, i) => (
              <button
                key={r.id || i}
                type="button"
                aria-label={`Show review ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-8 bg-gold' : 'w-1.5 bg-border hover:bg-gold/40'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
