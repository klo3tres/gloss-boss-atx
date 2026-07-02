'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight, MessageSquare, Quote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PublicReview } from '@/lib/public-site-data';

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeReviews = reviews.filter((r) => r.rating >= 1);

  useEffect(() => {
    if (activeReviews.length <= 1 || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setDirection(1);
      setActiveIndex((prev) => (prev + 1) % activeReviews.length);
    }, 6000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeReviews.length, isPaused]);

  if (activeReviews.length === 0) return null;

  const handleNext = () => {
    setDirection(1);
    setActiveIndex((prev) => (prev + 1) % activeReviews.length);
  };

  const handlePrev = () => {
    setDirection(-1);
    setActiveIndex((prev) => (prev - 1 + activeReviews.length) % activeReviews.length);
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 100 : -100, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 100 : -100, opacity: 0 }),
  };

  const currentReview = activeReviews[activeIndex];

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-gold/15 bg-black/55 p-6 sm:p-8 backdrop-blur-xl shadow-[0_0_50px_rgba(212,175,55,0.08)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="absolute top-4 right-6 text-gold/10 pointer-events-none select-none">
        <Quote size={80} className="transform rotate-180" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gold-soft animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Client testimonials</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase text-zinc-200 hover:border-gold/30"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="font-black text-[#4285F4]">G</span>
                <span className="font-black text-[#EA4335]">o</span>
                <span className="font-black text-[#FBBC05]">o</span>
                <span className="font-black text-[#4285F4]">g</span>
                <span className="font-black text-[#34A853]">l</span>
                <span className="font-black text-[#EA4335]">e</span>
                <span className="ml-1 text-zinc-400">Review</span>
              </span>
            </a>
          ) : null}
          <Link
            href={bookingHref}
            className="rounded-lg bg-gold px-2.5 py-1 text-[10px] font-black uppercase text-black"
          >
            Book now
          </Link>
        </div>
      </div>

      <div className="relative min-h-[160px] flex flex-col justify-between">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentReview.id || activeIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="w-full flex-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < currentReview.rating ? 'fill-gold text-gold' : 'text-zinc-600'}
                    />
                  ))}
                </div>
                {currentReview.isGoogle ? (
                  <span className="rounded-md border border-blue-500/30 bg-blue-950/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-200">
                    Google
                  </span>
                ) : (
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                    Client
                  </span>
                )}
              </div>

              <blockquote className="text-zinc-200 text-sm md:text-base italic leading-relaxed font-medium">
                &ldquo;{currentReview.text}&rdquo;
              </blockquote>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3">
              <div>
                <cite className="not-italic text-xs font-black text-white uppercase tracking-wider block">
                  {currentReview.reviewerName}
                </cite>
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block mt-0.5">
                  {currentReview.vehicleOrService || 'Auto detailing'}
                </span>
              </div>
              {formatReviewDate(currentReview.date) ? (
                <span className="text-[9px] font-mono text-zinc-600 tracking-wider">{formatReviewDate(currentReview.date)}</span>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {activeReviews.length > 1 ? (
        <div className="flex items-center justify-between mt-6 border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5">
            {activeReviews.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setDirection(idx > activeIndex ? 1 : -1);
                  setActiveIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? 'w-5 bg-gold' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:border-gold/30 hover:text-gold-soft hover:bg-gold/5 transition duration-200"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:border-gold/30 hover:text-gold-soft hover:bg-gold/5 transition duration-200"
              aria-label="Next testimonial"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
