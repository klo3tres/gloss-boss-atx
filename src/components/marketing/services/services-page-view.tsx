'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Compass, ShieldCheck, Star, Zap } from 'lucide-react';
import { FleetInquiryForm } from '@/components/public/fleet-inquiry-form';
import { OffersMarketingBand } from '@/components/marketing/offers-marketing-band';
import { ServicePackageShowcase } from '@/components/marketing/service-package-showcase';
import { PremiumButton } from '@/components/premium/premium-button';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';
import { StickyBookCta } from '@/components/premium/sticky-book-cta';
import { usePublicSiteData } from '@/hooks/use-public-site-data';
import { serviceCategoryFilter } from '@/lib/marketing/service-presentation';
import { isOfferEligiblePublicSiteData } from '@/lib/public-site-data';
import { PRICING_DISCLAIMER, PRICING_DISCOUNT_RULES } from '@/lib/site-config';
import { ReviewsCarousel } from '@/components/marketing/reviews-carousel';
import { MotionFade } from '@/components/marketing/motion-fade';

type ServiceTab = 'all' | 'exterior' | 'interior' | 'full' | 'ceramic';

const TABS: { id: ServiceTab; label: string }[] = [
  { id: 'all', label: 'All services' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
  { id: 'full', label: 'Full detail' },
  { id: 'ceramic', label: 'Ceramic' },
];

export function ServicesPageView() {
  const state = usePublicSiteData();
  const { packages, offers, loaded, schemaWarnings, mediaRegistry, fleetEnabled, fleetBlurb, fleetPricing, reviews, googleReviewUrl } = state;

  const [activeTab, setActiveTab] = useState<ServiceTab>('all');
  const filtered = packages.filter((s) => serviceCategoryFilter(s, activeTab));
  const hasOffers = offers.some((o) => o.showOnServices && isOfferEligiblePublicSiteData(o, new Date()));

  return (
    <main className="gb-page gb-page-pad min-h-screen bg-black text-foreground">
      <StickyBookCta />

      <section className="relative overflow-hidden border-b border-white/5 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(212,175,55,0.18),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl">
          <MotionFade>
            <PremiumEyebrow>Service menu</PremiumEyebrow>
            <h1 className="mt-4 max-w-3xl text-4xl font-black uppercase tracking-tight text-white sm:text-6xl">
              Every package. <span className="gb-text-gold-gradient">One standard.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Hero imagery, clear inclusions, duration, starting price, recommended add-ons, and member savings — book in
              two taps.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PremiumButton href="/book">Book now</PremiumButton>
              <PremiumButton href="/memberships" variant="secondary">
                Member savings
              </PremiumButton>
            </div>
          </MotionFade>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, label: 'Licensed & insured', desc: 'Professional mobile operation' },
              { icon: Star, label: '5-star rated', desc: 'Real Austin client reviews' },
              { icon: Zap, label: 'Online booking', desc: 'Secure Stripe deposit' },
            ].map((item) => (
              <div
                key={item.label}
                className="gb-premium-card rounded-2xl border border-white/10 p-5"
              >
                <item.icon className="h-5 w-5 text-gold-soft" />
                <p className="mt-3 text-xs font-black uppercase text-white">{item.label}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {schemaWarnings.length > 0 ? (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{schemaWarnings[0]}</p>
          </div>
        </div>
      ) : null}

      {hasOffers ? <OffersMarketingBand offers={offers} placement="services" /> : null}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                activeTab === tab.id
                  ? 'border-gold/40 bg-gold/15 text-gold-soft'
                  : 'border-white/10 text-zinc-500 hover:border-white/20 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-12" aria-busy={!loaded}>
          {filtered.map((service, index) => (
            <ServicePackageShowcase
              key={service.id}
              service={service}
              mediaRegistry={mediaRegistry}
              index={index}
              reverse={index % 2 === 1}
            />
          ))}
        </div>

        {loaded && filtered.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-zinc-950 p-8 text-center text-sm text-zinc-400">
            No services in this category yet.{' '}
            <button type="button" onClick={() => setActiveTab('all')} className="text-gold-soft underline">
              View all
            </button>
          </p>
        ) : null}
      </section>

      {reviews.length > 0 ? (
        <section className="border-t border-white/5 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <PremiumEyebrow>Reviews</PremiumEyebrow>
            <ReviewsCarousel reviews={reviews} googleReviewUrl={googleReviewUrl} bookingHref="/book" />
          </div>
        </section>
      ) : null}

      <section className="border-t border-white/5 bg-zinc-950/80 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <PremiumEyebrow>Pricing notes</PremiumEyebrow>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">{PRICING_DISCLAIMER}</p>
          <p className="mt-3 max-w-3xl text-xs text-zinc-500">{PRICING_DISCOUNT_RULES}</p>
        </div>
      </section>

      {fleetEnabled ? (
        <section className="border-t border-white/5 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
            <div>
              <PremiumEyebrow>Fleet & commercial</PremiumEyebrow>
              <h2 className="mt-4 text-3xl font-black uppercase text-white">Volume pricing</h2>
              <p className="mt-4 text-sm text-zinc-400">{fleetBlurb || 'Recurring fleet detailing for Austin businesses.'}</p>
              {fleetPricing ? (
                <ul className="mt-6 space-y-2 text-xs text-zinc-400">
                  <li>{fleetPricing.smallLabel}: {fleetPricing.smallDetail}</li>
                  <li>{fleetPricing.mediumLabel}: {fleetPricing.mediumDetail}</li>
                  <li>{fleetPricing.largeLabel}: {fleetPricing.largeDetail}</li>
                </ul>
              ) : null}
              <Link href="/fleet" className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase text-gold-soft">
                <Compass className="h-4 w-4" /> Fleet page
              </Link>
            </div>
            <FleetInquiryForm />
          </div>
        </section>
      ) : null}

      <section className="border-t border-white/5 py-20 text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="text-3xl font-black uppercase text-white">Ready to book?</h2>
          <p className="mt-3 text-sm text-zinc-400">Pick your package and reserve your slot with a secure deposit.</p>
          <div className="mt-8">
            <PremiumButton href="/book">Start booking</PremiumButton>
          </div>
        </div>
      </section>
    </main>
  );
}
