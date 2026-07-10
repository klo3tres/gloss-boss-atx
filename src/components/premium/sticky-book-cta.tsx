'use client';

import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';

export function StickyBookCta({
  bookingHref = '/book',
  phoneHref = 'tel:+15124812319',
  label = 'Book your detail',
}: {
  bookingHref?: string;
  phoneHref?: string;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="gb-sticky-book-cta fixed inset-x-0 bottom-0 z-[55] border-t border-gold/25 bg-card/95 px-4 py-3 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.08)] sm:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <a
          href={phoneHref}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-gold-soft"
          aria-label="Call Gloss Boss"
        >
          <Phone className="h-4 w-4" />
        </a>
        <Link
          href={bookingHref}
          className="gb-premium-btn inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft py-3.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(212,175,55,0.35)]"
        >
          {label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
