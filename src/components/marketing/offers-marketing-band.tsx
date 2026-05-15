'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  dedupePublicOffers,
  formatOfferDiscountLabel,
  isOfferEligiblePublicSiteData,
  type SiteDataOfferCard,
} from '@/lib/public-site-data';

type Placement = 'homepage' | 'services';

export function OffersMarketingBand({
  offers,
  placement,
  className = '',
  heading = 'Current offers',
  /** When true, render only promo cards (no wrapper) so parent can own a shared horizontal flex row. */
  embed = false,
}: {
  offers: SiteDataOfferCard[];
  placement: Placement;
  className?: string;
  /** Short label above cards (skipped when empty). */
  heading?: string;
  embed?: boolean;
}) {
  const cards = useMemo(() => {
    const now = new Date();
    const filt =
      placement === 'homepage'
        ? offers.filter((o) => o.showOnHomepage && isOfferEligiblePublicSiteData(o, now))
        : offers.filter((o) => o.showOnServices && isOfferEligiblePublicSiteData(o, now));
    const sorted = [...filt].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    return dedupePublicOffers(sorted);
  }, [offers, placement]);

  if (cards.length === 0) return null;

  const carousel = cards.length > 2;

  const cardClass =
    'group relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-xl border border-gold/35 bg-gradient-to-b from-zinc-950 via-black to-black p-4 shadow-[0_0_22px_rgba(212,166,77,0.12)] ring-1 ring-gold/10 transition duration-300 hover:-translate-y-0.5 hover:border-gold/55 hover:shadow-[0_0_36px_rgba(212,166,77,0.32)]';
  const wide = carousel || embed;

  const inner = cards.map((o) => {
    const href = `/book?offer=${encodeURIComponent((o.slug ?? '').trim() || o.id)}`;
    const discount = formatOfferDiscountLabel(o);
    return (
      <article
        key={o.id}
        className={[cardClass, wide ? 'min-w-[min(100%,268px)] shrink-0 snap-start' : ''].filter(Boolean).join(' ')}
      >
        <div>
          <p className='text-[9px] uppercase tracking-[0.2em] text-gold-soft/90'>Promotion</p>
          <h3 className='mt-1 text-sm font-black uppercase leading-tight text-white sm:text-base'>{o.title}</h3>
          {o.description ? (
            <p className='mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-400'>{o.description}</p>
          ) : null}
          {discount ? (
            <p className='mt-2 text-lg font-black text-gold-soft drop-shadow-[0_0_10px_rgba(212,166,77,0.35)] sm:text-xl'>
              {discount}
            </p>
          ) : null}
          {o.stackable === false ? (
            <p className='mt-2 text-[9px] text-amber-200/85'>Does not stack with other promos.</p>
          ) : null}
        </div>
        <Link
          href={href}
          className='mt-3 inline-flex w-full items-center justify-center rounded-lg bg-gold px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-black transition group-hover:brightness-110'
        >
          Book with this offer
        </Link>
      </article>
    );
  });

  if (embed) {
    return <>{inner}</>;
  }

  return (
    <div className={className}>
      {heading ? <p className='text-[10px] font-bold uppercase tracking-[0.28em] text-gold-soft'>{heading}</p> : null}
      <div
        className={
          carousel
            ? 'mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory [&::-webkit-scrollbar]:hidden'
            : heading
              ? 'mt-3 grid gap-3 sm:grid-cols-2'
              : 'grid gap-3 sm:grid-cols-2'
        }
      >
        {inner}
      </div>
    </div>
  );
}
